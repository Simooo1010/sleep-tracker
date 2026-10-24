import { describe, expect, it } from 'vitest';
import {
  computeCorrelations,
  roundDiff,
  toneOf,
  type Correlation,
} from '../../src/domain/correlations';
import { addDays } from '../../src/domain/time';
import type { EveningCheck, Night, Score } from '../../src/domain/types';

interface NightOpts {
  q?: Score | null;
  e?: Score | null;
  factors?: string[];
  isException?: boolean;
  bedAt?: string | null;
  wakeAt?: string | null;
}

function night(nightDate: string, o: NightOpts = {}): Night {
  const q = o.q === undefined ? 3 : o.q;
  const e = o.e === undefined ? 3 : o.e;
  return {
    nightDate,
    bedAt: { value: o.bedAt ?? null, provenance: o.bedAt ? 'confermato' : 'mancante' },
    wakeAt: { value: o.wakeAt ?? null, provenance: o.wakeAt ? 'confermato' : 'mancante' },
    status: 'confermata',
    quality: { value: q, provenance: q === null ? 'mancante' : 'confermato' },
    energy: { value: e, provenance: e === null ? 'mancante' : 'confermato' },
    isException: o.isException ?? false,
    factors: o.factors ?? [],
  };
}

function check(date: string, mood: Score | null): EveningCheck {
  return {
    date,
    tiredness: { value: null, provenance: 'mancante' },
    mood: { value: mood, provenance: mood === null ? 'mancante' : 'confermato' },
    factors: [],
    napMinutesToday: { value: null, provenance: 'mancante' },
  };
}

const START = '2026-09-01';

/** Genera notti consecutive a partire da START. */
function series(specs: NightOpts[], start = START): Night[] {
  return specs.map((s, i) => night(addDays(start, i), s));
}

function rep<T>(n: number, v: T): T[] {
  return Array.from({ length: n }, () => v);
}

function pick(rows: Correlation[] | null, factor: string, outcome: Correlation['outcome']): Correlation {
  const r = rows?.find((x) => x.factor === factor && x.outcome === outcome);
  if (!r) throw new Error(`riga mancante ${factor}/${outcome}`);
  return r;
}

describe('computeCorrelations — soglia notti', () => {
  it('input vuoto: nascosta con 0 notti', () => {
    const r = computeCorrelations([], [], ['sport']);
    expect(r.value).toBeNull();
    expect(r.coverage).toEqual({ used: 0, window: 0 });
    expect(r.hiddenReason).toBe('Servono almeno 14 notti. Per ora ne hai 0.');
  });

  it('13 notti con dati: nascosta', () => {
    const r = computeCorrelations(series(rep(13, {})), [], ['sport']);
    expect(r.value).toBeNull();
    expect(r.coverage).toEqual({ used: 13, window: 13 });
    expect(r.hiddenReason).toBe('Servono almeno 14 notti. Per ora ne hai 13.');
  });

  it('14 notti con dati: visibile, senza hiddenReason', () => {
    const r = computeCorrelations(series(rep(14, {})), [], ['sport']);
    expect(r.value).not.toBeNull();
    expect(r.hiddenReason).toBeUndefined();
    expect(r.coverage).toEqual({ used: 14, window: 14 });
  });

  it('notti senza alcun voto non contano come notti con dati', () => {
    const specs: NightOpts[] = [...rep(13, {}), { q: null, e: null }];
    const r = computeCorrelations(series(specs), [], ['sport']);
    expect(r.value).toBeNull();
    expect(r.coverage).toEqual({ used: 13, window: 14 });
    expect(r.hiddenReason).toBe('Servono almeno 14 notti. Per ora ne hai 13.');
  });

  it("una notte con solo l'umore della sera prima conta come notte con dati", () => {
    const specs: NightOpts[] = [...rep(13, {}), { q: null, e: null }];
    const nights = series(specs);
    const last = nights[13]!;
    const checks = [check(addDays(last.nightDate, -1), 4)];
    const r = computeCorrelations(nights, checks, ['sport']);
    expect(r.value).not.toBeNull();
    expect(r.coverage).toEqual({ used: 14, window: 14 });
  });

  it("un check serale senza notte successiva non aggiunge notti", () => {
    const nights = series(rep(13, {}));
    const checks = [check(addDays(START, 20), 5)];
    expect(computeCorrelations(nights, checks, []).value).toBeNull();
  });

  it('notti duplicate (stessa nightDate) contano una volta, vince l’ultima', () => {
    const nights = series(rep(13, {}));
    nights.push(night(START, { q: 5, factors: ['sport'] }));
    const r = computeCorrelations(nights, [], ['sport']);
    expect(r.value).toBeNull();
    expect(r.coverage).toEqual({ used: 13, window: 13 });

    const nights14 = [
      ...series(rep(14, { factors: [] as string[] })),
      night(START, { q: 5, factors: ['sport'] }),
    ];
    const r14 = computeCorrelations(nights14, [], ['sport']);
    expect(pick(r14.value, 'sport', 'quality').withN).toBe(1);
    expect(pick(r14.value, 'sport', 'quality').withoutN).toBe(13);
  });
});

