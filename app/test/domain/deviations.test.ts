import { describe, expect, it } from 'vitest';
import {
  REGULARITY_MIN_NIGHTS,
  formatSigned,
  nightDeviation,
  regularityStats,
  type DeviationBaseline,
} from '../../src/domain/deviations';
import { addDays } from '../../src/domain/time';
import { TOLERANCE_MIN, type Night, type NightStatus } from '../../src/domain/types';

function night(
  nightDate: string,
  bedIso: string | null,
  wakeIso: string | null,
  extra: { isException?: boolean; status?: NightStatus } = {},
): Night {
  return {
    nightDate,
    bedAt: { value: bedIso, provenance: bedIso === null ? 'mancante' : 'automatico' },
    wakeAt: { value: wakeIso, provenance: wakeIso === null ? 'mancante' : 'automatico' },
    status: extra.status ?? (bedIso === null && wakeIso === null ? 'mancante' : 'confermata'),
    quality: { value: null, provenance: 'mancante' },
    energy: { value: null, provenance: 'mancante' },
    isException: extra.isException ?? false,
    factors: [],
  };
}

/**
 * Notte in ora legale (CEST, UTC+2) con orari locali: letto `bedHHMM` la sera prima
 * (o dopo mezzanotte se < 18:00), sveglia `wakeHHMM` il giorno nightDate.
 */
function cest(nightDate: string, bedHHMM: string, wakeHHMM: string, extra?: Parameters<typeof night>[3]): Night {
  return night(nightDate, localToUtc(nightDate, bedHHMM, true, 2), localToUtc(nightDate, wakeHHMM, false, 2), extra);
}

function localToUtc(nightDate: string, hhmm: string, isBed: boolean, offsetH: number): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const localDate = isBed && h >= 18 ? addDays(nightDate, -1) : nightDate;
  const ms = Date.parse(`${localDate}T00:00:00Z`) + ((h - offsetH) * 60 + m) * 60000;
  return new Date(ms).toISOString();
}

const BASE: DeviationBaseline = { bedMin: 330, wakeMin: 450 }; // 23:30 / 07:30

