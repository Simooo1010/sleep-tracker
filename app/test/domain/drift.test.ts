import { describe, expect, it } from 'vitest';
import {
  computeDrift,
  formatDriftBadge,
  DRIFT_WINDOW_DAYS,
  DRIFT_WEEKS,
} from '../../src/domain/drift';
import type { Night, Provenance } from '../../src/domain/types';
import { addDays, localParts } from '../../src/domain/time';

const MINUS = '−';

/** ISO UTC per un orario locale Europe/Rome (gestisce CET/CEST). */
function romeIso(date: string, hhmm: string): string {
  for (const off of ['+02:00', '+01:00']) {
    const iso = new Date(`${date}T${hhmm}:00${off}`).toISOString();
    const p = localParts(iso);
    const mm = String(p.minutes % 60).padStart(2, '0');
    const hh = String(Math.floor(p.minutes / 60)).padStart(2, '0');
    if (p.date === date && `${hh}:${mm}` === hhmm) return iso;
  }
  throw new Error(`orario locale inesistente: ${date} ${hhmm}`);
}

/** Letto 'HH:MM': se >= 18:00 è la sera prima di nightDate, altrimenti dopo mezzanotte. */
function bedIso(nightDate: string, hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  return romeIso(h >= 18 ? addDays(nightDate, -1) : nightDate, hhmm);
}

function night(
  nightDate: string,
  bed: string | null,
  opts: { isException?: boolean; provenance?: Provenance; wake?: string | null } = {},
): Night {
  const wake = opts.wake === undefined ? '07:30' : opts.wake;
  return {
    nightDate,
    bedAt: { value: bed === null ? null : bedIso(nightDate, bed), provenance: bed === null ? 'mancante' : (opts.provenance ?? 'confermato') },
    wakeAt: { value: wake === null ? null : romeIso(nightDate, wake), provenance: wake === null ? 'mancante' : 'confermato' },
    status: bed === null ? 'mancante' : 'confermata',
    quality: { value: null, provenance: 'mancante' },
    energy: { value: null, provenance: 'mancante' },
    isException: opts.isException ?? false,
    factors: [],
  };
}

/** Minuti dalle 18:00 → 'HH:MM'. */
function hhmm(axisMin: number): string {
  const m = (axisMin + 18 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Riempie le 6 settimane che terminano a asOf: bedFor(weekIdx 0..5, dayIdx 0..6) → orario o null (salta). */
function fill(asOf: string, bedFor: (week: number, day: number) => string | null): Night[] {
  const out: Night[] = [];
  for (let w = 0; w < 6; w++) {
    const weekEnd = addDays(asOf, -7 * (5 - w));
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekEnd, d - 6);
      const b = bedFor(w, d);
      if (b !== null) out.push(night(date, b));
    }
  }
  return out;
}

const AS_OF = '2026-10-24';

describe('computeDrift — soglie e copertura', () => {
  it('input vuoto: nascosta, 0 settimane, copertura 0 su 42', () => {
    const r = computeDrift([], AS_OF);
    expect(r.value).toBeNull();
    expect(r.coverage).toEqual({ used: 0, window: 42 });
    expect(r.hiddenReason).toBe('Servono almeno 3 settimane di dati. Per ora ne hai 0.');
  });

  it('costanti esportate coerenti', () => {
    expect(DRIFT_WEEKS).toBe(6);
    expect(DRIFT_WINDOW_DAYS).toBe(42);
  });

  it('2 settimane valide: nascosta con N=2', () => {
    const nights = fill(AS_OF, (w, d) => (w >= 4 && d < 3 ? '23:30' : null));
    const r = computeDrift(nights, AS_OF);
    expect(r.value).toBeNull();
    expect(r.hiddenReason).toBe('Servono almeno 3 settimane di dati. Per ora ne hai 2.');
    expect(r.coverage).toEqual({ used: 6, window: 42 });
  });

  it('settimane con meno di 3 notti non contano come valide', () => {
    // settimane 0..3 hanno 2 notti, 4..5 ne hanno 3
    const nights = fill(AS_OF, (w, d) => (w < 4 ? (d < 2 ? '23:00' : null) : d < 3 ? '23:30' : null));
    const r = computeDrift(nights, AS_OF);
    expect(r.value).toBeNull();
    expect(r.hiddenReason).toContain('ne hai 2.');
    // le notti di settimane non valide non sono "usate"
    expect(r.coverage.used).toBe(6);
  });

  it('esattamente 3 settimane con 3 notti: mostrata', () => {
    const nights = fill(AS_OF, (w, d) => ([0, 2, 5].includes(w) && d < 3 ? '23:30' : null));
    const r = computeDrift(nights, AS_OF);
    expect(r.value).not.toBeNull();
    expect(r.coverage).toEqual({ used: 9, window: 42 });
    expect(r.hiddenReason).toBeUndefined();
  });

  it('copertura piena: 42 notti usate su 42', () => {
    const r = computeDrift(fill(AS_OF, () => '23:30'), AS_OF);
    expect(r.coverage).toEqual({ used: 42, window: 42 });
  });
});

