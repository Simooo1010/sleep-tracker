import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET_SLEEP_MIN } from '../../src/domain/types';
import type { Nap, Night, Provenance } from '../../src/domain/types';
import { addDays } from '../../src/domain/time';
import {
  durationBand,
  durationStats,
  monthlyTrend,
  nightDuration,
  sleep24h,
  sleepDebt,
} from '../../src/domain/sleep-balance';

function night(
  nightDate: string,
  bed: string | null,
  wake: string | null,
  extra: Partial<Night> = {},
): Night {
  return {
    nightDate,
    bedAt: { value: bed, provenance: bed === null ? 'mancante' : 'confermato' },
    wakeAt: { value: wake, provenance: wake === null ? 'mancante' : 'confermato' },
    status: bed === null || wake === null ? 'mancante' : 'confermata',
    quality: { value: null, provenance: 'mancante' },
    energy: { value: null, provenance: 'mancante' },
    isException: false,
    factors: [],
    ...extra,
  };
}

/** Notte di `min` minuti con risveglio alle 05:00Z di nightDate. */
function nightOf(nightDate: string, min: number, extra: Partial<Night> = {}): Night {
  const wake = new Date(`${nightDate}T05:00:00Z`);
  const bed = new Date(wake.getTime() - min * 60000);
  return night(nightDate, bed.toISOString(), wake.toISOString(), extra);
}

function missing(nightDate: string): Night {
  return night(nightDate, null, null);
}

function nap(date: string, minutes: number, provenance: Provenance = 'confermato'): Nap {
  return { date, startAt: `${date}T13:00:00Z`, minutes, provenance };
}

const AS_OF = '2026-10-20';

/** Serie di notti consecutive che termina in asOf (la prima durata è la più vecchia). */
function series(asOf: string, durations: Array<number | null>): Night[] {
  return durations.map((d, i) => {
    const date = addDays(asOf, i - (durations.length - 1));
    return d === null ? missing(date) : nightOf(date, d);
  });
}

describe('nightDuration', () => {
  it('calcola i minuti tra letto e risveglio, anche a cavallo di mezzanotte', () => {
    // 23:30 CEST → 07:15 CEST
    expect(nightDuration(night('2026-06-10', '2026-06-09T21:30:00Z', '2026-06-10T05:15:00Z'))).toBe(465);
  });

  it('gestisce un letto dopo mezzanotte (stesso giorno locale del risveglio)', () => {
    // 00:40 → 08:10 CEST
    expect(nightDuration(night('2026-06-10', '2026-06-09T22:40:00Z', '2026-06-10T06:10:00Z'))).toBe(450);
  });

  it('null se manca il letto, il risveglio o entrambi (mai zero, mai stima)', () => {
    expect(nightDuration(night('2026-06-10', null, '2026-06-10T05:00:00Z'))).toBeNull();
    expect(nightDuration(night('2026-06-10', '2026-06-09T21:00:00Z', null))).toBeNull();
    expect(nightDuration(missing('2026-06-10'))).toBeNull();
  });

  it('null se gli orari sono incoerenti (risveglio non successivo al letto)', () => {
    expect(nightDuration(night('2026-06-10', '2026-06-10T05:00:00Z', '2026-06-10T05:00:00Z'))).toBeNull();
    expect(nightDuration(night('2026-06-10', '2026-06-10T06:00:00Z', '2026-06-10T05:00:00Z'))).toBeNull();
  });

  it('usa gli orari stimati così come sono (la provenienza è già marcata)', () => {
    const n = night('2026-06-10', '2026-06-09T22:00:00Z', '2026-06-10T05:00:00Z', {
      bedAt: { value: '2026-06-09T22:00:00Z', provenance: 'stimato' },
      status: 'stimata',
    });
    expect(nightDuration(n)).toBe(420);
  });

  it('cambio ora legale 2026-03-29 (CET→CEST): 23:00 → 07:00 locali sono 7h, non 8h', () => {
    // 23:00 CET = 22:00Z del 28; 07:00 CEST = 05:00Z del 29
    expect(nightDuration(night('2026-03-29', '2026-03-28T22:00:00Z', '2026-03-29T05:00:00Z'))).toBe(420);
  });

  it('cambio ora solare 2026-10-25 (CEST→CET): 23:00 → 07:00 locali sono 9h, non 8h', () => {
    // 23:00 CEST = 21:00Z del 24; 07:00 CET = 06:00Z del 25
    expect(nightDuration(night('2026-10-25', '2026-10-24T21:00:00Z', '2026-10-25T06:00:00Z'))).toBe(540);
  });
});

