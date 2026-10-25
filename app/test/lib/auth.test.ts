import { describe, expect, it } from 'vitest';

import {
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  authMode,
  checkPassword,
  createSessionCookieValue,
  deriveSessionKey,
  derivePepper,
  getPepper,
  sanitizeNext,
  sessionCookieOptions,
  verifySessionCookieValue,
} from '../../src/lib/auth';

const PASSWORD = 'prova-password-12345';
const NOW = Date.UTC(2026, 9, 25, 8, 0, 0);

describe('authMode', () => {
  it("'off' solo con APP_AUTH=off fuori produzione", () => {
    expect(authMode({ APP_AUTH: 'off', NODE_ENV: 'development' })).toBe('off');
    expect(authMode({ APP_AUTH: 'off', NODE_ENV: 'test' })).toBe('off');
    expect(authMode({ APP_AUTH: 'off' })).toBe('off');
    // anche senza password: è la modalità di sviluppo
    expect(authMode({ APP_AUTH: 'off', APP_LOGIN_PASSWORD: PASSWORD })).toBe('off');
  });

  it("in produzione APP_AUTH=off è ignorato: 'closed' senza password, 'on' con password", () => {
    expect(authMode({ APP_AUTH: 'off', NODE_ENV: 'production' })).toBe('closed');
    expect(authMode({ APP_AUTH: 'off', NODE_ENV: 'production', APP_LOGIN_PASSWORD: PASSWORD })).toBe('on');
  });

  it.each(['OFF', 'Off', 'false', '0', 'no', ' off', 'off ', ''])('APP_AUTH=%j non spegne l\'accesso', (value) => {
    expect(authMode({ APP_AUTH: value })).toBe('closed');
    expect(authMode({ APP_AUTH: value, APP_LOGIN_PASSWORD: PASSWORD })).toBe('on');
  });

  it("'closed' se la password manca, è vuota o più corta di 12 caratteri", () => {
    expect(authMode({})).toBe('closed');
    expect(authMode({ APP_LOGIN_PASSWORD: undefined })).toBe('closed');
    expect(authMode({ APP_LOGIN_PASSWORD: '' })).toBe('closed');
    expect(authMode({ APP_LOGIN_PASSWORD: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) })).toBe('closed');
  });

  it("'on' con password di almeno 12 caratteri", () => {
    expect(authMode({ APP_LOGIN_PASSWORD: 'a'.repeat(MIN_PASSWORD_LENGTH) })).toBe('on');
    expect(authMode({ APP_LOGIN_PASSWORD: PASSWORD, NODE_ENV: 'production' })).toBe('on');
  });
});

describe('chiavi derivate', () => {
  it('sono esadecimali, lunghe 64, deterministiche e diverse tra loro e dalla password', async () => {
    const [key, pepper, key2, pepper2] = await Promise.all([
      deriveSessionKey(PASSWORD),
      derivePepper(PASSWORD),
      deriveSessionKey(PASSWORD),
      derivePepper(PASSWORD),
    ]);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(pepper).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(key2);
    expect(pepper).toBe(pepper2);
    expect(key).not.toBe(pepper);
    expect(key).not.toContain(PASSWORD);
    expect(pepper.length).toBeGreaterThanOrEqual(32);
  });

  it('password diverse → chiavi diverse', async () => {
    expect(await deriveSessionKey(PASSWORD)).not.toBe(await deriveSessionKey(`${PASSWORD}x`));
    expect(await derivePepper(PASSWORD)).not.toBe(await derivePepper(`${PASSWORD}x`));
  });
});

