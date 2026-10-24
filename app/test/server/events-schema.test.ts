import { describe, expect, it } from 'vitest';

import type { SignalType } from '../../src/domain/types';
import {
  SIGNAL_TYPES,
  deriveIdempotencyKey,
  parseIncomingEvent,
  parseIsoInstant,
} from '../../src/server/events-schema';

const NOW = new Date('2026-10-24T20:00:00.000Z');

function ok(body: unknown, now: Date = NOW) {
  const r = parseIncomingEvent(body, now);
  if (!r.ok) throw new Error(`atteso ok, errore: ${r.error}`);
  return r.value;
}

function err(body: unknown, now: Date = NOW): string {
  const r = parseIncomingEvent(body, now);
  if (r.ok) throw new Error('atteso errore, ottenuto ok');
  return r.error;
}

describe('parseIncomingEvent — type', () => {
  it.each(SIGNAL_TYPES)('accetta il tipo %s', (type) => {
    const v = ok({ type });
    expect(v.type).toBe(type);
    expect(v.ts).toBe(NOW.toISOString());
  });

  it('copre esattamente i 6 SignalType', () => {
    expect([...SIGNAL_TYPES].sort()).toEqual(
      ['app_open', 'bedtime_candidate', 'evening_check', 'nap_end', 'nap_start', 'wake'].sort(),
    );
  });

  it('è tollerante su spazi e maiuscole', () => {
    expect(ok({ type: '  WAKE ' }).type).toBe('wake');
  });

  it.each([{}, { type: '' }, { type: 'sleep' }, { type: 3 }, { type: null }, { type: ['wake'] }])(
    'rifiuta type mancante o non valido (%j)',
    (body) => {
      expect(err(body)).toMatch(/"type" è obbligatorio/);
    },
  );
});

describe('parseIncomingEvent — ts', () => {
  it('se assente usa now', () => {
    expect(ok({ type: 'wake' }).ts).toBe('2026-10-24T20:00:00.000Z');
  });

  it('stringa vuota o null = assente', () => {
    expect(ok({ type: 'wake', ts: '' }).ts).toBe(NOW.toISOString());
    expect(ok({ type: 'wake', ts: null }).ts).toBe(NOW.toISOString());
  });

  it.each([
    ['2026-10-24T21:30:00+02:00', '2026-10-24T19:30:00.000Z'],
    ['2026-10-24T21:30:00+0200', '2026-10-24T19:30:00.000Z'],
    ['2026-10-24T21:30+02', '2026-10-24T19:30:00.000Z'],
    ['2026-10-24T14:30:00-05:00', '2026-10-24T19:30:00.000Z'],
    ['2026-10-24T19:30:00Z', '2026-10-24T19:30:00.000Z'],
    ['2026-10-24T19:30:00.123456Z', '2026-10-24T19:30:00.123Z'],
    ['2026-10-24 21:30:00+02:00', '2026-10-24T19:30:00.000Z'],
    ['  2026-10-24t19:30:00z ', '2026-10-24T19:30:00.000Z'],
    // offset che fa cambiare giorno
    ['2026-10-25T00:30:00+05:30', '2026-10-24T19:00:00.000Z'],
  ])('normalizza %s in UTC', (input, expected) => {
    expect(ok({ type: 'wake', ts: input }).ts).toBe(expected);
  });

  it.each([
    'domani',
    '2026-10-24',
    '2026-10-24T19:30:00', // senza fuso: ambiguo
    '24/10/2026 19:30',
    '2026-02-30T10:00:00Z',
    '2026-04-31T10:00:00Z',
    '2026-13-01T10:00:00Z',
    '2026-10-24T24:00:00Z',
    '2026-10-24T19:60:00Z',
    '2026-10-24T19:30:00+15:00',
    'Sat Oct 24 2026 19:30:00 GMT+0000',
  ])('rifiuta ts non ISO o inesistente: %s', (ts) => {
    expect(err({ type: 'wake', ts })).toMatch(/"ts" non è una data ISO 8601 valida/);
  });

  it('rifiuta ts non stringa', () => {
    expect(err({ type: 'wake', ts: 1761336000000 })).toMatch(/"ts" deve essere una stringa/);
  });

  it('accetta fino a 5 minuti nel futuro, rifiuta oltre', () => {
    expect(ok({ type: 'wake', ts: '2026-10-24T20:05:00Z' }).ts).toBe('2026-10-24T20:05:00.000Z');
    expect(err({ type: 'wake', ts: '2026-10-24T20:05:01Z' })).toMatch(/futuro di oltre 5 minuti/);
    expect(err({ type: 'wake', ts: '2026-10-25T20:00:00+02:00' })).toMatch(/futuro/);
  });

  it('accetta fino a 7 giorni nel passato, rifiuta oltre', () => {
    expect(ok({ type: 'wake', ts: '2026-10-17T20:00:00Z' }).ts).toBe('2026-10-17T20:00:00.000Z');
    expect(err({ type: 'wake', ts: '2026-10-17T19:59:59Z' })).toMatch(/più vecchio di 7 giorni/);
    expect(err({ type: 'wake', ts: '2020-01-01T00:00:00Z' })).toMatch(/7 giorni/);
  });

  it('la finestra si misura sull\'istante UTC, non sull\'orario locale scritto', () => {
    // 22:04 a +02:00 = 20:04Z: dentro i 5 minuti anche se "22:04" > 20:00
    expect(ok({ type: 'wake', ts: '2026-10-24T22:04:00+02:00' }).ts).toBe('2026-10-24T20:04:00.000Z');
  });

  it('lancia se now non è una Date valida (errore di programmazione)', () => {
    expect(() => parseIncomingEvent({ type: 'wake' }, new Date('x'))).toThrow(TypeError);
  });
});