describe('computeDrift — finestre settimanali', () => {
  it('6 weekEnd consecutivi, dal più vecchio, ultimo = asOf', () => {
    const r = computeDrift(fill(AS_OF, () => '23:30'), AS_OF);
    expect(r.value?.weeklyMedians.map((w) => w.weekEnd)).toEqual([
      '2026-09-19',
      '2026-09-26',
      '2026-10-03',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
    ]);
    expect(r.value?.weeklyMedians.every((w) => w.n === 7 && w.bedMin === 330)).toBe(true);
  });

  it('notti fuori finestra (prima dello start o dopo asOf) ignorate', () => {
    const nights = fill(AS_OF, () => '23:30');
    nights.push(night(addDays(AS_OF, -42), '03:00')); // 1 giorno prima dello start
    nights.push(night(addDays(AS_OF, 1), '03:00')); // futuro
    const r = computeDrift(nights, AS_OF);
    expect(r.value?.shiftMin).toBe(0);
    expect(r.coverage.used).toBe(42);
    expect(r.value?.weeklyMedians[0]?.n).toBe(7);
    expect(r.value?.weeklyMedians[5]?.n).toBe(7);
  });

  it('settimana con 1–2 notti: bedMin null ma n riportato', () => {
    const nights = fill(AS_OF, (w, d) => (w === 1 ? (d < 2 ? '23:00' : null) : '23:30'));
    const w1 = computeDrift(nights, AS_OF).value?.weeklyMedians[1];
    expect(w1).toEqual({ weekEnd: '2026-09-26', bedMin: null, n: 2 });
  });

  it('settimana vuota: bedMin null, n 0', () => {
    const nights = fill(AS_OF, (w) => (w === 3 ? null : '23:30'));
    expect(computeDrift(nights, AS_OF).value?.weeklyMedians[3]).toEqual({
      weekEnd: '2026-10-10',
      bedMin: null,
      n: 0,
    });
  });

  it('ordine di input irrilevante', () => {
    const nights = fill(AS_OF, (w, d) => hhmm(300 + w * 9 + d));
    const a = computeDrift(nights, AS_OF);
    const b = computeDrift([...nights].reverse(), AS_OF);
    expect(b).toEqual(a);
  });

  it('mediana con numero pari di notti (media dei due centrali)', () => {
    // ogni settimana 4 notti: 23:00, 23:10, 23:20, 23:50 → mediana 23:15 = 315
    const times = ['23:00', '23:10', '23:20', '23:50'];
    const nights = fill(AS_OF, (_w, d) => times[d] ?? null);
    const r = computeDrift(nights, AS_OF);
    expect(r.value?.weeklyMedians.every((w) => w.bedMin === 315 && w.n === 4)).toBe(true);
  });

  it('mediana robusta a una notte anomala', () => {
    const nights = fill(AS_OF, (w, d) => (w === 5 && d === 0 ? '04:00' : '23:30'));
    const r = computeDrift(nights, AS_OF);
    expect(r.value?.weeklyMedians[5]?.bedMin).toBe(330);
    expect(r.value?.shiftMin).toBe(0);
  });

  it('notti duplicate sulla stessa data: contano una volta, vince l’ultima', () => {
    const nights = fill(AS_OF, () => '23:30');
    nights.push(night(AS_OF, '23:00'));
    const r = computeDrift(nights, AS_OF);
    expect(r.value?.weeklyMedians[5]?.n).toBe(7);
    expect(r.coverage.used).toBe(42);
    // un duplicato successivo marcato come eccezione rimuove la notte
    nights.push(night(AS_OF, '23:00', { isException: true }));
    expect(computeDrift(nights, AS_OF).value?.weeklyMedians[5]?.n).toBe(6);
  });
});