describe('durationStats', () => {
  it('input vuoto: medie null con copertura 0 e motivo', () => {
    const s = durationStats([], AS_OF);
    expect(s.avg7).toEqual({
      value: null,
      coverage: { used: 0, window: 7 },
      hiddenReason: 'Serve almeno 1 notte. Per ora ne hai 0.',
      exceptionsIncluded: 0,
    });
    expect(s.avgMonth.value).toBeNull();
    expect(s.avgMonth.coverage).toEqual({ used: 0, window: 30 });
  });

  it('media delle ultime 7 notti di calendario, asOf incluso', () => {
    const nights = series(AS_OF, [300, 400, 420, 440, 460, 480, 500, 520]); // la prima è fuori finestra
    const s = durationStats(nights, AS_OF);
    expect(s.avg7.value).toBe(Math.round((400 + 420 + 440 + 460 + 480 + 500 + 520) / 7));
    expect(s.avg7.coverage).toEqual({ used: 7, window: 7 });
    expect(s.avg7.hiddenReason).toBeUndefined();
  });

  it('esclude le notti senza durata e lo dichiara nella copertura', () => {
    const nights = series(AS_OF, [400, null, 420, null, 440, null, 460]);
    const s = durationStats(nights, AS_OF);
    expect(s.avg7.value).toBe(430);
    expect(s.avg7.coverage).toEqual({ used: 4, window: 7 });
  });

  it('le notti-eccezione restano incluse ma sono contate', () => {
    const nights = [
      nightOf('2026-10-20', 480),
      nightOf('2026-10-19', 240, { isException: true }),
      nightOf('2026-10-18', 420),
      nightOf('2026-09-25', 600, { isException: true }), // solo nella media del mese
    ];
    const s = durationStats(nights, AS_OF);
    expect(s.avg7.value).toBe(380);
    expect(s.avg7.exceptionsIncluded).toBe(1);
    expect(s.avgMonth.value).toBe(Math.round((480 + 240 + 420 + 600) / 4));
    expect(s.avgMonth.exceptionsIncluded).toBe(2);
    expect(s.avgMonth.coverage).toEqual({ used: 4, window: 30 });
  });

  it('una notte-eccezione senza orari non conta né come durata né come eccezione inclusa', () => {
    const nights = [nightOf('2026-10-20', 450), { ...missing('2026-10-19'), isException: true }];
    const s = durationStats(nights, AS_OF);
    expect(s.avg7.exceptionsIncluded).toBe(0);
    expect(s.avg7.coverage.used).toBe(1);
  });

  it('finestra di 30 giorni: asOf−29 incluso, asOf−30 escluso', () => {
    const nights = [nightOf(addDays(AS_OF, -29), 400), nightOf(addDays(AS_OF, -30), 100)];
    const s = durationStats(nights, AS_OF);
    expect(s.avgMonth.value).toBe(400);
    expect(s.avgMonth.coverage.used).toBe(1);
    expect(s.avg7.value).toBeNull();
  });

  it('ignora le notti successive ad asOf (nessun Date.now: conta solo il parametro)', () => {
    const nights = [nightOf('2026-10-21', 100), nightOf('2026-10-20', 500)];
    expect(durationStats(nights, AS_OF).avg7.value).toBe(500);
  });

  it('notti con la stessa data: vale l’ultima nell’array', () => {
    const nights = [nightOf('2026-10-20', 300), nightOf('2026-10-20', 500)];
    const s = durationStats(nights, AS_OF);
    expect(s.avg7.value).toBe(500);
    expect(s.avg7.coverage.used).toBe(1);
  });

  it('arrotonda la media al minuto', () => {
    const s = durationStats(series(AS_OF, [400, 401]), AS_OF);
    expect(s.avg7.value).toBe(401); // 400.5 → 401
  });

  it('settimana del cambio ora solare: durate reali, non orari di parete', () => {
    const nights = [
      night('2026-10-25', '2026-10-24T21:00:00Z', '2026-10-25T06:00:00Z'), // 540
      night('2026-10-24', '2026-10-23T21:00:00Z', '2026-10-24T05:00:00Z'), // 480
    ];
    expect(durationStats(nights, '2026-10-25').avg7.value).toBe(510);
  });

  it('finestra a cavallo del cambio ora legale (2026-03-29)', () => {
    const nights = [
      night('2026-03-30', '2026-03-29T21:00:00Z', '2026-03-30T05:00:00Z'), // 480
      night('2026-03-29', '2026-03-28T22:00:00Z', '2026-03-29T05:00:00Z'), // 420
      night('2026-03-28', '2026-03-27T22:00:00Z', '2026-03-28T06:00:00Z'), // 480
    ];
    const s = durationStats(nights, '2026-03-30');
    expect(s.avg7.value).toBe(460);
    expect(s.avg7.coverage.used).toBe(3);
  });
});

