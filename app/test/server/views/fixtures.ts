/**
 * Dataset sintetici realistici per i test dei view model: 30 notti (25 set → 24 ott 2026) con buchi,
 * una notte 'mancante', notti stimate, un'eccezione (viaggio), fattori, voti, sonnellini e segnali.
 */
import { expect } from 'vitest';
import { localToIso } from '../../../src/domain/estimate';
import { addDays, isWeekendNight } from '../../../src/domain/time';
import type { EveningCheck, Nap, Night, Provenance, Score, SignalEvent } from '../../../src/domain/types';

export const TODAY = '2026-10-24';
export const START = '2026-09-25';

/** Minuti locali 'HH:MM' → numero. */
export function hm(s: string): number {
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
}

/** ISO dell'orario di letto: >= 18:00 la sera prima di nightDate, altrimenti dopo mezzanotte. */
export function bedIso(nightDate: string, hhmm: string): string {
  const m = hm(hhmm);
  return m >= 18 * 60 ? localToIso(addDays(nightDate, -1), m) : localToIso(nightDate, m);
}

export function wakeIso(nightDate: string, hhmm: string): string {
  return localToIso(nightDate, hm(hhmm));
}

const tr = <T>(value: T | null, provenance: Provenance) => ({ value, provenance: value === null ? 'mancante' : provenance });

export function makeNight(
  nightDate: string,
  bed: string | null,
  wake: string | null,
  opts: Partial<{
    status: Night['status'];
    prov: Provenance;
    quality: Score | null;
    energy: Score | null;
    isException: boolean;
    factors: string[];
  }> = {},
): Night {
  const prov = opts.prov ?? 'confermato';
  const status = opts.status ?? (bed === null && wake === null ? 'mancante' : 'confermata');
  return {
    nightDate,
    bedAt: tr(bed === null ? null : bedIso(nightDate, bed), prov) as Night['bedAt'],
    wakeAt: tr(wake === null ? null : wakeIso(nightDate, wake), prov) as Night['wakeAt'],
    status,
    quality: tr(opts.quality ?? null, 'confermato') as Night['quality'],
    energy: tr(opts.energy ?? null, 'confermato') as Night['energy'],
    isException: opts.isException ?? false,
    factors: opts.factors ?? [],
  };
}

const rnd = (n: number): number => ((n * 9301 + 49297) % 233280) / 233280;
const clock = (m: number): string => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
const score = (x: number): Score => Math.max(1, Math.min(5, Math.round(x))) as Score;

export const GAP_DATES = ['2026-10-06', '2026-10-14'];
export const MISSING_DATE = '2026-10-18';
export const EXCEPTION_DATE = '2026-10-12';
export const ESTIMATED_DATES = ['2026-10-09', '2026-10-20'];

export interface Dataset {
  nights: Night[];
  naps: Nap[];
  checks: EveningCheck[];
  events: SignalEvent[];
}

/** Notte di riferimento per il giorno i (0 = START). */
function nightFor(i: number, date: string): Night | null {
  if (GAP_DATES.includes(date)) return null;
  if (date === MISSING_DATE) return makeNight(date, null, null);
  const weekend = isWeekendNight(date);
  const screen = i % 3 === 0;
  const sport = i % 4 === 1;
  const stress = i % 5 === 2;
  const alcol = i % 11 === 4;
  const factors = [
    ...(screen ? ['schermo-a-letto'] : []),
    ...(sport ? ['sport'] : []),
    ...(stress ? ['giornata-stressante'] : []),
    ...(alcol ? ['alcol'] : []),
  ];
  const bedMin = hm('23:30') + (weekend ? 50 : 0) + Math.round((rnd(i) - 0.5) * 30) + (screen ? 15 : 0) + 24 * 60;
  const durMin = 450 - (weekend ? 0 : 25) + Math.round((rnd(i + 40) - 0.5) * 80) + (sport ? 15 : 0);
  const quality = score(3 + (sport ? 1 : 0) - (screen ? 1 : 0) + (rnd(i + 13) - 0.5));
  const energy = score(2.6 + (durMin - 420) / 60 + (rnd(i + 17) - 0.5));
  if (date === EXCEPTION_DATE) {
    return makeNight(date, '01:30', '09:10', { isException: true, factors: ['viaggio'], quality: 2, energy: 2 });
  }
  const estimated = ESTIMATED_DATES.includes(date);
  return makeNight(date, clock(bedMin), clock(bedMin + durMin), {
    status: estimated ? 'stimata' : 'confermata',
    prov: estimated ? 'stimato' : 'confermato',
    quality: estimated ? null : quality,
    energy: estimated ? null : energy,
    factors,
  });
}