describe('computeDrift — esclusioni', () => {
  it('le notti-eccezione sono escluse dalle mediane e dalla copertura', () => {
    const nights = fill(AS_OF, () => '23:30');
    // nell'ultima settimana 3 eccezioni alle 03:00: senza esclusione la mediana cambierebbe
    const extra = [0, 1, 2, 3].map((d) => night(addDays(AS_OF, -d), '03:00', { isException: true }));
    const others = nights.filter((n) => !extra.some((e) => e.nightDate === n.nightDate));
    const r = computeDrift([...others, ...extra], AS_OF);
    expect(r.value?.weeklyMedians[5]).toEqual({ weekEnd: AS_OF, bedMin: 330, n: 3 });
    expect(r.coverage.used).toBe(38);
  });

  it('eccezioni che portano una settimana sotto 3 notti la invalidano', () => {
    const nights = fill(AS_OF, (w, d) => (w <= 2 && d < 3 ? '23:30' : null)).map((n, i) =>
      i === 0 ? { ...n, isException: true } : n,
    );
    const r = computeDrift(nights, AS_OF);
    expect(r.value).toBeNull();
    expect(r.hiddenReason).toContain('ne hai 2.');
  });

  it('notti senza orario di letto escluse (anche se status mancante)', () => {
    const nights = fill(AS_OF, (w, d) => (d < 3 ? '23:30' : null));
    for (let i = 0; i < 6; i++) nights.push(night(addDays(AS_OF, -7 * i), null));
    const r = computeDrift(nights, AS_OF);
    expect(r.value?.weeklyMedians.every((w) => w.n === 3)).toBe(true);
    expect(r.coverage.used).toBe(18);
  });

  it('letto presente ma sveglia mancante: la notte conta', () => {
    const nights = fill(AS_OF, (_w, d) => (d < 2 ? '23:30' : null));
    for (let i = 0; i < 6; i++) nights.push(night(addDays(AS_OF, -7 * i), '23:30', { wake: null }));
    const r = computeDrift(nights, AS_OF);
    expect(r.value?.weeklyMedians.every((w) => w.n === 3)).toBe(true);
  });

  it('valori stimati sono inclusi', () => {
    const nights = fill(AS_OF, () => null);
    for (let i = 0; i < 42; i++) nights.push(night(addDays(AS_OF, -i), '23:30', { provenance: 'stimato' }));
    expect(computeDrift(nights, AS_OF).coverage.used).toBe(42);
  });
});

describe('computeDrift — spostamento e badge', () => {
  it('nessuna deriva: 0 min, non supera', () => {
    const v = computeDrift(fill(AS_OF, () => '23:30'), AS_OF).value;
    expect(v).toMatchObject({ shiftMin: 0, weeks: 5, exceeds: false, badge: '0 min in 5 settimane' });
  });

  it('deriva positiva +50 in 5 settimane: supera', () => {
    const v = computeDrift(fill(AS_OF, (w) => hhmm(300 + w * 10)), AS_OF).value;
    expect(v?.weeklyMedians.map((w) => w.bedMin)).toEqual([300, 310, 320, 330, 340, 350]);
    expect(v).toMatchObject({ shiftMin: 50, weeks: 5, exceeds: true, badge: '+50 min in 5 settimane' });
  });

  it('deriva negativa con segno meno tipografico U+2212', () => {
    const v = computeDrift(fill(AS_OF, (w) => hhmm(360 - w * 7)), AS_OF).value;
    expect(v?.shiftMin).toBe(-35);
    expect(v?.exceeds).toBe(true);
    expect(v?.badge).toBe(`${MINUS}35 min in 5 settimane`);
    expect(v?.badge).not.toContain('-');
  });

  it('soglia: 30 non supera, 31 supera (positivo e negativo)', () => {
    const mk = (delta: number) =>
      computeDrift(fill(AS_OF, (w) => hhmm(w === 5 ? 330 + delta : 330)), AS_OF).value?.exceeds;
    expect(mk(30)).toBe(false);
    expect(mk(31)).toBe(true);
    expect(mk(-30)).toBe(false);
    expect(mk(-31)).toBe(true);
  });

  it('notti a cavallo di mezzanotte: 23:40 → 00:20 = +40', () => {
    const v = computeDrift(fill(AS_OF, (w) => (w < 3 ? '23:40' : '00:20')), AS_OF).value;
    expect(v?.weeklyMedians.map((w) => w.bedMin)).toEqual([340, 340, 340, 380, 380, 380]);
    expect(v?.shiftMin).toBe(40);
    expect(v?.badge).toBe('+40 min in 5 settimane');
  });

  it('settimana con letti misti prima/dopo mezzanotte: mediana sull’asse continuo', () => {
    // 23:50, 23:55, 00:05, 00:10, 00:15 → mediana 00:05 = 365
    const t = ['23:50', '23:55', '00:05', '00:10', '00:15'];
    const v = computeDrift(fill(AS_OF, (_w, d) => t[d] ?? null), AS_OF).value;
    expect(v?.weeklyMedians.every((w) => w.bedMin === 365)).toBe(true);
  });

  it('prima e ultima mediana disponibili non agli estremi: weeks = distanza', () => {
    const nights = fill(AS_OF, (w) => (w === 1 ? '23:00' : w === 2 ? '23:10' : w === 4 ? '23:45' : null));
    const v = computeDrift(nights, AS_OF).value;
    expect(v?.weeklyMedians.map((w) => w.bedMin)).toEqual([null, 300, 310, null, 345, null]);
    expect(v).toMatchObject({ shiftMin: 45, weeks: 3, exceeds: true, badge: '+45 min in 3 settimane' });
  });

  it('shiftMin arrotondato all’intero e mai −0', () => {
    // prima settimana mediana 330.5 (4 notti), ultima 330
    const nights = fill(AS_OF, (w, d) => {
      if (w === 0) return d < 4 ? (d < 2 ? '23:30' : '23:31') : null;
      return '23:30';
    });
    const v = computeDrift(nights, AS_OF).value;
    expect(v?.weeklyMedians[0]?.bedMin).toBe(330.5);
    expect(Object.is(v?.shiftMin, 0)).toBe(true);
    expect(v?.badge).toBe('0 min in 5 settimane');
  });
});

