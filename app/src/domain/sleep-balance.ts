/**
 * Durata, debito di sonno, sonno delle 24 ore, trend mensile e fasce di colore.
 * Spec: docs/design/system/Dati-e-calcoli.md ("Durata e debito"), docs/PROJECT.md §3c, §5c.
 *
 * Regole comuni:
 * - Funzioni pure: la data di riferimento (`asOfNightDate`, 'YYYY-MM-DD') è sempre un parametro.
 * - Le finestre sono di calendario e includono `asOfNightDate` (7 notti = asOf−6 … asOf).
 *   Le notti con nightDate successiva ad asOf sono ignorate.
 * - Mancante resta mancante: una notte senza orari non vale zero e non viene stimata,
 *   semplicemente non entra nel calcolo (e la copertura lo dichiara).
 * - Le notti-eccezione restano incluse nella durata (sono notti dormite davvero), ma vengono contate.
 * - Se più notti hanno la stessa nightDate vale l'ultima nell'array.
 */
import { DEFAULT_TARGET_SLEEP_MIN } from './types';
import type { Coverage, Nap, Night, Stat } from './types';
import { addDays, durationMinutes, hasTimes } from './time';

/** Notti minime con durata nella finestra di 7 perché il debito sia mostrato. */
export const SLEEP_DEBT_MIN_NIGHTS = 3;
export const SLEEP_DEBT_WINDOW = 7;
export const AVG_SHORT_WINDOW = 7;
export const AVG_MONTH_WINDOW = 30;
/** Soglie delle fasce di colore (minuti). */
export const BAND_SAGE_MIN = 480; // 8h
export const BAND_BLUE_MIN = 420; // 7h

export type DurationBand = 'sage' | 'blue' | 'peach';

/** Media di durata con copertura e numero di notti-eccezione incluse nel calcolo. */
export interface DurationStat extends Stat<number> {
  exceptionsIncluded: number;
}

export interface DurationStats {
  avg7: DurationStat;
  avgMonth: DurationStat;
}

export interface MonthlyTrendPoint {
  /** 'YYYY-MM' (mese solare di nightDate). */
  month: string;
  /** Durata media in minuti (arrotondata), null se nel mese non ci sono notti con durata. */
  avgMin: number | null;
  /** Notti con durata usate per la media. */
  n: number;
}

/**
 * Durata della notte in minuti tra letto e risveglio (istanti assoluti: corretta anche
 * nei cambi d'ora). Null se manca un orario o se gli orari sono incoerenti (risveglio
 * non successivo al letto). Nessuna stima nascosta: un orario `stimato` è già marcato
 * come tale nella provenienza e viene usato così com'è.
 */
export function nightDuration(n: Night): number | null {
  if (!hasTimes(n)) return null;
  const min = durationMinutes(n.bedAt.value, n.wakeAt.value);
  return Number.isFinite(min) && min > 0 ? min : null;
}

/** Medie di durata: ultime 7 notti e ultimi 30 giorni (finestre di calendario fino ad asOf incluso). */
export function durationStats(nights: Night[], asOfNightDate: string): DurationStats {
  const byDate = indexByDate(nights);
  return {
    avg7: averageOver(byDate, asOfNightDate, AVG_SHORT_WINDOW),
    avgMonth: averageOver(byDate, asOfNightDate, AVG_MONTH_WINDOW),
  };
}

/**
 * Debito di sonno = Σ max(0, target − durata) sulle notti con durata delle ultime 7
 * (finestra di calendario). Le notti mancanti non contano come debito.
 * Sotto 3 notti con dato: value null e hiddenReason.
 */
export function sleepDebt(
  nights: Night[],
  asOfNightDate: string,
  targetMin: number = DEFAULT_TARGET_SLEEP_MIN,
): Stat<number> {
  const durations = windowDurations(indexByDate(nights), asOfNightDate, SLEEP_DEBT_WINDOW).map((w) => w.min);
  const coverage: Coverage = { used: durations.length, window: SLEEP_DEBT_WINDOW };
  if (durations.length < SLEEP_DEBT_MIN_NIGHTS) {
    return { value: null, coverage, hiddenReason: notEnoughNights(SLEEP_DEBT_MIN_NIGHTS, durations.length) };
  }
  const value = durations.reduce((acc, d) => acc + Math.max(0, targetMin - d), 0);
  return { value, coverage };
}

