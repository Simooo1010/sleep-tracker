/**
 * Token di accesso per i Comandi (iOS Shortcuts) verso le API server.
 * Funzioni pure o con dipendenze iniettate: nessun I/O diretto, nessun log.
 * Nel DB si salva solo l'hash HMAC-SHA256 (con pepper da env), mai il token in chiaro.
 */
import { createHmac, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto';

/** Prefisso riconoscibile dei token (utile per secret scanning). */
export const TOKEN_PREFIX = 'st_';
/** Byte casuali per token: 32 byte → 43 caratteri base64url senza padding. */
export const TOKEN_BYTES = 32;
/** Lunghezza minima del pepper HMAC. */
export const MIN_PEPPER_LENGTH = 16;

const TOKEN_RE = /^st_[A-Za-z0-9_-]{43}$/;
const BEARER_SCHEME = 'bearer ';

export type RandomBytesFn = (size: number) => Buffer;

/** Genera un nuovo token `st_` + 32 byte casuali in base64url. */
export function generateToken(randomBytes: RandomBytesFn = nodeRandomBytes): string {
  const bytes = randomBytes(TOKEN_BYTES);
  if (!Buffer.isBuffer(bytes) || bytes.length !== TOKEN_BYTES) {
    throw new Error('randomBytes ha restituito una lunghezza non valida');
  }
  return TOKEN_PREFIX + bytes.toString('base64url');
}

/** HMAC-SHA256 esadecimale del token con il pepper. Lancia se il pepper è assente o troppo corto. */
export function hashToken(raw: string, pepper: string): string {
  assertPepper(pepper);
  return createHmac('sha256', pepper).update(raw, 'utf8').digest('hex');
}

/**
 * Estrae il token da un header `Authorization: Bearer <token>`.
 * Schema case-insensitive, esattamente uno spazio, nessun trim; token col formato atteso, altrimenti null.
 */
export function extractBearer(header: string | null | undefined): string | null {
  if (typeof header !== 'string' || header.length <= BEARER_SCHEME.length) return null;
  if (header.slice(0, BEARER_SCHEME.length).toLowerCase() !== BEARER_SCHEME) return null;
  const token = header.slice(BEARER_SCHEME.length);
  return TOKEN_RE.test(token) ? token : null;
}

/**
 * Confronto a tempo costante tra due stringhe (es. hash esadecimali).
 * Lunghezze diverse → false (la lunghezza di un hash non è un segreto).
 */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * true solo se l'header contiene un token valido il cui hash esiste ed è attivo.
 * Header invalido → false senza interrogare il DB. Errori del DB → false, senza propagare dettagli.
 * Un pepper mancante/corto è un errore di configurazione e lancia sempre.
 */
export async function authenticate(
  header: string | null | undefined,
  pepper: string,
  tokenExists: (hash: string) => Promise<boolean>,
): Promise<boolean> {
  assertPepper(pepper);
  const token = extractBearer(header);
  if (token === null) return false;
  const hash = hashToken(token, pepper);
  try {
    return (await tokenExists(hash)) === true;
  } catch {
    return false;
  }
}

function assertPepper(pepper: string): void {
  if (typeof pepper !== 'string' || pepper.length < MIN_PEPPER_LENGTH) {
    throw new Error(`Pepper del token mancante o più corto di ${MIN_PEPPER_LENGTH} caratteri`);
  }
}