describe('parseIsoInstant', () => {
  it('gestisce gli anni bisestili', () => {
    expect(parseIsoInstant('2028-02-29T00:00:00Z')?.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(parseIsoInstant('2026-02-29T00:00:00Z')).toBeNull();
  });
});

describe('parseIncomingEvent — idempotencyKey', () => {
  it.each(['wake-2026-10-25', 'abcdefgh', 'A.b_c:d-1', 'x'.repeat(100)])('accetta %s', (key) => {
    expect(ok({ type: 'wake', idempotencyKey: key }).idempotencyKey).toBe(key);
  });

  it('rimuove gli spazi attorno', () => {
    expect(ok({ type: 'wake', idempotencyKey: '  wake-2026-10-25 ' }).idempotencyKey).toBe(
      'wake-2026-10-25',
    );
  });

  it.each(['abcdefg', 'x'.repeat(101), 'wake 2026', 'wake/2026-10', 'sveglia-è-ok', 'a;drop-table', 12345678])(
    'rifiuta %s',
    (key) => {
      expect(err({ type: 'wake', idempotencyKey: key })).toMatch(/"idempotencyKey"/);
    },
  );

  it('se assente la deriva da type + ts al minuto, in modo deterministico', () => {
    const a = ok({ type: 'wake', ts: '2026-10-24T08:30:12+02:00' });
    const b = ok({ type: 'wake', ts: '2026-10-24T06:30:59.999Z' });
    expect(a.idempotencyKey).toBe('wake:2026-10-24T06:30Z');
    expect(b.idempotencyKey).toBe(a.idempotencyKey);
    expect(ok({ type: 'wake', ts: '2026-10-24T06:31:00Z' }).idempotencyKey).toBe('wake:2026-10-24T06:31Z');
    expect(ok({ type: 'nap_start', ts: '2026-10-24T06:30:00Z' }).idempotencyKey).toBe(
      'nap_start:2026-10-24T06:30Z',
    );
  });

  it('derivata da now quando manca anche ts', () => {
    const now = new Date('2026-10-24T20:00:42.500Z');
    expect(ok({ type: 'app_open' }, now).idempotencyKey).toBe('app_open:2026-10-24T20:00Z');
  });

  it('la chiave derivata rispetta il formato delle chiavi', () => {
    for (const t of SIGNAL_TYPES) {
      const key = deriveIdempotencyKey(t as SignalType, NOW.toISOString());
      expect(key).toMatch(/^[A-Za-z0-9:_.-]{8,100}$/);
    }
  });
});

describe('parseIncomingEvent — check', () => {
  it('accetta un check completo su evening_check', () => {
    const v = ok({
      type: 'evening_check',
      check: { tiredness: 4, mood: 2, factors: ['schermo-a-letto', 'caffe'], napMinutesToday: 20 },
    });
    expect(v.check).toEqual({
      tiredness: 4,
      mood: 2,
      factors: ['schermo-a-letto', 'caffe'],
      napMinutesToday: 20,
    });
  });

  it('accetta check parziale o vuoto ed evening_check senza check', () => {
    expect(ok({ type: 'evening_check', check: { mood: 3 } }).check).toEqual({ mood: 3 });
    expect(ok({ type: 'evening_check', check: {} }).check).toEqual({});
    expect(ok({ type: 'evening_check' }).check).toBeUndefined();
  });

  it('tollera numeri come stringhe e campi vuoti', () => {
    const v = ok({
      type: 'evening_check',
      check: { tiredness: '5', mood: ' 1 ', napMinutesToday: '0', factors: [' caffe '] },
    });
    expect(v.check).toEqual({ tiredness: 5, mood: 1, napMinutesToday: 0, factors: ['caffe'] });
    expect(ok({ type: 'evening_check', check: { tiredness: '', mood: null } }).check).toEqual({});
  });

  it.each(SIGNAL_TYPES.filter((t) => t !== 'evening_check'))('rifiuta check sul tipo %s', (type) => {
    expect(err({ type, check: { mood: 3 } })).toMatch(/consentito solo per .*evening_check/);
  });

  it.each([
    ['tiredness', 0, false],
    ['tiredness', 1, true],
    ['tiredness', 5, true],
    ['tiredness', 6, false],
    ['mood', 0, false],
    ['mood', 1, true],
    ['mood', 5, true],
    ['mood', 6, false],
    ['mood', 2.5, false],
    ['mood', 'tre', false],
    ['tiredness', true, false],
  ] as const)('%s = %j → valido: %s', (field, value, valid) => {
    const r = parseIncomingEvent({ type: 'evening_check', check: { [field]: value } }, NOW);
    expect(r.ok).toBe(valid);
    if (!r.ok) expect(r.error).toContain(`"check.${field}" deve essere un numero intero da 1 a 5`);
  });

  it.each([
    [0, true],
    [600, true],
    [-1, false],
    [601, false],
    [12.5, false],
  ])('napMinutesToday = %j → valido: %s', (value, valid) => {
    const r = parseIncomingEvent({ type: 'evening_check', check: { napMinutesToday: value } }, NOW);
    expect(r.ok).toBe(valid);
    if (!r.ok) expect(r.error).toMatch(/napMinutesToday.*da 0 a 600/);
  });

  it('factors: accetta 12 elementi e slug da 40 caratteri', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `fattore-${i}`);
    expect(ok({ type: 'evening_check', check: { factors: twelve } }).check?.factors).toHaveLength(12);
    const long = 'a'.repeat(40);
    expect(ok({ type: 'evening_check', check: { factors: [long] } }).check?.factors).toEqual([long]);
    expect(ok({ type: 'evening_check', check: { factors: [] } }).check?.factors).toEqual([]);
  });

  it('factors: rifiuta più di 12 elementi o non lista', () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => `f-${i}`);
    expect(err({ type: 'evening_check', check: { factors: thirteen } })).toMatch(/al massimo 12/);
    expect(err({ type: 'evening_check', check: { factors: 'caffe' } })).toMatch(/lista/);
  });

  it.each(['a'.repeat(41), 'Caffe', 'schermo_a_letto', 'schermo a letto', '-caffe', 'caffe-', 'a--b', 'caffè', '', 3])(
    'factors: rifiuta l\'elemento %j',
    (item) => {
      expect(err({ type: 'evening_check', check: { factors: [item] } })).toMatch(/"check.factors"/);
    },
  );

  it('rifiuta campi sconosciuti nel check (niente note libere) senza eco', () => {
    const e = err({ type: 'evening_check', check: { mood: 3, note: 'litigato con Marco' } });
    expect(e).toMatch(/"check" contiene un campo non consentito/);
    expect(e).not.toMatch(/note|Marco/);
  });

  it('rifiuta check non oggetto', () => {
    expect(err({ type: 'evening_check', check: [1, 2] })).toMatch(/"check" deve essere un oggetto/);
    expect(err({ type: 'evening_check', check: 'stanco' })).toMatch(/"check" deve essere un oggetto/);
  });
});