describe('computeDrift — cambio ora legale (Europe/Rome)', () => {
  it('autunno 2026-10-25: 23:30 locale costante → deriva 0', () => {
    const asOf = '2026-11-08'; // finestra 2026-09-28 … 2026-11-08, include il 25/10
    const nights = fill(asOf, () => '23:30');
    // la sera del 24/10 è CEST (21:30Z), quella del 25/10 è CET (22:30Z): stesso orario locale
    expect(nights.find((n) => n.nightDate === '2026-10-25')?.bedAt.value).toBe('2026-10-24T21:30:00.000Z');
    expect(nights.find((n) => n.nightDate === '2026-10-26')?.bedAt.value).toBe('2026-10-25T22:30:00.000Z');
    const v = computeDrift(nights, asOf).value;
    expect(v?.weeklyMedians.every((w) => w.bedMin === 330 && w.n === 7)).toBe(true);
    expect(v?.shiftMin).toBe(0);
  });

  it('autunno: letto alle 02:30 nell’ora ripetuta conta come 02:30 locale', () => {
    const asOf = '2026-10-31';
    const nights = fill(asOf, () => '02:30').filter((n) => n.nightDate !== '2026-10-25');
    const n25 = night('2026-10-25', '02:30');
    // entrambe le 02:30 (CEST 00:30Z e CET 01:30Z) sono 02:30 locali
    const cet = { ...n25, bedAt: { value: '2026-10-25T01:30:00.000Z', provenance: 'automatico' as const } };
    const v = computeDrift([...nights, cet], asOf).value;
    expect(v?.weeklyMedians.every((w) => w.bedMin === 510)).toBe(true);
    expect(v?.shiftMin).toBe(0);
  });

  it('primavera 2026-03-29: 00:30 locale costante → deriva 0', () => {
    const asOf = '2026-04-12';
    const nights = fill(asOf, () => '00:30');
    expect(nights.find((n) => n.nightDate === '2026-03-29')?.bedAt.value).toBe('2026-03-28T23:30:00.000Z');
    expect(nights.find((n) => n.nightDate === '2026-03-30')?.bedAt.value).toBe('2026-03-29T22:30:00.000Z');
    const v = computeDrift(nights, asOf).value;
    expect(v?.weeklyMedians.every((w) => w.bedMin === 390 && w.n === 7)).toBe(true);
    expect(v?.shiftMin).toBe(0);
  });

  it('primavera: le finestre restano di 7 giorni di calendario a cavallo del cambio', () => {
    const r = computeDrift(fill('2026-04-01', () => '23:30'), '2026-04-01');
    expect(r.value?.weeklyMedians.map((w) => w.weekEnd)).toEqual([
      '2026-02-25',
      '2026-03-04',
      '2026-03-11',
      '2026-03-18',
      '2026-03-25',
      '2026-04-01',
    ]);
    expect(r.coverage.used).toBe(42);
  });

  it('deriva reale attraverso il cambio d’ora: 23:00 → 23:40 locale = +40', () => {
    const asOf = '2026-11-08';
    const v = computeDrift(fill(asOf, (w) => (w < 4 ? '23:00' : '23:40')), asOf).value;
    expect(v?.shiftMin).toBe(40);
    expect(v?.exceeds).toBe(true);
  });
});

describe('computeDrift — input non valido', () => {
  it('asOf malformato → errore', () => {
    expect(() => computeDrift([], '2026-1-5')).toThrow();
    expect(() => computeDrift([], 'oggi')).toThrow();
    expect(() => computeDrift([], '2026-13-45')).toThrow();
  });
});

describe('formatDriftBadge', () => {
  it('singolare con 1 settimana', () => {
    expect(formatDriftBadge(42, 1)).toBe('+42 min in 1 settimana');
  });
  it('plurale, negativo con U+2212, zero senza segno', () => {
    expect(formatDriftBadge(42, 5)).toBe('+42 min in 5 settimane');
    expect(formatDriftBadge(-12, 2)).toBe(`${MINUS}12 min in 2 settimane`);
    expect(formatDriftBadge(0, 4)).toBe('0 min in 4 settimane');
  });
});