describe('nightDeviation', () => {
  it('scarto con segno: letto 23:42 e sveglia 07:25 vs 23:30/07:30', () => {
    const d = nightDeviation(cest('2026-10-15', '23:42', '07:25'), BASE);
    expect(d).toEqual({
      nightDate: '2026-10-15',
      bedDev: 12,
      wakeDev: -5,
      bedOk: true,
      wakeOk: true,
      regular: true,
      excluded: false,
    });
  });

  it('notte a cavallo di mezzanotte: letto 00:40 → +70, fuori tolleranza', () => {
    const d = nightDeviation(cest('2026-10-15', '00:40', '07:30'), BASE);
    expect(d.bedDev).toBe(70);
    expect(d.bedOk).toBe(false);
    expect(d.wakeOk).toBe(true);
    expect(d.regular).toBe(false);
  });

  it('mediana dopo mezzanotte, letto prima: 23:50 vs 00:40 → −50', () => {
    const d = nightDeviation(cest('2026-10-15', '23:50', '07:30'), { bedMin: 400, wakeMin: 450 });
    expect(d.bedDev).toBe(-50);
    expect(d.bedOk).toBe(false);
  });

  it('mediana 23:45, letto 00:10 → +25 (nessun salto di 24 h)', () => {
    const d = nightDeviation(cest('2026-10-15', '00:10', '07:30'), { bedMin: 345, wakeMin: 450 });
    expect(d.bedDev).toBe(25);
    expect(d.bedOk).toBe(true);
  });

  it('soglia di tolleranza inclusiva: ±30 ok, ±31 no', () => {
    expect(TOLERANCE_MIN).toBe(30);
    expect(nightDeviation(cest('2026-10-15', '00:00', '07:00'), BASE)).toMatchObject({
      bedDev: 30,
      wakeDev: -30,
      bedOk: true,
      wakeOk: true,
      regular: true,
    });
    expect(nightDeviation(cest('2026-10-15', '00:01', '06:59'), BASE)).toMatchObject({
      bedDev: 31,
      wakeDev: -31,
      bedOk: false,
      wakeOk: false,
      regular: false,
    });
  });

  it('mediana frazionaria: scarto non arrotondato, soglia su valore esatto', () => {
    const b = { bedMin: 330.5, wakeMin: 450.5 };
    expect(nightDeviation(cest('2026-10-15', '00:00', '08:00'), b)).toMatchObject({
      bedDev: 29.5,
      wakeDev: 29.5,
      regular: true,
    });
    expect(nightDeviation(cest('2026-10-15', '23:00', '08:01'), b)).toMatchObject({
      bedDev: -30.5,
      wakeDev: 30.5,
      bedOk: false,
      wakeOk: false,
    });
  });

  it('una sola componente fuori tolleranza ⇒ non regolare', () => {
    expect(nightDeviation(cest('2026-10-15', '23:30', '08:30'), BASE)).toMatchObject({
      bedOk: true,
      wakeOk: false,
      regular: false,
    });
  });

  it('scarto zero è 0, non null', () => {
    const d = nightDeviation(cest('2026-10-15', '23:30', '07:30'), BASE);
    expect(d.bedDev).toBe(0);
    expect(d.wakeDev).toBe(0);
    expect(d.regular).toBe(true);
  });

  it('letto mancante: bedDev/bedOk/regular null (mai zero), sveglia calcolata', () => {
    const n = night('2026-10-15', null, cest('2026-10-15', '23:30', '07:40').wakeAt.value, { status: 'stimata' });
    const d = nightDeviation(n, BASE);
    expect(d.bedDev).toBeNull();
    expect(d.bedOk).toBeNull();
    expect(d.wakeDev).toBe(10);
    expect(d.wakeOk).toBe(true);
    expect(d.regular).toBeNull();
  });

  it('sveglia mancante con letto fuori tolleranza: regular resta null', () => {
    const n = night('2026-10-15', cest('2026-10-15', '01:00', '07:30').bedAt.value, null, { status: 'stimata' });
    const d = nightDeviation(n, BASE);
    expect(d.bedDev).toBe(90);
    expect(d.bedOk).toBe(false);
    expect(d.wakeDev).toBeNull();
    expect(d.wakeOk).toBeNull();
    expect(d.regular).toBeNull();
  });

  it('notte mancante: tutto null', () => {
    expect(nightDeviation(night('2026-10-15', null, null), BASE)).toEqual({
      nightDate: '2026-10-15',
      bedDev: null,
      wakeDev: null,
      bedOk: null,
      wakeOk: null,
      regular: null,
      excluded: false,
    });
  });

  it('notte-eccezione: calcolata ma excluded: true', () => {
    const d = nightDeviation(cest('2026-10-15', '02:00', '10:00', { isException: true }), BASE);
    expect(d).toMatchObject({ bedDev: 150, wakeDev: 150, regular: false, excluded: true });
  });

  it('cambio ora legale 2026-03-29 (CET→CEST): scarti su orologio locale', () => {
    // letto 23:00 CET (22:00Z), sveglia 07:00 CEST (05:00Z): 7 h reali, orari locali invariati
    const n = night('2026-03-29', '2026-03-28T22:00:00Z', '2026-03-29T05:00:00Z');
    expect(nightDeviation(n, { bedMin: 300, wakeMin: 420 })).toMatchObject({ bedDev: 0, wakeDev: 0, regular: true });
    // letto dopo il salto: 03:30 CEST = 01:30Z → asse 570
    const late = night('2026-03-29', '2026-03-29T01:30:00Z', '2026-03-29T08:00:00Z');
    expect(nightDeviation(late, { bedMin: 300, wakeMin: 600 })).toMatchObject({ bedDev: 270, wakeDev: 0 });
  });

  it('cambio ora solare 2026-10-25 (CEST→CET): scarti su orologio locale, ora doppia', () => {
    const n = night('2026-10-25', '2026-10-24T21:00:00Z', '2026-10-25T06:00:00Z'); // 23:00 CEST → 07:00 CET
    expect(nightDeviation(n, { bedMin: 300, wakeMin: 420 })).toMatchObject({ bedDev: 0, wakeDev: 0, regular: true });
    // 02:30 avviene due volte: stesso orario locale, stesso scarto
    const first = night('2026-10-25', '2026-10-25T00:30:00Z', '2026-10-25T07:00:00Z');
    const second = night('2026-10-25', '2026-10-25T01:30:00Z', '2026-10-25T07:00:00Z');
    expect(nightDeviation(first, BASE).bedDev).toBe(180);
    expect(nightDeviation(second, BASE).bedDev).toBe(180);
  });
});