describe('parseIncomingEvent — corpo', () => {
  it('rifiuta campi extra senza riportarne nome o valore', () => {
    const e = err({ type: 'wake', note: 'dormito male', password: 'segreta' });
    expect(e).toMatch(/campo non consentito/);
    expect(e).not.toMatch(/note|dormito|password|segreta/);
  });

  it.each([null, undefined, [], [{ type: 'wake' }], 'wake', '{"type":"wake"}', 42, true])(
    'rifiuta corpo non oggetto: %j',
    (body) => {
      expect(err(body)).toBe('Il corpo della richiesta deve essere un oggetto JSON.');
    },
  );

  it('i messaggi non riportano mai i valori inviati', () => {
    const bad = 'VALORE-SEGRETO-123';
    for (const body of [
      { type: bad },
      { type: 'wake', ts: bad },
      { type: 'wake', idempotencyKey: `${bad} !` },
      { type: 'evening_check', check: { factors: [bad] } },
      { type: 'evening_check', check: { mood: bad } },
    ]) {
      expect(err(body)).not.toContain(bad);
    }
  });

  it('il valore restituito ha sempre ts e idempotencyKey e solo i campi noti', () => {
    const v = ok({ type: 'wake', ts: '2026-10-24T08:00:00+02:00', idempotencyKey: 'wake-2026-10-24' });
    expect(v).toEqual({ type: 'wake', ts: '2026-10-24T06:00:00.000Z', idempotencyKey: 'wake-2026-10-24' });
  });
});
