import { describe, expect, it } from 'vitest';
import {
  FORECAST_MIN_NIGHTS,
  durationBand,
  energyLabel,
  forecastEnergy,
  weekdayHeatmap,
} from '../../src/domain/forecast';
import type { Nap, Night, Provenance, Score } from '../../src/domain/types';
import { addDays, bedAxisMinutes } from '../../src/domain/time';

/** Offset di Europe/Rome per una data (sufficiente per i test: CEST dal 29/3 al 24/10/2026 incluso). */
function romeOffsetH(date: string): number {
  return date >= '2026-03-29' && date < '2026-10-25' ? 2 : 1;
}

/** Istante ISO UTC da data + ora locali di Roma (non per le ore ambigue/inesistenti del cambio ora). */
function rome(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMinutes(h * 60 + m - romeOffsetH(date) * 60);
  return d.toISOString();
}

interface Opts {
  bed?: string | null; // 'HH:MM' locale; >= 18:00 → sera prima
  wake?: string | null;
  energy?: Score | null;
  energyProv?: Provenance;
  isException?: boolean;
  bedIso?: string;
  wakeIso?: string;
}

function night(nightDate: string, o: Opts = {}): Night {
  const bed = o.bed === undefined ? '23:00' : o.bed;
  const wake = o.wake === undefined ? '07:00' : o.wake;
  let bedIso: string | null = o.bedIso ?? null;
  if (!bedIso && bed !== null) {
    const h = Number(bed.slice(0, 2));
    bedIso = rome(h >= 18 ? addDays(nightDate, -1) : nightDate, bed);
  }
  const wakeIso = o.wakeIso ?? (wake === null ? null : rome(nightDate, wake));
  const energy = o.energy === undefined ? 3 : o.energy;
  return {
    nightDate,
    bedAt: { value: bedIso, provenance: bedIso ? 'confermato' : 'mancante' },
    wakeAt: { value: wakeIso, provenance: wakeIso ? 'confermato' : 'mancante' },
    status: 'confermata',
    quality: { value: null, provenance: 'mancante' },
    energy: {
      value: energy,
      provenance: energy === null ? 'mancante' : (o.energyProv ?? 'confermato'),
    },
    isException: o.isException ?? false,
    factors: [],
  };
}

const AS_OF = '2026-06-30';
/** n notti consecutive che terminano ad AS_OF (o `end`). */
function series(n: number, o: Opts | ((i: number) => Opts) = {}, end = AS_OF): Night[] {
  return Array.from({ length: n }, (_, i) =>
    night(addDays(end, -(n - 1 - i)), typeof o === 'function' ? o(i) : o),
  );
}

const BED_2300 = 300; // 23:00 sull'asse da 18:00
const T = (bed: number | null, dur: number | null, nap = false) => ({
  bedAxisMin: bed,
  expectedDurationMin: dur,
  napToday: nap,
});

describe('energyLabel / durationBand', () => {
  it('soglie label', () => {
    expect(energyLabel(1)).toBe('bassa');
    expect(energyLabel(2.6)).toBe('bassa');
    expect(energyLabel(2.7)).toBe('media');
    expect(energyLabel(3.6)).toBe('media');
    expect(energyLabel(3.7)).toBe('alta');
    expect(energyLabel(5)).toBe('alta');
  });
  it('fasce durata', () => {
    expect(durationBand(480)).toBe('sage');
    expect(durationBand(600)).toBe('sage');
    expect(durationBand(479)).toBe('blue');
    expect(durationBand(420)).toBe('blue');
    expect(durationBand(419)).toBe('peach');
    expect(durationBand(0)).toBe('peach');
  });
});