export function buildDataset(days = 30, start = START): Dataset {
  const nights: Night[] = [];
  const naps: Nap[] = [];
  const checks: EveningCheck[] = [];
  const events: SignalEvent[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const n = nightFor(i, date);
    if (n) nights.push(n);
    // Check serale della sera prima.
    if (n && n.status !== 'mancante') {
      checks.push({
        date: addDays(date, -1),
        tiredness: { value: score(3 + rnd(i + 5)), provenance: 'confermato' },
        mood: { value: score(3.2 - (n.factors.includes('giornata-stressante') ? 1 : 0) + rnd(i + 19) - 0.5), provenance: 'confermato' },
        factors: n.factors,
        napMinutesToday: { value: null, provenance: 'mancante' },
      });
    }
    // Sonnellini: alcuni da comando rapido, uno recuperato dal check serale.
    if (i % 3 === 1) {
      const startAt = localToIso(date, hm('14:05') + (i % 4) * 10);
      naps.push({ date, startAt, minutes: 20 + (i % 4) * 8, provenance: 'automatico' });
    }
  }
  naps.push({ date: '2026-10-21', startAt: localToIso('2026-10-21', 12 * 60), minutes: 30, provenance: 'confermato' });
  // Segnali delle ultime notti (coerenti con gli orari).
  for (const n of nights.filter((x) => x.nightDate >= '2026-10-19')) {
    if (n.bedAt.value) {
      const checkTs = new Date(Date.parse(n.bedAt.value) - 7 * 60000).toISOString();
      events.push({ type: 'evening_check', ts: checkTs, source: 'comandi' });
      events.push({ type: n.bedAt.provenance === 'stimato' ? 'evening_check' : 'bedtime_candidate', ts: n.bedAt.value, source: 'comandi' });
    }
    if (n.wakeAt.value) {
      events.push({ type: 'wake', ts: n.wakeAt.value, source: 'comandi' });
      events.push({ type: 'app_open', ts: new Date(Date.parse(n.wakeAt.value) + 92 * 60000).toISOString(), source: 'app' });
    }
  }
  for (const p of naps.filter((x) => x.provenance === 'automatico' && x.date >= '2026-10-19')) {
    events.push({ type: 'nap_start', ts: p.startAt, source: 'comandi' });
    events.push({ type: 'nap_end', ts: new Date(Date.parse(p.startAt) + p.minutes * 60000).toISOString(), source: 'comandi' });
  }
  events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  return { nights, naps, checks, events };
}

/** Stanotte (24 ott) stimata dai segnali: Riposo alle 23:48, sveglia interrotta alle 07:20. */
export function tonightEstimated(): { night: Night; events: SignalEvent[] } {
  const night = makeNight(TODAY, '23:48', '07:20', { status: 'stimata', prov: 'automatico' });
  const events: SignalEvent[] = [
    { type: 'evening_check', ts: bedIso(TODAY, '23:41'), source: 'comandi' },
    { type: 'bedtime_candidate', ts: night.bedAt.value as string, source: 'comandi' },
    { type: 'wake', ts: night.wakeAt.value as string, source: 'comandi' },
    { type: 'app_open', ts: wakeIso(TODAY, '08:52'), source: 'app' },
  ];
  return { night, events };
}

/** Dataset con stanotte stimata al posto di quella generata. */
export function datasetWithTonight(): Dataset {
  const ds = buildDataset();
  const t = tonightEstimated();
  return {
    ...ds,
    nights: [...ds.nights.filter((n) => n.nightDate !== TODAY), t.night],
    events: [...ds.events.filter((e) => !e.ts.startsWith('2026-10-23T2') && !e.ts.startsWith('2026-10-24')), ...t.events],
  };
}

/** Controlla che il view model sia "pulito": nessun NaN/Infinity/undefined/funzione/Date, testi senza 'NaN'/'undefined'. */
export function expectClean(v: unknown, path = 'view'): void {
  if (v === null) return;
  if (v === undefined) throw new Error(`${path} è undefined`);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`${path} non è finito: ${v}`);
    return;
  }
  if (typeof v === 'string') {
    if (/NaN|undefined|Infinity|\[object/.test(v)) throw new Error(`${path} contiene un testo non valido: ${v}`);
    return;
  }
  if (typeof v === 'boolean') return;
  if (typeof v === 'function') throw new Error(`${path} è una funzione`);
  if (v instanceof Date) throw new Error(`${path} è una Date`);
  if (Array.isArray(v)) {
    v.forEach((x, i) => expectClean(x, `${path}[${i}]`));
    return;
  }
  if (typeof v === 'object') {
    if (Object.getPrototypeOf(v) !== Object.prototype) throw new Error(`${path} non è un oggetto semplice`);
    for (const [k, x] of Object.entries(v)) expectClean(x, `${path}.${k}`);
    return;
  }
  throw new Error(`${path} ha un tipo non serializzabile: ${typeof v}`);
}

export function expectSerializable(v: unknown): void {
  expectClean(v);
  expect(JSON.parse(JSON.stringify(v))).toStrictEqual(v);
}