describe('getPepper', () => {
  it('usa INGEST_TOKEN_PEPPER se lungo almeno 16 caratteri', async () => {
    const explicit = 'x'.repeat(16);
    expect(await getPepper({ INGEST_TOKEN_PEPPER: explicit, APP_LOGIN_PASSWORD: PASSWORD })).toBe(explicit);
    expect(await getPepper({ INGEST_TOKEN_PEPPER: explicit })).toBe(explicit);
  });

  it('pepper assente o corto + password valida → pepper derivato', async () => {
    const derived = await derivePepper(PASSWORD);
    expect(await getPepper({ APP_LOGIN_PASSWORD: PASSWORD })).toBe(derived);
    expect(await getPepper({ INGEST_TOKEN_PEPPER: 'x'.repeat(15), APP_LOGIN_PASSWORD: PASSWORD })).toBe(derived);
    expect(await getPepper({ INGEST_TOKEN_PEPPER: '', APP_LOGIN_PASSWORD: PASSWORD })).toBe(derived);
  });

  it('niente pepper utile e niente password valida → null', async () => {
    expect(await getPepper({})).toBeNull();
    expect(await getPepper({ INGEST_TOKEN_PEPPER: 'corto' })).toBeNull();
    expect(await getPepper({ APP_LOGIN_PASSWORD: '' })).toBeNull();
    expect(await getPepper({ APP_LOGIN_PASSWORD: 'breve' })).toBeNull();
  });
});

describe('checkPassword', () => {
  it('true solo per la password esatta', async () => {
    expect(await checkPassword(PASSWORD, PASSWORD)).toBe(true);
    expect(await checkPassword(`${PASSWORD} `, PASSWORD)).toBe(false);
    expect(await checkPassword(PASSWORD.toUpperCase(), PASSWORD)).toBe(false);
    expect(await checkPassword(PASSWORD.slice(0, -1), PASSWORD)).toBe(false);
    expect(await checkPassword('', PASSWORD)).toBe(false);
  });

  it('fail-closed: password configurata vuota → sempre false', async () => {
    expect(await checkPassword('', '')).toBe(false);
    expect(await checkPassword('qualcosa', '')).toBe(false);
  });

  it('gestisce caratteri non ASCII', async () => {
    expect(await checkPassword('pässwörd-Ωmega-123', 'pässwörd-Ωmega-123')).toBe(true);
    expect(await checkPassword('passwörd-Ωmega-123', 'pässwörd-Ωmega-123')).toBe(false);
  });
});