describe('sleepDebt', () => {
  it('usa l’obiettivo di default 7h30', () => {
    expect(DEFAULT_TARGET_SLEEP_MIN).toBe(450);
    const r = sleepDebt(series(AS_OF, [420, 420, 420]), AS_OF);
    expect(r.value).toBe(90);
    expect(r.coverage).toEqual({ used: 3, window: 7 });
  });

  it('somma solo i deficit: le notti lunghe non compensano', () => {
    const r = sleepDebt(series(AS_OF, [600, 400, 450, 300, 500, 440, 450]), AS_OF);
    expect(r.value).toBe(0 + 50 + 0 + 150 + 0 + 10 + 0);
    expect(r.coverage).toEqual({ used: 7, window: 7 });
    expect(r.hiddenReason).toBeUndefined();
  });

  it('le notti mancanti non contano come debito', () => {
    const r = sleepDebt(series(AS_OF, [null, 400, null, 400, null, 400, null]), AS_OF);
    expect(r.value).toBe(150);
    expect(r.coverage).toEqual({ used: 3, window: 7 });
  });

  it('soglia copertura: con 2 notti è nascosto, con 3 è mostrato', () => {
    const two = sleepDebt(series(AS_OF, [null, null, null, null, null, 400, 400]), AS_OF);
    expect(two).toEqual({
      value: null,
      coverage: { used: 2, window: 7 },
      hiddenReason: 'Servono almeno 3 notti. Per ora ne hai 2.',
    });
    const three = sleepDebt(series(AS_OF, [null, null, null, null, 400, 400, 400]), AS_OF);
    expect(three.value).toBe(150);
  });

  it('input vuoto: nascosto con copertura 0', () => {
    expect(sleepDebt([], AS_OF)).toEqual({
      value: null,
      coverage: { used: 0, window: 7 },
      hiddenReason: 'Servono almeno 3 notti. Per ora ne hai 0.',
    });
  });

  it('considera solo le 7 notti di calendario fino ad asOf', () => {
    const nights = series(AS_OF, [100, 450, 450, 450, 450, 450, 450, 450]); // la prima è asOf−7
    const r = sleepDebt(nights, AS_OF);
    expect(r.value).toBe(0);
    expect(r.coverage.used).toBe(7);
    const future = sleepDebt([...nights, nightOf('2026-10-21', 100)], AS_OF);
    expect(future.value).toBe(0);
  });

  it('le notti-eccezione restano incluse nel debito', () => {
    const nights = [
      nightOf('2026-10-20', 450),
      nightOf('2026-10-19', 150, { isException: true }),
      nightOf('2026-10-18', 450),
    ];
    expect(sleepDebt(nights, AS_OF).value).toBe(300);
  });

  it('accetta un obiettivo personalizzato', () => {
    expect(sleepDebt(series(AS_OF, [420, 420, 420]), AS_OF, 480).value).toBe(180);
    expect(sleepDebt(series(AS_OF, [420, 420, 420]), AS_OF, 420).value).toBe(0);
  });

  it('notte del cambio ora legale (7h reali) genera 30 min di debito', () => {
    const nights = [
      night('2026-03-29', '2026-03-28T22:00:00Z', '2026-03-29T05:00:00Z'), // 420
      nightOf('2026-03-28', 450),
      nightOf('2026-03-27', 450),
    ];
    expect(sleepDebt(nights, '2026-03-29').value).toBe(30);
  });

  it('notte del cambio ora solare (9h reali) non genera debito', () => {
    const nights = [
      night('2026-10-25', '2026-10-24T21:00:00Z', '2026-10-25T06:00:00Z'), // 540
      nightOf('2026-10-24', 450),
      nightOf('2026-10-23', 440),
    ];
    expect(sleepDebt(nights, '2026-10-25').value).toBe(10);
  });
});

describe('sleep24h', () => {
  const n = nightOf('2026-10-20', 420);

  it('notte senza sonnellini = durata della notte', () => {
    expect(sleep24h(n, [])).toBe(420);
  });

  it('somma i sonnellini del giorno nightDate', () => {
    expect(sleep24h(n, [nap('2026-10-20', 20), nap('2026-10-20', 25, 'stimato')])).toBe(465);
  });

  it('ignora i sonnellini di altri giorni', () => {
    expect(sleep24h(n, [nap('2026-10-19', 60), nap('2026-10-21', 60), nap('2026-10-20', 15)])).toBe(435);
  });

  it('ignora i sonnellini mancanti o con minuti non validi', () => {
    expect(sleep24h(n, [nap('2026-10-20', 30, 'mancante'), nap('2026-10-20', 0), nap('2026-10-20', -10), nap('2026-10-20', Number.NaN)])).toBe(420);
  });

  it('null se la durata della notte manca, anche con sonnellini', () => {
    expect(sleep24h(missing('2026-10-20'), [nap('2026-10-20', 60)])).toBeNull();
  });

  it('notte del cambio ora solare + sonnellino', () => {
    const dst = night('2026-10-25', '2026-10-24T21:00:00Z', '2026-10-25T06:00:00Z');
    expect(sleep24h(dst, [nap('2026-10-25', 30)])).toBe(570);
  });
});