describe('regularityStats', () => {
  const AS_OF = '2026-10-20';

  /** 5 notti con letto 23:00..23:40 (asse 300..340) e sveglia 07:00..07:40 (420..460). */
  function fiveSteps(): Night[] {
    return [0, 1, 2, 3, 4].map((i) =>
      cest(addDays(AS_OF, -i), `23:${String(i * 10).padStart(2, '0')}`, `07:${String(i * 10).padStart(2, '0')}`),
    );
  }

  it('input vuoto: tutto nascosto, copertura 0/14', () => {
    const s = regularityStats([], BASE, AS_OF);
    for (const stat of [s.withinTolerance, s.stdBed, s.stdWake, s.midpoint]) {
      expect(stat).toEqual({
        value: null,
        coverage: { used: 0, window: 14 },
        hiddenReason: 'Servono almeno 5 notti. Per ora ne hai 0.',
      });
    }
  });

  it('soglia copertura: 4 notti nascosto, 5 visibile', () => {
    expect(REGULARITY_MIN_NIGHTS).toBe(5);
    const four = regularityStats(fiveSteps().slice(0, 4), BASE, AS_OF);
    expect(four.stdBed.value).toBeNull();
    expect(four.withinTolerance.value).toBeNull();
    expect(four.midpoint.hiddenReason).toBe('Servono almeno 5 notti. Per ora ne hai 4.');
    expect(four.stdWake.coverage).toEqual({ used: 4, window: 14 });

    const five = regularityStats(fiveSteps(), BASE, AS_OF);
    expect(five.stdBed.hiddenReason).toBeUndefined();
    expect(five.stdBed.coverage).toEqual({ used: 5, window: 14 });
    expect(five.stdBed.value).toBeCloseTo(Math.sqrt(250), 10);
    expect(five.stdWake.value).toBeCloseTo(Math.sqrt(250), 10);
  });

  it('withinTolerance conta le notti regolari sulle utilizzabili', () => {
    // baseline 23:00/07:00: scarti 0,10,20,30,40 → 4 regolari su 5
    const s = regularityStats(fiveSteps(), { bedMin: 300, wakeMin: 420 }, AS_OF);
    expect(s.withinTolerance.value).toEqual({ count: 4, of: 5 });
    expect(s.withinTolerance.coverage).toEqual({ used: 5, window: 14 });
  });

  it('punto medio: mediana dei punti medi sull’asse letto', () => {
    // punti medi: (300+780)/2=540, (310+790)/2=550, … 580 → mediana 560 (03:20)
    expect(regularityStats(fiveSteps(), BASE, AS_OF).midpoint.value).toBe(560);
  });

  it('punto medio con numero pari di notti: media dei due centrali', () => {
    const six = [...fiveSteps(), cest(addDays(AS_OF, -5), '23:50', '07:50')];
    expect(regularityStats(six, BASE, AS_OF).midpoint.value).toBe(565);
  });

  it('punto medio con letto prima delle 18:00: resta coerente (17:30→01:00 ⇒ 21:15)', () => {
    const nights = [0, 1, 2, 3, 4].map((i) =>
      night(addDays(AS_OF, -i), `${addDays(AS_OF, -i - 1)}T15:30:00Z`, `${addDays(AS_OF, -i)}T23:00:00Z`),
    );
    // letto 17:30 CEST (asse 1410), sveglia 01:00 CEST del giorno dopo; punto medio 21:15 → asse 195
    expect(regularityStats(nights, BASE, AS_OF).midpoint.value).toBe(195);
  });

  it('finestra: 14 notti fino a asOf incluso (asOf−13 … asOf)', () => {
    const inside = [0, 1, 2, 3, 13].map((i) => cest(addDays(AS_OF, -i), '23:30', '07:30'));
    const outside = [cest(addDays(AS_OF, -14), '23:30', '07:30'), cest(addDays(AS_OF, 1), '23:30', '07:30')];
    const s = regularityStats([...outside, ...inside], BASE, AS_OF);
    expect(s.stdBed.coverage).toEqual({ used: 5, window: 14 });
    expect(s.stdBed.value).toBe(0);

    const only4 = regularityStats([...outside, ...inside.slice(0, 4)], BASE, AS_OF);
    expect(only4.stdBed.value).toBeNull();
    expect(only4.stdBed.hiddenReason).toBe('Servono almeno 5 notti. Per ora ne hai 4.');
  });

  it('esclude eccezioni, notti senza orari e notti mancanti', () => {
    const base = fiveSteps().slice(0, 4);
    const noise = [
      cest(addDays(AS_OF, -5), '03:00', '11:00', { isException: true }),
      night(addDays(AS_OF, -6), null, `${addDays(AS_OF, -6)}T05:00:00Z`, { status: 'stimata' }),
      night(addDays(AS_OF, -7), `${addDays(AS_OF, -8)}T21:00:00Z`, null, { status: 'stimata' }),
      night(addDays(AS_OF, -8), null, null),
      cest(addDays(AS_OF, -9), '23:30', '07:30', { status: 'mancante' }),
    ];
    const s = regularityStats([...base, ...noise], BASE, AS_OF);
    expect(s.stdBed.value).toBeNull();
    expect(s.midpoint.hiddenReason).toBe('Servono almeno 5 notti. Per ora ne hai 4.');

    const withFifth = regularityStats([...fiveSteps(), ...noise], BASE, AS_OF);
    expect(withFifth.stdBed.coverage.used).toBe(5);
    expect(withFifth.stdBed.value).toBeCloseTo(Math.sqrt(250), 10);
  });

  it('record doppi per la stessa notte: se ne conta uno, preferendo la confermata', () => {
    const nights = fiveSteps();
    const dupe = cest(AS_OF, '02:00', '10:00', { status: 'stimata' }); // prima nella lista
    const s = regularityStats([dupe, ...nights], { bedMin: 300, wakeMin: 420 }, AS_OF);
    expect(s.withinTolerance.value).toEqual({ count: 4, of: 5 });
    expect(s.stdBed.value).toBeCloseTo(Math.sqrt(250), 10);
  });

  it('ordine dell’input irrilevante e input non mutato', () => {
    const nights = fiveSteps();
    const copy = structuredClone(nights);
    const a = regularityStats(nights, BASE, AS_OF);
    const b = regularityStats([...nights].reverse(), BASE, AS_OF);
    expect(a).toEqual(b);
    expect(nights).toEqual(copy);
  });

  it('a cavallo del cambio ora 2026-10-25: orari locali costanti ⇒ std 0, tutte regolari', () => {
    const asOf = '2026-10-28';
    const nights = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(asOf, -i);
      // 23:30 e 07:30 locali: CEST fino al letto del 24, CET dopo (sveglia del 25 già in CET)
      const bedOff = d <= '2026-10-25' ? 2 : 1;
      const wakeOff = d < '2026-10-25' ? 2 : 1;
      nights.push(night(d, localToUtc(d, '23:30', true, bedOff), localToUtc(d, '07:30', false, wakeOff)));
    }
    const s = regularityStats(nights, BASE, asOf);
    expect(s.stdBed.value).toBe(0);
    expect(s.stdWake.value).toBe(0);
    expect(s.withinTolerance.value).toEqual({ count: 7, of: 7 });
    expect(s.midpoint.value).toBe(570); // (330 + 810) / 2 → 03:30
  });

  it('a cavallo del cambio ora 2026-03-29: orari locali costanti ⇒ std 0', () => {
    const asOf = '2026-04-01';
    const nights = [];
    for (let i = 0; i < 6; i++) {
      const d = addDays(asOf, -i);
      const bedOff = d <= '2026-03-29' ? 1 : 2;
      const wakeOff = d < '2026-03-29' ? 1 : 2;
      nights.push(night(d, localToUtc(d, '23:30', true, bedOff), localToUtc(d, '07:30', false, wakeOff)));
    }
    const s = regularityStats(nights, BASE, asOf);
    expect(s.stdBed.value).toBe(0);
    expect(s.stdWake.value).toBe(0);
    expect(s.withinTolerance.value).toEqual({ count: 6, of: 6 });
  });

  it('punto medio sulla notte del 2026-10-25 usa l’orologio locale (23:00 CEST → 07:00 CET = 03:00)', () => {
    const asOf = '2026-10-25';
    const nights = [0, 1, 2, 3, 4].map((i) => {
      const d = addDays(asOf, -i);
      return night(d, localToUtc(d, '23:00', true, 2), localToUtc(d, '07:00', false, i === 0 ? 1 : 2));
    });
    const s = regularityStats(nights, BASE, asOf);
    expect(s.midpoint.value).toBe(540);
  });

  it('data di riferimento non valida → errore', () => {
    expect(() => regularityStats([], BASE, '2026-10-2')).toThrow();
    expect(() => regularityStats([], BASE, '20/10/2026')).toThrow();
  });
});

describe('formatSigned', () => {
  it('positivo con +, negativo con meno tipografico U+2212', () => {
    expect(formatSigned(12)).toBe('+12 min');
    expect(formatSigned(-5)).toBe('−5 min');
    expect(formatSigned(-5).charCodeAt(0)).toBe(0x2212);
    expect(formatSigned(-5)).not.toContain('-');
  });

  it('zero senza segno (anche −0 e valori che arrotondano a 0)', () => {
    expect(formatSigned(0)).toBe('0 min');
    expect(formatSigned(-0)).toBe('0 min');
    expect(formatSigned(0.4)).toBe('0 min');
    expect(formatSigned(-0.4)).toBe('0 min');
  });

  it('arrotonda all’intero in modo simmetrico', () => {
    expect(formatSigned(2.5)).toBe('+3 min');
    expect(formatSigned(-2.5)).toBe('−3 min');
    expect(formatSigned(29.5)).toBe('+30 min');
    expect(formatSigned(-150)).toBe('−150 min');
  });

  it('valori non finiti → errore', () => {
    expect(() => formatSigned(Number.NaN)).toThrow(RangeError);
    expect(() => formatSigned(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