describe('cookie di sessione', () => {
  it('formato v1.<scadenza>.<hmac> e scadenza a 30 giorni', async () => {
    const value = await createSessionCookieValue(PASSWORD, NOW);
    expect(value).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
    expect(value.split('.')[1]).toBe(String(NOW + SESSION_TTL_MS));
    expect(SESSION_TTL_MS).toBe(30 * 24 * 3600 * 1000);
    expect(value).not.toContain(PASSWORD);
  });

  it('valido prima della scadenza, rifiutato alla scadenza e dopo', async () => {
    const value = await createSessionCookieValue(PASSWORD, NOW, 1000);
    expect(await verifySessionCookieValue(value, PASSWORD, NOW)).toBe(true);
    expect(await verifySessionCookieValue(value, PASSWORD, NOW + 999)).toBe(true);
    expect(await verifySessionCookieValue(value, PASSWORD, NOW + 1000)).toBe(false);
    expect(await verifySessionCookieValue(value, PASSWORD, NOW + 10 * SESSION_TTL_MS)).toBe(false);
  });

  it('TTL personalizzato', async () => {
    const value = await createSessionCookieValue(PASSWORD, NOW, 5000);
    expect(value.split('.')[1]).toBe(String(NOW + 5000));
  });

  it('password diversa → rifiutato', async () => {
    const value = await createSessionCookieValue(PASSWORD, NOW);
    expect(await verifySessionCookieValue(value, `${PASSWORD}x`, NOW)).toBe(false);
    expect(await verifySessionCookieValue(value, '', NOW)).toBe(false);
  });

  it('manomesso: scadenza prolungata o firma alterata → rifiutato', async () => {
    const value = await createSessionCookieValue(PASSWORD, NOW, 1000);
    const [v, exp, sig] = value.split('.') as [string, string, string];
    expect(await verifySessionCookieValue(`${v}.${Number(exp) + 10 * SESSION_TTL_MS}.${sig}`, PASSWORD, NOW)).toBe(false);
    const flipped = `${sig.slice(0, -1)}${sig.endsWith('0') ? '1' : '0'}`;
    expect(await verifySessionCookieValue(`${v}.${exp}.${flipped}`, PASSWORD, NOW)).toBe(false);
    expect(await verifySessionCookieValue(`${v}.${exp}.${sig.toUpperCase()}`, PASSWORD, NOW)).toBe(false);
    expect(await verifySessionCookieValue(`v2.${exp}.${sig}`, PASSWORD, NOW)).toBe(false);
  });

  it('formati strani → false senza lanciare', async () => {
    const value = await createSessionCookieValue(PASSWORD, NOW);
    const [, exp, sig] = value.split('.') as [string, string, string];
    const weird: Array<string | null | undefined> = [
      undefined,
      null,
      '',
      '.',
      '..',
      'v1',
      'v1..',
      `v1.${exp}`,
      `v1.${exp}.`,
      `v1..${sig}`,
      `v1.-${exp}.${sig}`,
      `v1.${exp}.5.${sig}`,
      `v1.1e12.${sig}`,
      `v1.0x10.${sig}`,
      `v1.${'9'.repeat(30)}.${sig}`,
      `${value}.extra`,
      ` ${value}`,
      `${value} `,
      `${value}\n`,
      `v1.${exp}.${sig.slice(1)}`,
      `v1.${exp}.${sig}00`,
      'garbage',
      'x'.repeat(10_000),
    ];
    for (const w of weird) {
      expect(await verifySessionCookieValue(w, PASSWORD, NOW), JSON.stringify(w)).toBe(false);
    }
    expect(await verifySessionCookieValue(123 as unknown as string, PASSWORD, NOW)).toBe(false);
  });

  it('opzioni: httpOnly, lax, path /, 30 giorni; secure solo in produzione', () => {
    expect(SESSION_COOKIE).toBe('st_session');
    const dev = sessionCookieOptions({ NODE_ENV: 'development' });
    expect(dev).toEqual({ httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 30 * 24 * 3600 });
    expect(sessionCookieOptions({ NODE_ENV: 'production' }).secure).toBe(true);
    expect(sessionCookieOptions({}).secure).toBe(false);
  });
});

describe('sanitizeNext', () => {
  it.each([
    '/',
    '/regolarita',
    '/storico?mese=2026-10',
    '/grafici#sezione',
    '/a/b/c?x=1&y=2',
    '/segnali',
    '/%2F%2Fevil.com',
    '/evil.com',
    '/http://evil.com',
  ])('accetta il percorso relativo %s', (value) => {
    expect(sanitizeNext(value)).toBe(value);
  });

  it.each([
    'https://evil.com',
    'http://evil.com/x',
    '//evil.com',
    '//evil.com/path',
    '///evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '\\/evil.com',
    '/\\/evil.com',
    '/a\\b',
    'evil.com',
    'regolarita',
    '',
    ' /regolarita',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r\nSet-Cookie: x=1',
    '/ok\u0000',
    '/ok\u007f',
    '/\u0085/evil.com',
    '/ x',
    'javascript:alert(1)',
    'data:text/html,<script>',
    'mailto:a@b.c',
    'file:///etc/passwd',
    '?next=/',
    '#x',
    '/' + 'a'.repeat(2000),
  ])('rifiuta %j → /', (value) => {
    expect(sanitizeNext(value)).toBe('/');
  });

  it('valori non stringa → /', () => {
    for (const v of [undefined, null, 0, 1, {}, [], ['/x'], true]) {
      expect(sanitizeNext(v)).toBe('/');
    }
  });
});