describe('monthlyTrend', () => {
  it('input vuoto: 6 mesi in ordine cronologico, tutti null', () => {
    const t = monthlyTrend([], AS_OF);
    expect(t.map((p) => p.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(t.every((p) => p.avgMin === null && p.n === 0)).toBe(true);
  });

  it('media per mese solare di nightDate, escluse le notti senza durata', () => {
    const nights = [
      nightOf('2026-10-01', 400),
      nightOf('2026-10-20', 500),
      missing('2026-10-10'),
      nightOf('2026-09-30', 420),
      nightOf('2026-07-15', 481),
      nightOf('2026-07-16', 480),
    ];
    const t = monthlyTrend(nights, AS_OF);
    expect(t).toEqual([
      { month: '2026-05', avgMin: null, n: 0 },
      { month: '2026-06', avgMin: null, n: 0 },
      { month: '2026-07', avgMin: 481, n: 2 }, // 480.5 → 481
      { month: '2026-08', avgMin: null, n: 0 },
      { month: '2026-09', avgMin: 420, n: 1 },
      { month: '2026-10', avgMin: 450, n: 2 },
    ]);
  });

  it('il mese è quello di nightDate (risveglio), non quello del letto', () => {
    // a letto il 30/09 alle 23:30 CEST, risveglio il 01/10
    const nights = [night('2026-10-01', '2026-09-30T21:30:00Z', '2026-10-01T05:30:00Z')];
    const t = monthlyTrend(nights, AS_OF);
    expect(t.find((p) => p.month === '2026-10')).toEqual({ month: '2026-10', avgMin: 480, n: 1 });
    expect(t.find((p) => p.month === '2026-09')?.n).toBe(0);
  });

  it('esclude le notti dopo asOf e quelle più vecchie della finestra', () => {
    const nights = [nightOf('2026-10-21', 100), nightOf('2026-04-30', 100), nightOf('2026-05-01', 400)];
    const t = monthlyTrend(nights, AS_OF);
    expect(t[0]).toEqual({ month: '2026-05', avgMin: 400, n: 1 });
    expect(t[5]).toEqual({ month: '2026-10', avgMin: null, n: 0 });
  });

  it('include le notti-eccezione', () => {
    const t = monthlyTrend([nightOf('2026-10-02', 300, { isException: true }), nightOf('2026-10-03', 500)], AS_OF);
    expect(t[5]).toEqual({ month: '2026-10', avgMin: 400, n: 2 });
  });

  it('attraversa il cambio d’anno', () => {
    const t = monthlyTrend([nightOf('2025-12-31', 420)], '2026-02-10', 4);
    expect(t.map((p) => p.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(t[1]).toEqual({ month: '2025-12', avgMin: 420, n: 1 });
  });

  it('numero di mesi personalizzato; 0 o negativo → lista vuota', () => {
    expect(monthlyTrend([], AS_OF, 1)).toEqual([{ month: '2026-10', avgMin: null, n: 0 }]);
    expect(monthlyTrend([], AS_OF, 12)).toHaveLength(12);
    expect(monthlyTrend([], AS_OF, 0)).toEqual([]);
    expect(monthlyTrend([], AS_OF, -3)).toEqual([]);
  });

  it('marzo 2026 con la notte del cambio ora legale usa la durata reale', () => {
    const nights = [
      night('2026-03-29', '2026-03-28T22:00:00Z', '2026-03-29T05:00:00Z'), // 420
      nightOf('2026-03-28', 480),
    ];
    const t = monthlyTrend(nights, '2026-03-31', 1);
    expect(t).toEqual([{ month: '2026-03', avgMin: 450, n: 2 }]);
  });
});

describe('durationBand', () => {
  it('soglia esatta 480 → sage, 479 → blue', () => {
    expect(durationBand(480)).toBe('sage');
    expect(durationBand(479)).toBe('blue');
    expect(durationBand(479.5)).toBe('blue');
  });

  it('soglia esatta 420 → blue, 419 → peach', () => {
    expect(durationBand(420)).toBe('blue');
    expect(durationBand(419)).toBe('peach');
    expect(durationBand(419.9)).toBe('peach');
  });

  it('valori estremi', () => {
    expect(durationBand(720)).toBe('sage');
    expect(durationBand(0)).toBe('peach');
  });
});