describe('computeCorrelations — occorrenze minime', () => {
  it('4 occorrenze: diff null, neutral, "ne servono 5"', () => {
    const specs: NightOpts[] = [...rep(4, { q: 5, factors: ['sport'] }), ...rep(10, { q: 2 })];
    const r = computeCorrelations(series(specs), [], ['sport']);
    const row = pick(r.value, 'sport', 'quality');
    expect(row).toEqual({
      factor: 'sport',
      outcome: 'quality',
      withN: 4,
      withoutN: 10,
      diff: null,
      tone: 'neutral',
      hint: 'ne servono 5',
    });
  });

  it('5 occorrenze: diff calcolato', () => {
    const specs: NightOpts[] = [...rep(5, { q: 5, factors: ['sport'] }), ...rep(9, { q: 2 })];
    const row = pick(computeCorrelations(series(specs), [], ['sport']).value, 'sport', 'quality');
    expect(row.withN).toBe(5);
    expect(row.withoutN).toBe(9);
    expect(row.diff).toBe(3);
    expect(row.tone).toBe('sage');
  });

  it('occorrenze contate sui voti presenti: fattore in 6 notti ma solo 4 voti → null', () => {
    const specs: NightOpts[] = [
      ...rep(4, { q: 5, factors: ['sport'] }),
      ...rep(2, { q: null, e: 4, factors: ['sport'] }),
      ...rep(8, { q: 2 }),
    ];
    const r = computeCorrelations(series(specs), [], ['sport']);
    const q = pick(r.value, 'sport', 'quality');
    expect(q.withN).toBe(4);
    expect(q.diff).toBeNull();
    expect(q.hint).toBe('ne servono 5');
    const e = pick(r.value, 'sport', 'energy');
    expect(e.withN).toBe(6);
    expect(e.withoutN).toBe(8);
    expect(e.diff).not.toBeNull();
  });

  it('fattore mai presente: withN 0, diff null', () => {
    const row = pick(computeCorrelations(series(rep(14, {})), [], ['alcol']).value, 'alcol', 'quality');
    expect(row).toMatchObject({ withN: 0, withoutN: 14, diff: null, tone: 'neutral', hint: 'ne servono 5' });
  });

  it('fattore presente in tutte le notti: niente confronto possibile', () => {
    const specs: NightOpts[] = rep(14, { factors: ['stress'] });
    const row = pick(computeCorrelations(series(specs), [], ['stress']).value, 'stress', 'quality');
    expect(row.withN).toBe(14);
    expect(row.withoutN).toBe(0);
    expect(row.diff).toBeNull();
    expect(row.tone).toBe('neutral');
    expect(row.hint).toBe('servono anche notti senza questo fattore');
  });
});