describe('forecastEnergy — soglia copertura', () => {
  it('input vuoto → nascosta con 0 notti', () => {
    const r = forecastEnergy([], T(BED_2300, 480), AS_OF);
    expect(r.value).toBeNull();
    expect(r.hiddenReason).toBe('Servono almeno 10 notti con energia. Per ora ne hai 0.');
    expect(r.coverage).toEqual({ used: 0, window: FORECAST_MIN_NIGHTS });
  });

  it('9 notti → nascosta, 10 → visibile', () => {
    const nine = forecastEnergy(series(9), T(BED_2300, 480), AS_OF);
    expect(nine.value).toBeNull();
    expect(nine.hiddenReason).toBe('Servono almeno 10 notti con energia. Per ora ne hai 9.');
    expect(nine.coverage).toEqual({ used: 9, window: 10 });

    const ten = forecastEnergy(series(10), T(BED_2300, 480), AS_OF);
    expect(ten.value).toEqual({ score: 3, label: 'media', basedOn: 10 });
    expect(ten.hiddenReason).toBeUndefined();
    expect(ten.coverage).toEqual({ used: 10, window: 10 });
  });

  it('non contano: energia mancante, energia stimata, orari mancanti, eccezioni, notti future', () => {
    const nights = [
      ...series(9),
      night('2026-06-01', { energy: null }),
      night('2026-06-02', { energyProv: 'stimato' }),
      night('2026-06-03', { bed: null }),
      night('2026-06-04', { wake: null }),
      night('2026-06-05', { isException: true }),
      night('2026-07-01'), // dopo asOf
      night('2026-06-06', { bed: '08:00', wake: '07:00' }), // durata negativa
    ];
    const r = forecastEnergy(nights, T(BED_2300, 480), AS_OF);
    expect(r.value).toBeNull();
    expect(r.hiddenReason).toContain('ne hai 9.');
  });

  it('la notte con nightDate = asOf è inclusa', () => {
    const nights = [...series(9, {}, '2026-06-29'), night(AS_OF)];
    expect(forecastEnergy(nights, T(BED_2300, 480), AS_OF).value).not.toBeNull();
  });
});

describe('forecastEnergy — input di stanotte', () => {
  it('letto e durata entrambi null → nessun valore (mai certezza)', () => {
    const r = forecastEnergy(series(12), T(null, null), AS_OF);
    expect(r.value).toBeNull();
    expect(r.hiddenReason).toBeDefined();
    expect(r.coverage).toEqual({ used: 0, window: 12 });
  });

  it('anche con napToday true ma letto/durata null → nessun valore', () => {
    expect(forecastEnergy(series(12), T(null, null, true), AS_OF).value).toBeNull();
  });

  it('solo durata: pesa solo la durata', () => {
    // 10 notti da 8h con energia 5, 10 notti da 6h con energia 1; letti diversi tra loro
    const nights = [
      ...series(10, (i) => ({ bed: i % 2 ? '23:00' : '01:00', wake: i % 2 ? '07:00' : '09:00', energy: 5 })),
      ...series(10, { bed: '01:00', wake: '07:00', energy: 1 }, '2026-06-10'),
    ];
    const r = forecastEnergy(nights, T(null, 480), AS_OF);
    expect(r.value).toEqual({ score: 5, label: 'alta', basedOn: 10 });
  });

  it('solo letto: pesa solo l’orario di letto', () => {
    const nights = [
      ...series(10, { bed: '22:30', wake: '06:30', energy: 4 }),
      ...series(10, { bed: '02:30', wake: '10:30', energy: 2 }, '2026-06-10'),
    ];
    const r = forecastEnergy(nights, T(270, null), AS_OF); // 22:30
    expect(r.value).toEqual({ score: 4, label: 'alta', basedOn: 10 });
  });
});