/**
 * Sonno delle 24 ore = durata della notte + sonnellini del giorno nightDate.
 * Null se la durata della notte manca (il totale sarebbe una sottostima nascosta).
 * Sono esclusi i sonnellini con provenienza `mancante` o minuti non positivi.
 */
export function sleep24h(night: Night, naps: Nap[]): number | null {
  const base = nightDuration(night);
  if (base === null) return null;
  const napMin = naps
    .filter((p) => p.date === night.nightDate && p.provenance !== 'mancante' && Number.isFinite(p.minutes) && p.minutes > 0)
    .reduce((acc, p) => acc + p.minutes, 0);
  return base + napMin;
}

/**
 * Trend mensile: durata media per mese solare (su nightDate) degli ultimi `months` mesi,
 * mese di asOf incluso, in ordine cronologico (dal più vecchio). Notti dopo asOf escluse.
 */
export function monthlyTrend(nights: Night[], asOfNightDate: string, months = 6): MonthlyTrendPoint[] {
  if (!Number.isFinite(months) || months < 1) return [];
  const count = Math.floor(months);
  const asOfMonth = asOfNightDate.slice(0, 7);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(shiftMonth(asOfMonth, -i));

  const sums = new Map<string, { sum: number; n: number }>(keys.map((k) => [k, { sum: 0, n: 0 }]));
  for (const night of indexByDate(nights).values()) {
    if (night.nightDate > asOfNightDate) continue;
    const bucket = sums.get(night.nightDate.slice(0, 7));
    if (!bucket) continue;
    const min = nightDuration(night);
    if (min === null) continue;
    bucket.sum += min;
    bucket.n += 1;
  }
  return keys.map((month) => {
    const b = sums.get(month) as { sum: number; n: number };
    return { month, avgMin: b.n > 0 ? Math.round(b.sum / b.n) : null, n: b.n };
  });
}

/** Fascia di colore: ≥ 8h sage, ≥ 7h blue, altrimenti peach. */
export function durationBand(min: number): DurationBand {
  if (min >= BAND_SAGE_MIN) return 'sage';
  if (min >= BAND_BLUE_MIN) return 'blue';
  return 'peach';
}

// ---------------------------------------------------------------------------

function indexByDate(nights: Night[]): Map<string, Night> {
  const m = new Map<string, Night>();
  for (const n of nights) m.set(n.nightDate, n);
  return m;
}

function windowDurations(
  byDate: Map<string, Night>,
  asOfNightDate: string,
  windowDays: number,
): Array<{ min: number; isException: boolean }> {
  const out: Array<{ min: number; isException: boolean }> = [];
  for (let i = 0; i < windowDays; i++) {
    const night = byDate.get(addDays(asOfNightDate, -i));
    if (!night) continue;
    const min = nightDuration(night);
    if (min === null) continue;
    out.push({ min, isException: night.isException });
  }
  return out;
}

function averageOver(byDate: Map<string, Night>, asOfNightDate: string, windowDays: number): DurationStat {
  const items = windowDurations(byDate, asOfNightDate, windowDays);
  const coverage: Coverage = { used: items.length, window: windowDays };
  const exceptionsIncluded = items.filter((i) => i.isException).length;
  if (items.length === 0) {
    return { value: null, coverage, hiddenReason: notEnoughNights(1, 0), exceptionsIncluded };
  }
  const value = Math.round(items.reduce((acc, i) => acc + i.min, 0) / items.length);
  return { value, coverage, exceptionsIncluded };
}

function notEnoughNights(required: number, have: number): string {
  const head = required === 1 ? 'Serve almeno 1 notte.' : `Servono almeno ${required} notti.`;
  return `${head} Per ora ne hai ${have}.`;
}

function shiftMonth(yyyyMm: string, delta: number): string {
  const y = Number(yyyyMm.slice(0, 4));
  const m = Number(yyyyMm.slice(5, 7)) - 1 + delta;
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`;
}