describe('computeCorrelations — soglie di colore', () => {
  /** 10 notti con fattore (voti dati) + 4 senza, tutte a 3. */
  function withVotes(votes: Score[], withoutVote: Score = 3): Night[] {
    const specs: NightOpts[] = [
      ...votes.map((q) => ({ q, factors: ['schermo-a-letto'] })),
      ...rep(4, { q: withoutVote }),
    ];
    return series(specs);
  }

  it('+0,3 esatto → sage (anche con errore in virgola mobile 3,3 − 3)', () => {
    const votes: Score[] = [...rep(7, 3 as Score), ...rep(3, 4 as Score)]; // media 3,3
    const row = pick(computeCorrelations(withVotes(votes), [], ['schermo-a-letto']).value, 'schermo-a-letto', 'quality');
    expect(row.diff).toBe(0.3);
    expect(row.tone).toBe('sage');
    expect(row.hint).toBe(
      'Nelle notti con questo fattore il voto è stato in media più alto di 0,3 rispetto alle altre',
    );
  });

  it('−0,3 esatto → peach', () => {
    const votes: Score[] = [...rep(7, 3 as Score), ...rep(3, 2 as Score)]; // media 2,7
    const row = pick(computeCorrelations(withVotes(votes), [], ['schermo-a-letto']).value, 'schermo-a-letto', 'quality');
    expect(row.diff).toBe(-0.3);
    expect(row.tone).toBe('peach');
    expect(row.hint).toBe(
      'Nelle notti con questo fattore il voto è stato in media più basso di 0,3 rispetto alle altre',
    );
  });

  it('+0,2 → neutral, ma numero e segno restano', () => {
    const votes: Score[] = [...rep(8, 3 as Score), ...rep(2, 4 as Score)]; // media 3,2
    const row = pick(computeCorrelations(withVotes(votes), [], ['schermo-a-letto']).value, 'schermo-a-letto', 'quality');
    expect(row.diff).toBe(0.2);
    expect(row.tone).toBe('neutral');
    expect(row.hint).toContain('più alto di 0,2');
  });

  it('−0,2 → neutral', () => {
    const votes: Score[] = [...rep(8, 3 as Score), ...rep(2, 2 as Score)]; // media 2,8
    const row = pick(computeCorrelations(withVotes(votes), [], ['schermo-a-letto']).value, 'schermo-a-letto', 'quality');
    expect(row.diff).toBe(-0.2);
    expect(row.tone).toBe('neutral');
    expect(row.hint).toContain('più basso di 0,2');
  });

  it('diff 0 → neutral, hint di uguaglianza', () => {
    const row = pick(computeCorrelations(withVotes(rep(10, 3 as Score)), [], ['schermo-a-letto']).value, 'schermo-a-letto', 'quality');
    expect(row.diff).toBe(0);
    expect(Object.is(row.diff, -0)).toBe(false);
    expect(row.tone).toBe('neutral');
    expect(row.hint).toBe('Nelle notti con questo fattore il voto è stato in media uguale alle altre');
  });

  it('arrotonda a 1 decimale: +0,25 → +0,3 (sage), −0,25 → −0,3 (peach)', () => {
    const up: Score[] = [...rep(6, 3 as Score), ...rep(2, 4 as Score)]; // 8 voti, media 3,25
    const down: Score[] = [...rep(6, 3 as Score), ...rep(2, 2 as Score)]; // media 2,75
    const nUp = series([...up.map((q) => ({ q, factors: ['x'] })), ...rep(6, { q: 3 as Score })]);
    const nDown = series([...down.map((q) => ({ q, factors: ['x'] })), ...rep(6, { q: 3 as Score })]);
    expect(pick(computeCorrelations(nUp, [], ['x']).value, 'x', 'quality')).toMatchObject({ diff: 0.3, tone: 'sage' });
    expect(pick(computeCorrelations(nDown, [], ['x']).value, 'x', 'quality')).toMatchObject({ diff: -0.3, tone: 'peach' });
  });

  it('diff con più decimali: 0,375 → 0,4', () => {
    // con: 4,4,4,3,3,3 = 3,5 ; senza: 3×7 + 4 = 3,125 → diff 0,375 → 0,4
    const specs: NightOpts[] = [
      ...([4, 4, 4, 3, 3, 3] as Score[]).map((q) => ({ q, factors: ['x'] })),
      ...([3, 3, 3, 3, 3, 3, 3, 4] as Score[]).map((q) => ({ q })),
    ];
    const row = pick(computeCorrelations(series(specs), [], ['x']).value, 'x', 'quality');
    expect(row.diff).toBe(0.4);
    expect(row.hint).toContain('0,4');
  });
});