describe('forecastEnergy — kernel e media pesata', () => {
  it('pesi lineari: notte identica pesa 1, a metà banda 0,5, oltre banda 0', () => {
    // 10 notti identiche (8h, letto 23:00) energia 2
    // 10 notti con durata 8h45 (45 min = metà banda) energia 5
    // 5 notti da 10h (fuori banda) energia 1
    const nights = [
      ...series(10, { energy: 2, bed: '23:00', wake: '07:00' }),
      ...series(10, { energy: 5, bed: '23:00', wake: '07:45' }, '2026-06-10'),
      ...series(5, { energy: 1, bed: '23:00', wake: '09:00' }, '2026-05-20'),
    ];
    const r = forecastEnergy(nights, T(BED_2300, 480), AS_OF);
    // (10·1·2 + 10·0,5·5) / (10 + 5) = 45/15 = 3
    expect(r.value).toEqual({ score: 3, label: 'media', basedOn: 20 });
    expect(r.coverage).toEqual({ used: 20, window: 25 });
  });

  it('il peso è il prodotto dei due kernel', () => {
    // energia 5: durata ok, letto +45 min (0,5) → peso 0,5 ; energia 1: identiche → peso 1
    const nights = [
      ...series(5, { energy: 5, bed: '23:45', wake: '07:45' }),
      ...series(5, { energy: 1, bed: '23:00', wake: '07:00' }, '2026-06-20'),
    ];
    const r = forecastEnergy(nights, T(BED_2300, 480), AS_OF);
    // (5·0,5·5 + 5·1·1)/(2,5+5) = 17,5/7,5 = 2,333 → 2,3
    expect(r.value).toEqual({ score: 2.3, label: 'bassa', basedOn: 10 });
  });

  it('arrotonda a 1 decimale e la label usa il valore arrotondato', () => {
    // 7 notti energia 4, 3 notti energia 3 → 3,7 → alta
    const nights = series(10, (i) => ({ energy: i < 7 ? 4 : 3 }));
    const r = forecastEnergy(nights, T(BED_2300, 480), AS_OF);
    expect(r.value).toEqual({ score: 3.7, label: 'alta', basedOn: 10 });
  });

  it('nessuna notte simile → nascosta', () => {
    const r = forecastEnergy(series(12, { bed: '23:00', wake: '07:00' }), T(BED_2300, 240), AS_OF);
    expect(r.value).toBeNull();
    expect(r.hiddenReason).toContain('Nessuna notte');
    expect(r.coverage).toEqual({ used: 0, window: 12 });
  });

  it('le eccezioni sono escluse anche se molto simili', () => {
    const nights = [...series(10, { energy: 4 }), ...series(5, { energy: 1, isException: true }, '2026-06-10')];
    expect(forecastEnergy(nights, T(BED_2300, 480), AS_OF).value).toEqual({
      score: 4,
      label: 'alta',
      basedOn: 10,
    });
  });

  it('valori sempre nel range 1–5', () => {
    const lo = forecastEnergy(series(10, { energy: 1 }), T(BED_2300, 480), AS_OF);
    const hi = forecastEnergy(series(10, { energy: 5 }), T(BED_2300, 480), AS_OF);
    expect(lo.value).toEqual({ score: 1, label: 'bassa', basedOn: 10 });
    expect(hi.value).toEqual({ score: 5, label: 'alta', basedOn: 10 });
  });

  it('non dipende dall’ordine delle notti', () => {
    const nights = series(15, (i) => ({ energy: ((i % 5) + 1) as Score, wake: i % 2 ? '07:00' : '07:30' }));
    const a = forecastEnergy(nights, T(BED_2300, 480), AS_OF);
    const b = forecastEnergy([...nights].reverse(), T(BED_2300, 480), AS_OF);
    expect(a).toEqual(b);
  });
});

describe('forecastEnergy — mezzanotte e asse del letto', () => {
  it('letti a cavallo di mezzanotte: 23:50 e 00:10 sono vicini (20 min), non 23h', () => {
    // energia 5: letto 00:10 (asse 370); energia 1: letto 21:00 (asse 180, fuori banda)
    const nights = [
      ...series(10, { energy: 5, bed: '00:10', wake: '08:10' }),
      ...series(10, { energy: 1, bed: '21:00', wake: '05:00' }, '2026-06-10'),
    ];
    const bed2350 = 350;
    const r = forecastEnergy(nights, T(bed2350, 480), AS_OF);
    expect(r.value?.score).toBe(5);
    expect(r.value?.basedOn).toBe(10);
  });

  it('durata calcolata correttamente su letto prima di mezzanotte', () => {
    const n = night(AS_OF, { bed: '23:30', wake: '07:30' });
    expect(bedAxisMinutes(n.bedAt.value as string)).toBe(330);
    const r = forecastEnergy(series(10, { bed: '23:30', wake: '07:30', energy: 4 }), T(330, 480), AS_OF);
    expect(r.value?.score).toBe(4);
  });
});

