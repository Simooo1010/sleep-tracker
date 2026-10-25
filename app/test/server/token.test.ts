import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authenticate,
  extractBearer,
  generateToken,
  hashToken,
  MIN_PEPPER_LENGTH,
  safeEqual,
} from '../../src/server/token';

const PEPPER = 'pepper-di-test-abbastanza-lungo';
const OTHER_PEPPER = 'un-altro-pepper-lungo-1234';
const TOKEN_RE = /^st_[A-Za-z0-9_-]{43}$/;

/** Token valido e fisso per i test (43 caratteri dopo il prefisso). */
const VALID = 'st_' + 'A'.repeat(20) + 'b'.repeat(20) + '0-_';

describe('generateToken', () => {
  it('produce st_ + 32 byte in base64url (43 caratteri)', () => {
    const t = generateToken();
    expect(t).toMatch(TOKEN_RE);
    expect(Buffer.from(t.slice(3), 'base64url')).toHaveLength(32);
  });

  it('1000 generazioni sono tutte diverse e valide', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = generateToken();
      expect(t).toMatch(TOKEN_RE);
      set.add(t);
    }
    expect(set.size).toBe(1000);
  });

  it('usa la sorgente casuale iniettata', () => {
    const rb = vi.fn((n: number) => Buffer.alloc(n, 0xff));
    expect(generateToken(rb)).toBe('st_' + Buffer.alloc(32, 0xff).toString('base64url'));
    expect(rb).toHaveBeenCalledWith(32);
  });

  it('rifiuta una sorgente che restituisce la lunghezza sbagliata', () => {
    expect(() => generateToken((n) => Buffer.alloc(n - 1))).toThrow(Error);
  });
});

describe('hashToken', () => {
  it('è stabile, esadecimale a 64 caratteri', () => {
    const h = hashToken(VALID, PEPPER);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(VALID, PEPPER)).toBe(h);
  });

  it('cambia con pepper diverso e con token diverso', () => {
    expect(hashToken(VALID, PEPPER)).not.toBe(hashToken(VALID, OTHER_PEPPER));
    expect(hashToken(VALID, PEPPER)).not.toBe(hashToken(generateToken(), PEPPER));
  });

  it('non contiene il token in chiaro', () => {
    expect(hashToken(VALID, PEPPER)).not.toContain(VALID.slice(3));
  });

  it('lancia con pepper vuoto o più corto di 16 caratteri', () => {
    expect(() => hashToken(VALID, '')).toThrow(Error);
    expect(() => hashToken(VALID, 'x'.repeat(MIN_PEPPER_LENGTH - 1))).toThrow(Error);
    expect(() => hashToken(VALID, 'x'.repeat(MIN_PEPPER_LENGTH))).not.toThrow();
  });
});

describe('extractBearer', () => {
  it('accetta Bearer con schema case-insensitive', () => {
    expect(extractBearer(`Bearer ${VALID}`)).toBe(VALID);
    expect(extractBearer(`bearer ${VALID}`)).toBe(VALID);
    expect(extractBearer(`BEARER ${VALID}`)).toBe(VALID);
    expect(extractBearer(`bEaReR ${VALID}`)).toBe(VALID);
  });

  it('accetta un token generato', () => {
    const t = generateToken();
    expect(extractBearer(`Bearer ${t}`)).toBe(t);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['vuoto', ''],
    ['solo schema', 'Bearer'],
    ['schema e spazio', 'Bearer '],
    ['Basic', `Basic ${VALID}`],
    ['senza schema', VALID],
    ['doppio spazio', `Bearer  ${VALID}`],
    ['tab al posto dello spazio', `Bearer\t${VALID}`],
    ['spazio iniziale', ` Bearer ${VALID}`],
    ['spazio finale', `Bearer ${VALID} `],
    ['newline finale', `Bearer ${VALID}\n`],
    ['schema attaccato', `Bearer${VALID}`],
    ['troppo corto', `Bearer ${VALID.slice(0, -1)}`],
    ['troppo lungo', `Bearer ${VALID}A`],
    ['prefisso sbagliato', `Bearer xx_${VALID.slice(3)}`],
    ['prefisso maiuscolo', `Bearer ST_${VALID.slice(3)}`],
    ['carattere +', `Bearer ${VALID.slice(0, -1)}+`],
    ['carattere /', `Bearer ${VALID.slice(0, -1)}/`],
    ['padding =', `Bearer ${VALID.slice(0, -1)}=`],
    ['carattere non ASCII', `Bearer ${VALID.slice(0, -1)}è`],
    ['due token', `Bearer ${VALID} ${VALID}`],
  ])('rifiuta header %s', (_label, header) => {
    expect(extractBearer(header)).toBeNull();
  });
});