describe('computeCorrelations — risultati e umore della sera precedente', () => {
  it("l'umore è preso dal check della sera PRECEDENTE (nightDate − 1), non dalla sera stessa", () => {
    const nights = series([...rep(5, { factors: ['sport'] }), ...rep(9, {})]);
    const checks: EveningCheck[] = [];
    nights.forEach((n, i) => {
      // sera precedente: 5 se fattore, 2 altrimenti
      checks.push(check(addDays(n.nightDate, -1), i < 5 ? 5 : 2));
    });
    // check della stessa data della notte NON va usato: se lo fosse sposterebbe i valori
    const row = pick(computeCorrelations(nights, checks, ['sport']).value, 'sport', 'mood');
    expect(row.withN).toBe(5);
    expect(row.withoutN).toBe(9);
    expect(row.diff).toBe(3);
    expect(row.tone).toBe('sage');
  });

  it('cambio ora legale 2026-03-29: la notte 03-29 usa la sera 03-28', () => {
    const start = '2026-03-20';
    const specs: NightOpts[] = rep(14, {});
    const nights = series(specs, start); // 03-20 … 04-02
    const dstNight = nights.find((n) => n.nightDate === '2026-03-29')!;
    dstNight.factors = ['alcol'];
    // notte a cavallo di mezzanotte e del cambio d'ora: 23:30 CET → 07:30 CEST
    dstNight.bedAt = { value: '2026-03-28T22:30:00Z', provenance: 'confermato' };
    dstNight.wakeAt = { value: '2026-03-29T05:30:00Z', provenance: 'confermato' };
    const checks = [check('2026-03-28', 1), check('2026-03-29', 5)];
    const row = pick(computeCorrelations(nights, checks, ['alcol']).value, 'alcol', 'mood');
    expect(row.withN).toBe(1); // solo la sera 03-28 associata alla notte 03-29
    // la sera 03-29 va alla notte 03-30 (senza fattore)
    expect(row.withoutN).toBe(1);
  });

  it('cambio ora legale 2026-10-25: notti 10-25 e 10-26 usano sere 10-24 e 10-25', () => {
    const nights = series(rep(14, {}), '2026-10-15'); // 10-15 … 10-28
    for (const n of nights) {
      if (n.nightDate === '2026-10-25' || n.nightDate === '2026-10-26') n.factors = ['festa'];
    }
    const n25 = nights.find((n) => n.nightDate === '2026-10-25')!;
    n25.bedAt = { value: '2026-10-24T22:00:00Z', provenance: 'confermato' }; // 00:00 CEST
    n25.wakeAt = { value: '2026-10-25T07:00:00Z', provenance: 'confermato' }; // 08:00 CET
    const checks = [check('2026-10-24', 4), check('2026-10-25', 4), check('2026-10-26', 1)];
    const row = pick(computeCorrelations(nights, checks, ['festa']).value, 'festa', 'mood');
    expect(row.withN).toBe(2);
    expect(row.withoutN).toBe(1); // sera 10-26 → notte 10-27
  });

  it('cambio di mese/anno: notte 2026-03-01 usa la sera 2026-02-28, notte 2027-01-01 la sera 2026-12-31', () => {
    const a = series(rep(14, {}), '2026-02-20');
    const marchFirst = a.find((n) => n.nightDate === '2026-03-01')!;
    marchFirst.factors = ['f'];
    const ra = computeCorrelations(a, [check('2026-02-28', 2)], ['f']);
    expect(pick(ra.value, 'f', 'mood').withN).toBe(1);

    const b = series(rep(14, {}), '2026-12-25');
    b.find((n) => n.nightDate === '2027-01-01')!.factors = ['f'];
    const rb = computeCorrelations(b, [check('2026-12-31', 2)], ['f']);
    expect(pick(rb.value, 'f', 'mood').withN).toBe(1);
  });

  it('check serale con umore mancante: voto scartato', () => {
    const nights = series(rep(14, {}));
    const checks = nights.map((n) => check(addDays(n.nightDate, -1), null));
    const row = pick(computeCorrelations(nights, checks, ['x']).value, 'x', 'mood');
    expect(row.withN).toBe(0);
    expect(row.withoutN).toBe(0);
    expect(row.diff).toBeNull();
  });

  it('check duplicati per la stessa sera: vince l’ultimo', () => {
    const nights = series([...rep(5, { factors: ['x'] }), ...rep(9, {})]);
    const checks: EveningCheck[] = nights.flatMap((n, i) => [
      check(addDays(n.nightDate, -1), 1),
      check(addDays(n.nightDate, -1), i < 5 ? 4 : 2),
    ]);
    expect(pick(computeCorrelations(nights, checks, ['x']).value, 'x', 'mood').diff).toBe(2);
  });

  it('qualità ed energia sono calcolate indipendentemente, voti mancanti scartati', () => {
    const specs: NightOpts[] = [
      ...rep(5, { q: 4 as Score, e: 1 as Score, factors: ['sport'] }),
      { q: null, e: 1 as Score, factors: ['sport'] },
      ...rep(7, { q: 2 as Score, e: 3 as Score }),
      { q: 2 as Score, e: null },
    ];
    const r = computeCorrelations(series(specs), [], ['sport']);
    expect(pick(r.value, 'sport', 'quality')).toMatchObject({ withN: 5, withoutN: 8, diff: 2, tone: 'sage' });
    expect(pick(r.value, 'sport', 'energy')).toMatchObject({ withN: 6, withoutN: 7, diff: -2, tone: 'peach' });
  });
});