describe('forecastEnergy — cambio ora legale', () => {
  // 2026-03-29: alle 02:00 CET si passa alle 03:00 CEST. Letto 23:00 CET (22:00Z) → sveglia 07:00 CEST (05:00Z) = 7h.
  const springNight = (): Night =>
    night('2026-03-29', { bedIso: '2026-03-28T22:00:00Z', wakeIso: '2026-03-29T05:00:00Z', energy: 1 });
  // 2026-10-25: alle 03:00 CEST si torna alle 02:00 CET. Letto 23:00 CEST (21:00Z) → sveglia 07:00 CET (06:00Z) = 9h.
  const autumnNight = (): Night =>
    night('2026-10-25', { bedIso: '2026-10-24T21:00:00Z', wakeIso: '2026-10-25T06:00:00Z', energy: 5 });

  it('marzo: la notte dura 7h reali (420) non 8h', () => {
    const base = series(9, { energy: 3, bed: '23:00', wake: '07:00' }, '2026-03-20'); // 8h
    const nights = [...base, springNight()];
    // atteso 420 min: base a 60 min (peso 1/3), notte DST a 0 (peso 1)
    const r = forecastEnergy(nights, T(300, 420), '2026-03-29');
    // (9·(1/3)·3 + 1·1)/(3+1) = 10/4 = 2,5
    expect(r.value).toEqual({ score: 2.5, label: 'bassa', basedOn: 10 });
  });

  it('ottobre: la notte dura 9h reali (540) e il letto è alle 23:00 locali', () => {
    expect(bedAxisMinutes('2026-10-24T21:00:00Z')).toBe(300);
    const base = series(9, { energy: 3, bed: '23:00', wake: '07:00' }, '2026-10-24'); // 8h
    const nights = [...base, autumnNight()];
    const r = forecastEnergy(nights, T(300, 540), '2026-10-25');
    // base a 60 min (1/3), DST a 0 (1): (9·(1/3)·3 + 5)/(3+1) = 14/4 = 3,5
    expect(r.value).toEqual({ score: 3.5, label: 'media', basedOn: 10 });
  });
});

describe('forecastEnergy — sonnellino', () => {
  // 5 notti energia 5 precedute da un sonnellino, 5 notti energia 1 senza
  const nights = [
    ...series(5, { energy: 5 }),
    ...series(5, { energy: 1 }, '2026-06-20'),
  ];
  const naps: Nap[] = series(5, {}).map((n) => ({
    date: addDays(n.nightDate, -1),
    startAt: rome(addDays(n.nightDate, -1), '14:00'),
    minutes: 30,
    provenance: 'confermato',
  }));

  it('senza storico sonnellini napToday non cambia la stima', () => {
    const a = forecastEnergy(nights, T(BED_2300, 480, true), AS_OF);
    const b = forecastEnergy(nights, T(BED_2300, 480, false), AS_OF);
    expect(a).toEqual(b);
    expect(a.value?.score).toBe(3);
  });

  it('con storico: lo stato sonnellino diverso dimezza il peso', () => {
    // napToday: notti col sonnellino peso 1, senza 0,5 → (5·5 + 2,5·1)/7,5 = 3,67 → 3,7
    expect(forecastEnergy(nights, T(BED_2300, 480, true), AS_OF, naps).value).toEqual({
      score: 3.7,
      label: 'alta',
      basedOn: 10,
    });
    // niente sonnellino oggi: (2,5·5 + 5·1)/7,5 = 2,33 → 2,3
    expect(forecastEnergy(nights, T(BED_2300, 480, false), AS_OF, naps).value).toEqual({
      score: 2.3,
      label: 'bassa',
      basedOn: 10,
    });
  });

  it('sonnellini da 0 minuti non contano come sonnellino', () => {
    const zero = naps.map((p) => ({ ...p, minutes: 0 }));
    // nessuna notte ha sonnellino: con napToday=false tutte peso 1 → 3
    expect(forecastEnergy(nights, T(BED_2300, 480, false), AS_OF, zero).value?.score).toBe(3);
  });
});

