/**
 * Deriva della mediana dell'orario di letto.
 * Spec: docs/design/system/Dati-e-calcoli.md (Regolarità → Deriva), docs/PROJECT.md §5b/§5c,
 * componente DriftChart. Funzioni pure: la data di riferimento è sempre un parametro.
 */
import type { Night, Stat } from './types';
import { TOLERANCE_MIN } from './types';
import { addDays, bedAxisMinutes, median } from './time';

/** Numero di mediane settimanali mostrate. */
export const DRIFT_WEEKS = 6;
/** Giorni coperti dalla finestra complessiva (6 settimane). */
export const DRIFT_WINDOW_DAYS = DRIFT_WEEKS * 7;
/** Settimane valide minime perché la deriva sia mostrata. */
export const DRIFT_MIN_WEEKS = 3;
/** Notti minime in una settimana perché la sua mediana sia valida. */
export const DRIFT_MIN_NIGHTS_PER_WEEK = 3;

export interface DriftWeek {
  /** Ultimo giorno (incluso) della finestra di 7 giorni, 'YYYY-MM-DD'. */
  weekEnd: string;
  /** Mediana del letto in minuti dalle 18:00 locali (asse di bedAxisMinutes); null se n < 3. */
  bedMin: number | null;
  /** Notti utilizzabili nella settimana (no eccezioni, letto presente). */
  n: number;
}

export interface Drift {
  /** 6 settimane, dalla più vecchia alla più recente (l'ultima termina a asOf). */
  weeklyMedians: DriftWeek[];
  /** Ultima mediana valida − prima mediana valida, minuti interi con segno (+ = più tardi). */
  shiftMin: number;
  /** Distanza in settimane tra la prima e l'ultima mediana valida. */
  weeks: number;
  /** |shiftMin| > TOLERANCE_MIN. */
  exceeds: boolean;
  /** Es. '+42 min in 5 settimane', '−35 min in 4 settimane'. */
  badge: string;
}

const MINUS = '−';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Testo del badge: segno tipografico (+ / U+2212, nessun segno per 0), 'settimana' al singolare se 1. */
export function formatDriftBadge(shiftMin: number, weeks: number): string {
  const v = Math.round(shiftMin);
  const sign = v > 0 ? '+' : v < 0 ? MINUS : '';
  const unit = weeks === 1 ? 'settimana' : 'settimane';
  return `${sign}${Math.abs(v)} min in ${weeks} ${unit}`;
}

export function computeDrift(nights: Night[], asOfNightDate: string): Stat<Drift> {
  if (!DATE_RE.test(asOfNightDate) || Number.isNaN(Date.parse(`${asOfNightDate}T12:00:00Z`))) {
    throw new Error(`Data non valida: ${asOfNightDate}`);
  }
  const windowStart = addDays(asOfNightDate, -(DRIFT_WINDOW_DAYS - 1));

  // Una notte per data (l'ultima occorrenza vince), solo dentro la finestra e utilizzabile.
  const byDate = new Map<string, number>();
  for (const n of nights) {
    if (n.nightDate < windowStart || n.nightDate > asOfNightDate) continue;
    if (n.isException || n.bedAt.value === null) {
      byDate.delete(n.nightDate);
      continue;
    }
    byDate.set(n.nightDate, bedAxisMinutes(n.bedAt.value));
  }

  const weeklyMedians: DriftWeek[] = [];
  let used = 0;
  for (let i = 0; i < DRIFT_WEEKS; i++) {
    const weekEnd = addDays(asOfNightDate, -7 * (DRIFT_WEEKS - 1 - i));
    const weekStart = addDays(weekEnd, -6);
    const values: number[] = [];
    for (const [date, min] of byDate) {
      if (date >= weekStart && date <= weekEnd) values.push(min);
    }
    const valid = values.length >= DRIFT_MIN_NIGHTS_PER_WEEK;
    if (valid) used += values.length;
    weeklyMedians.push({ weekEnd, bedMin: valid ? median(values) : null, n: values.length });
  }

  const coverage = { used, window: DRIFT_WINDOW_DAYS };
  const validIdx = weeklyMedians.flatMap((w, i) => (w.bedMin !== null ? [i] : []));
  if (validIdx.length < DRIFT_MIN_WEEKS) {
    return {
      value: null,
      coverage,
      hiddenReason: `Servono almeno ${DRIFT_MIN_WEEKS} settimane di dati. Per ora ne hai ${validIdx.length}.`,
    };
  }

  const firstIdx = validIdx[0] as number;
  const lastIdx = validIdx[validIdx.length - 1] as number;
  const first = weeklyMedians[firstIdx]?.bedMin as number;
  const last = weeklyMedians[lastIdx]?.bedMin as number;
  const shiftMin = Math.round(last - first) || 0; // evita -0
  const weeks = lastIdx - firstIdx;

  return {
    value: {
      weeklyMedians,
      shiftMin,
      weeks,
      exceeds: Math.abs(shiftMin) > TOLERANCE_MIN,
      badge: formatDriftBadge(shiftMin, weeks),
    },
    coverage,
  };
}
