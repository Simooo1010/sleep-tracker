/**
 * Accesso con password a utente singolo: logica pura, solo Web Crypto (compatibile con edge e Node),
 * nessuna dipendenza. Comportamento FAIL-CLOSED: senza `APP_LOGIN_PASSWORD` valida l'app resta chiusa.
 * Nessuna funzione qui scrive log né restituisce mai la password o le chiavi derivate in un errore.
 */

export type AuthEnv = Readonly<Record<string, string | undefined>>;
export type AuthMode = 'off' | 'closed' | 'on';

/** Nome del cookie di sessione. */
export const SESSION_COOKIE = 'st_session';
/** Durata della sessione: 30 giorni. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Lunghezza minima della password di accesso. */
export const MIN_PASSWORD_LENGTH = 12;
/** Lunghezza minima di un pepper esplicito (come `MIN_PEPPER_LENGTH` di server/token). */
export const MIN_PEPPER_LENGTH = 16;

const SESSION_VERSION = 'v1';
const SESSION_RE = /^v1\.(\d{1,15})\.([0-9a-f]{64})$/;
const LABEL_SESSION = 'sleep-tracker/session-key/v1';
const LABEL_PEPPER = 'sleep-tracker/token-pepper/v1';
const LABEL_CHECK = 'sleep-tracker/password-check/v1';

/**
 * 'off' SOLO con `APP_AUTH=off` fuori produzione (sviluppo e test); 'closed' se la password manca o è
 * troppo corta (nessuno entra, la pagina di accesso spiega la configurazione); altrimenti 'on'.
 */
export function authMode(env: AuthEnv): AuthMode {
  if (env.APP_AUTH === 'off' && env.NODE_ENV !== 'production') return 'off';
  const password = env.APP_LOGIN_PASSWORD;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return 'closed';
  return 'on';
}

// --- Primitive ------------------------------------------------------------------------------

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 esadecimale (64 caratteri) di `message` con chiave `key`. */
async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await globalThis.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
}

/** Confronto a tempo costante rispetto al contenuto (la lunghezza di un hash non è un segreto). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Chiavi derivate ------------------------------------------------------------------------

/** Chiave (esadecimale, 64 caratteri) con cui si firma il cookie di sessione. */
export function deriveSessionKey(password: string): Promise<string> {
  return hmacHex(password, LABEL_SESSION);
}

/** Pepper (esadecimale, 64 caratteri) dei token dei Comandi, derivato dalla password. */
export function derivePepper(password: string): Promise<string> {
  return hmacHex(password, LABEL_PEPPER);
}

/**
 * Pepper dei token: `INGEST_TOKEN_PEPPER` se lungo almeno 16 caratteri, altrimenti derivato dalla password
 * di accesso se valida (>= 12 caratteri), altrimenti null (chi chiama risponde 503).
 */
export async function getPepper(env: AuthEnv): Promise<string | null> {
  const explicit = env.INGEST_TOKEN_PEPPER;
  if (typeof explicit === 'string' && explicit.length >= MIN_PEPPER_LENGTH) return explicit;
  const password = env.APP_LOGIN_PASSWORD;
  if (typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH) return derivePepper(password);
  return null;
}

// --- Password e sessione --------------------------------------------------------------------

/** Confronto a tempo costante: si confrontano gli HMAC delle due stringhe, non le stringhe. */
export async function checkPassword(input: string, password: string): Promise<boolean> {
  if (typeof input !== 'string' || typeof password !== 'string' || password.length === 0) return false;
  const [a, b] = await Promise.all([hmacHex(LABEL_CHECK, input), hmacHex(LABEL_CHECK, password)]);
  return constantTimeEqual(a, b);
}

/** Valore del cookie: `v1.<scadenza in ms epoch>.<hmac>`. */
export async function createSessionCookieValue(
  password: string,
  nowMs: number,
  ttlMs: number = SESSION_TTL_MS,
): Promise<string> {
  const payload = `${SESSION_VERSION}.${Math.trunc(nowMs + ttlMs)}`;
  const signature = await hmacHex(await deriveSessionKey(password), payload);
  return `${payload}.${signature}`;
}

/** true solo per un cookie ben formato, non scaduto e con firma corretta. */
export async function verifySessionCookieValue(
  value: string | null | undefined,
  password: string,
  nowMs: number,
): Promise<boolean> {
  if (typeof value !== 'string' || typeof password !== 'string' || password.length === 0) return false;
  const match = SESSION_RE.exec(value);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt)) return false;
  const expected = await hmacHex(await deriveSessionKey(password), `${SESSION_VERSION}.${expiresAt}`);
  // Prima la firma (tempo costante), poi la scadenza: l'esito non dipende da quale controllo fallisce.
  const signatureOk = constantTimeEqual(expected, match[2] ?? '');
  return signatureOk && expiresAt > nowMs;
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  secure: boolean;
  maxAge: number;
}

/** Opzioni del cookie di sessione (`maxAge` in secondi). `secure` solo in produzione. */
export function sessionCookieOptions(env: AuthEnv): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: env.NODE_ENV === 'production',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

// --- Redirect sicuro ------------------------------------------------------------------------

/**
 * Accetta SOLO percorsi relativi dello stesso sito: iniziano con un singolo '/', senza '//', senza
 * backslash, schemi o caratteri di controllo. Qualsiasi altra cosa → '/'.
 */
export function sanitizeNext(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return '/';
  if (value[0] !== '/' || value[1] === '/' || value[1] === '\\') return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) return '/';
  try {
    const url = new URL(value, 'http://sleep-tracker.invalid');
    if (url.origin !== 'http://sleep-tracker.invalid') return '/';
  } catch {
    return '/';
  }
  return value;
}