describe('weekdayHeatmap', () => {
  it('input vuoto → 7 celle vuote, lunedì→domenica', () => {
    const h = weekdayHeatmap([], AS_OF);
    expect(h).toHaveLength(7);
    h.forEach((c, i) => expect(c).toEqual({ weekday: i, avgMin: null, n: 0, band: null }));
  });

  it('weekday dal nightDate: 2026-06-29 è lunedì, 2026-06-28 domenica', () => {
    const h = weekdayHeatmap([night('2026-06-29'), night('2026-06-28', { wake: '06:30' })], AS_OF);
    expect(h[0]).toEqual({ weekday: 0, avgMin: 480, n: 1, band: 'sage' });
    expect(h[6]).toEqual({ weekday: 6, avgMin: 450, n: 1, band: 'blue' });
    expect(h.filter((c) => c.n === 0)).toHaveLength(5);
  });

  it('media arrotondata e fasce', () => {
    // martedì: 7h e 7h59 → 449,5 → 450 blue ; mercoledì: 6h → peach
    const nights = [
      night('2026-06-30', { wake: '06:00' }), // mar 7h
      night('2026-06-23', { wake: '06:59' }), // mar 7h59
      night('2026-06-24', { wake: '05:00' }), // mer 6h
    ];
    const h = weekdayHeatmap(nights, AS_OF);
    expect(h[1]).toEqual({ weekday: 1, avgMin: 450, n: 2, band: 'blue' });
    expect(h[2]).toEqual({ weekday: 2, avgMin: 360, n: 1, band: 'peach' });
  });

  it('finestra: ultime 8 settimane incluso asOf, esclusa la notte di 56 giorni prima e le future', () => {
    const nights = [
      night(AS_OF),
      night(addDays(AS_OF, -55)), // ultima dentro
      night(addDays(AS_OF, -56)), // fuori
      night(addDays(AS_OF, 1)), // futura
    ];
    const total = weekdayHeatmap(nights, AS_OF).reduce((a, c) => a + c.n, 0);
    expect(total).toBe(2);
  });

  it('parametro weeks', () => {
    const nights = series(28);
    expect(weekdayHeatmap(nights, AS_OF, 1).reduce((a, c) => a + c.n, 0)).toBe(7);
    expect(weekdayHeatmap(nights, AS_OF, 2).every((c) => c.n === 2)).toBe(true);
    expect(weekdayHeatmap(nights, AS_OF, 0).every((c) => c.n === 0)).toBe(true);
    expect(weekdayHeatmap(nights, AS_OF, -3).every((c) => c.n === 0)).toBe(true);
  });

  it('esclude eccezioni, orari mancanti e durate non positive', () => {
    const nights = [
      night('2026-06-29', { isException: true }),
      night('2026-06-29', { bed: null }),
      night('2026-06-29', { wake: null }),
      night('2026-06-29', { bed: '08:00', wake: '07:00' }),
    ];
    expect(weekdayHeatmap(nights, AS_OF)[0]).toEqual({ weekday: 0, avgMin: null, n: 0, band: null });
  });

  it('non richiede energia', () => {
    expect(weekdayHeatmap([night('2026-06-29', { energy: null })], AS_OF)[0]?.n).toBe(1);
  });

  it('notte a cavallo di mezzanotte (letto 01:30) → durata dagli istanti', () => {
    const h = weekdayHeatmap([night('2026-06-29', { bed: '01:30', wake: '08:00' })], AS_OF);
    expect(h[0]).toEqual({ weekday: 0, avgMin: 390, n: 1, band: 'peach' });
  });

  it('cambio ora legale: 29/3 (dom) 7h, 25/10 (dom) 9h', () => {
    const spring = night('2026-03-29', { bedIso: '2026-03-28T22:00:00Z', wakeIso: '2026-03-29T05:00:00Z' });
    const autumn = night('2026-10-25', { bedIso: '2026-10-24T21:00:00Z', wakeIso: '2026-10-25T06:00:00Z' });
    expect(weekdayHeatmap([spring], '2026-03-29')[6]).toEqual({ weekday: 6, avgMin: 420, n: 1, band: 'blue' });
    expect(weekdayHeatmap([autumn], '2026-10-25')[6]).toEqual({ weekday: 6, avgMin: 540, n: 1, band: 'sage' });
  });

  it('weekday corretto a cavallo del cambio ora (lunedì 26/10 e lunedì 30/3)', () => {
    const h = weekdayHeatmap([night('2026-10-26'), night('2026-10-19')], '2026-10-26');
    expect(h[0]?.n).toBe(2);
    const h2 = weekdayHeatmap([night('2026-03-30')], '2026-03-30');
    expect(h2[0]?.n).toBe(1);
  });
});