describe('computeCorrelations — eccezioni, ordine, fattori', () => {
  it('le notti-eccezione sono incluse (visibili, la spec le esclude solo dal riferimento di regolarità)', () => {
    const specs: NightOpts[] = [
      ...rep(5, { q: 5 as Score, factors: ['alcol'], isException: true }),
      ...rep(9, { q: 3 as Score }),
    ];
    const r = computeCorrelations(series(specs), [], ['alcol']);
    expect(r.coverage.used).toBe(14);
    expect(pick(r.value, 'alcol', 'quality')).toMatchObject({ withN: 5, diff: 2 });
  });

  it('ordine: fattori come passati (deduplicati), poi quality, energy, mood', () => {
    const r = computeCorrelations(series(rep(14, {})), [], ['sport', 'alcol', 'sport']);
    expect(r.value!.map((x) => `${x.factor}/${x.outcome}`)).toEqual([
      'sport/quality',
      'sport/energy',
      'sport/mood',
      'alcol/quality',
      'alcol/energy',
      'alcol/mood',
    ]);
  });

  it('nessun fattore richiesto con dati sufficienti: array vuoto', () => {
    const r = computeCorrelations(series(rep(14, {})), [], []);
    expect(r.value).toEqual([]);
    expect(r.hiddenReason).toBeUndefined();
  });

  it('i fattori della notte non richiesti dal chiamante sono ignorati; "caffe" non ha gestione speciale', () => {
    const specs: NightOpts[] = [
      ...rep(5, { q: 5 as Score, factors: ['caffe', 'sport'] }),
      ...rep(9, { q: 3 as Score }),
    ];
    const r = computeCorrelations(series(specs), [], ['caffe']);
    expect(r.value!.every((x) => x.factor === 'caffe')).toBe(true);
    expect(pick(r.value, 'caffe', 'quality').diff).toBe(2);
  });

  it('i fattori del check serale non sono usati (conta solo night.factors)', () => {
    const nights = series(rep(14, {}));
    const checks = nights.map((n) => ({ ...check(addDays(n.nightDate, -1), 3), factors: ['sport'] }));
    expect(pick(computeCorrelations(nights, checks, ['sport']).value, 'sport', 'quality').withN).toBe(0);
  });

  it('non modifica gli input', () => {
    const nights = series([...rep(5, { factors: ['b', 'a'] }), ...rep(9, {})]);
    const checks = [check('2026-09-01', 3)];
    const snapN = structuredClone(nights);
    const snapC = structuredClone(checks);
    computeCorrelations(nights, checks, ['a', 'b']);
    expect(nights).toEqual(snapN);
    expect(checks).toEqual(snapC);
  });

  it('gli hint non usano mai linguaggio causale', () => {
    const specs: NightOpts[] = [
      ...rep(5, { q: 5 as Score, e: 1 as Score, factors: ['a'] }),
      ...rep(3, { q: 3 as Score, factors: ['b'] }),
      ...rep(6, { q: 3 as Score, e: 3 as Score, factors: ['c'] }),
    ];
    const r = computeCorrelations(series(specs), [], ['a', 'b', 'c']);
    for (const row of r.value!) {
      expect(row.hint).not.toMatch(/caus|provoc|perch|effett|porta a|determin/i);
    }
  });
});

describe('helper', () => {
  it('roundDiff: simmetrico, niente -0', () => {
    expect(roundDiff(0.25)).toBe(0.3);
    expect(roundDiff(-0.25)).toBe(-0.3);
    expect(roundDiff(0.35)).toBe(0.4);
    expect(roundDiff(-0.04)).toBe(0);
    expect(Object.is(roundDiff(-0.04), -0)).toBe(false);
    expect(roundDiff(3.3 - 3)).toBe(0.3);
  });

  it('toneOf: soglie inclusive ±0,3', () => {
    expect(toneOf(0.3)).toBe('sage');
    expect(toneOf(0.29)).toBe('neutral');
    expect(toneOf(-0.3)).toBe('peach');
    expect(toneOf(-0.29)).toBe('neutral');
    expect(toneOf(null)).toBe('neutral');
  });
});