describe('safeEqual', () => {
  it('confronta a tempo costante', () => {
    const h = hashToken(VALID, PEPPER);
    expect(safeEqual(h, hashToken(VALID, PEPPER))).toBe(true);
    expect(safeEqual(h, hashToken(VALID, OTHER_PEPPER))).toBe(false);
    expect(safeEqual(h, h.slice(1))).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('authenticate', () => {
  const logSpies: ReturnType<typeof vi.spyOn>[] = [];

  beforeEach(() => {
    for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
      logSpies.push(vi.spyOn(console, m).mockImplementation(() => undefined));
    }
  });

  afterEach(() => {
    for (const s of logSpies.splice(0)) s.mockRestore();
  });

  function expectNoLogs(): void {
    for (const s of logSpies) expect(s).not.toHaveBeenCalled();
  }

  /** DB in memoria: contiene solo hash, confronto a tempo costante. */
  function dbWith(...rawTokens: string[]) {
    const hashes = rawTokens.map((t) => hashToken(t, PEPPER));
    return vi.fn(async (hash: string) => hashes.some((h) => safeEqual(h, hash)));
  }

  it('true per un token presente nel DB, che riceve solo l\'hash', async () => {
    const db = dbWith(VALID);
    await expect(authenticate(`Bearer ${VALID}`, PEPPER, db)).resolves.toBe(true);
    expect(db).toHaveBeenCalledTimes(1);
    expect(db).toHaveBeenCalledWith(hashToken(VALID, PEPPER));
    expect(db.mock.calls[0]?.[0]).not.toContain(VALID);
    expectNoLogs();
  });

  it('false se il DB dice false', async () => {
    const db = vi.fn(async () => false);
    await expect(authenticate(`Bearer ${VALID}`, PEPPER, db)).resolves.toBe(false);
    expect(db).toHaveBeenCalledTimes(1);
  });

  it('false se il token non è nel DB', async () => {
    const db = dbWith(generateToken());
    await expect(authenticate(`Bearer ${VALID}`, PEPPER, db)).resolves.toBe(false);
  });

  it('false con pepper diverso da quello usato per salvare', async () => {
    const db = dbWith(VALID);
    await expect(authenticate(`Bearer ${VALID}`, OTHER_PEPPER, db)).resolves.toBe(false);
  });

  it.each([null, undefined, '', 'Basic abc', `Bearer  ${VALID}`, `Bearer ${VALID.slice(0, -1)}`])(
    'header invalido %j → false senza chiamare il DB',
    async (header) => {
      const db = vi.fn(async () => true);
      await expect(authenticate(header, PEPPER, db)).resolves.toBe(false);
      expect(db).not.toHaveBeenCalled();
    },
  );

  it('DB che lancia → false, senza propagare né loggare il dettaglio', async () => {
    const db = vi.fn(async (hash: string): Promise<boolean> => {
      throw new Error(`connessione fallita per ${hash} ${VALID}`);
    });
    await expect(authenticate(`Bearer ${VALID}`, PEPPER, db)).resolves.toBe(false);
    expect(db).toHaveBeenCalledTimes(1);
    expectNoLogs();
  });

  it('DB che rifiuta con valore non Error → false', async () => {
    const db = vi.fn(() => Promise.reject('boom'));
    await expect(authenticate(`Bearer ${VALID}`, PEPPER, db)).resolves.toBe(false);
  });

  it('valore truthy non booleano dal DB non autentica', async () => {
    const db = vi.fn(async () => 1 as unknown as boolean);
    await expect(authenticate(`Bearer ${VALID}`, PEPPER, db)).resolves.toBe(false);
  });

  it('pepper corto è un errore di configurazione: lancia senza chiamare il DB né esporre il token', async () => {
    const db = vi.fn(async () => true);
    const err = await authenticate(`Bearer ${VALID}`, 'corto', db).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain(VALID);
    expect(db).not.toHaveBeenCalled();
  });

  it('nessun log in nessun percorso', async () => {
    await authenticate(`Bearer ${VALID}`, PEPPER, dbWith(VALID));
    await authenticate(`Bearer ${VALID}`, PEPPER, async () => false);
    await authenticate('Basic xyz', PEPPER, async () => true);
    await authenticate(`Bearer ${VALID}`, PEPPER, async () => {
      throw new Error(VALID);
    });
    generateToken();
    hashToken(VALID, PEPPER);
    expectNoLogs();
  });
});
