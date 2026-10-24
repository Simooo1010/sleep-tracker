/**
 * Correlazioni fattori → voti (qualità percepita, energia mattutina, umore serale).
 * Spec: docs/design/system/Dati-e-calcoli.md §Correlazioni, docs/PROJECT.md §5c.
 *
 * Sono sempre indizi, mai cause: gli hint non usano linguaggio causale.
 * Funzione pura: nessun I/O, nessun Date.now().
 */
import type { EveningCheck, Night, Stat } from './types';
import { addDays } from './time';

export type CorrelationOutcome = 'quality' | 'energy' | 'mood';
export type CorrelationTone = 'sage' | 'peach' | 'neutral';

export interface Correlation {
  factor: string;
  outcome: CorrelationOutcome;
  /** Voti disponibili nelle notti CON il fattore. */
  withN: number;
  /** Voti disponibili nelle notti SENZA il fattore. */
  withoutN: number;
  /** media(con) − media(senza), arrotondata a 1 decimale; null se dati insufficienti. */
  diff: number | null;
  tone: CorrelationTone;
  hint: string;
}

/** Notti con dati necessarie per mostrare le correlazioni. */
export const CORRELATION_MIN_NIGHTS = 14;
/** Occorrenze minime di un fattore (voti nelle notti con il fattore). */
export const CORRELATION_MIN_OCCURRENCES = 5;
/** Soglia di colore: |diff| ≥ 0,3. */
export const CORRELATION_TONE_THRESHOLD = 0.3;

export const OUTCOMES: readonly CorrelationOutcome[] = ['quality', 'energy', 'mood'];

export const HINT_NEED_OCCURRENCES = 'ne servono 5';
export const HINT_NEED_WITHOUT = 'servono anche notti senza questo fattore';

/** Arrotondamento a 1 decimale simmetrico rispetto allo zero, robusto agli errori in virgola mobile. */
export function roundDiff(x: number): number {
  const r = (Math.sign(x) * Math.round(Math.abs(x) * 10 + 1e-9)) / 10;
  return r === 0 ? 0 : r; // niente -0
}

export function toneOf(diff: number | null): CorrelationTone {
  if (diff === null) return 'neutral';
  if (diff >= CORRELATION_TONE_THRESHOLD) return 'sage';
  if (diff <= -CORRELATION_TONE_THRESHOLD) return 'peach';
  return 'neutral';
}

function formatIt(x: number): string {
  return x.toFixed(1).replace('.', ',');
}

function hintFor(diff: number): string {
  if (diff > 0) {
    return `Nelle notti con questo fattore il voto è stato in media più alto di ${formatIt(diff)} rispetto alle altre`;
  }
  if (diff < 0) {
    return `Nelle notti con questo fattore il voto è stato in media più basso di ${formatIt(-diff)} rispetto alle altre`;
  }
  return 'Nelle notti con questo fattore il voto è stato in media uguale alle altre';
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Per ogni fattore (nell'ordine dato) e per ciascun risultato (quality, energy, mood):
 * diff = media dei voti nelle notti con il fattore − media nelle notti senza.
 * - quality / energy: dalla notte stessa.
 * - mood: umore del check serale della sera PRECEDENTE (data = nightDate − 1 giorno).
 * Voti mancanti scartati. Notti duplicate (stessa nightDate) e check duplicati: vince l'ultimo.
 * Notte "con dati" = almeno un voto tra qualità, energia e umore della sera prima.
 * Le notti-eccezione sono incluse (l'esclusione da spec vale solo per il riferimento di regolarità).
 */
export function computeCorrelations(
  nights: Night[],
  eveningChecks: EveningCheck[],
  factorSlugs: string[],
): Stat<Correlation[]> {
  const byDate = new Map<string, Night>();
  for (const n of nights) byDate.set(n.nightDate, n);
  const moodByEvening = new Map<string, number | null>();
  for (const c of eveningChecks) moodByEvening.set(c.date, c.mood.value);

  const rows = [...byDate.values()].map((n) => ({
    factors: new Set(n.factors),
    votes: {
      quality: n.quality.value,
      energy: n.energy.value,
      mood: moodByEvening.get(addDays(n.nightDate, -1)) ?? null,
    } as Record<CorrelationOutcome, number | null>,
  }));

  const used = rows.filter((r) => OUTCOMES.some((o) => r.votes[o] !== null)).length;
  const coverage = { used, window: rows.length };

  if (used < CORRELATION_MIN_NIGHTS) {
    return {
      value: null,
      coverage,
      hiddenReason: `Servono almeno ${CORRELATION_MIN_NIGHTS} notti. Per ora ne hai ${used}.`,
    };
  }

  const value: Correlation[] = [];
  for (const factor of new Set(factorSlugs)) {
    for (const outcome of OUTCOMES) {
      const withVotes: number[] = [];
      const withoutVotes: number[] = [];
      for (const r of rows) {
        const v = r.votes[outcome];
        if (v === null) continue;
        (r.factors.has(factor) ? withVotes : withoutVotes).push(v);
      }
      const withN = withVotes.length;
      const withoutN = withoutVotes.length;
      let diff: number | null = null;
      let hint: string;
      if (withN < CORRELATION_MIN_OCCURRENCES) {
        hint = HINT_NEED_OCCURRENCES;
      } else if (withoutN === 0) {
        hint = HINT_NEED_WITHOUT;
      } else {
        diff = roundDiff(mean(withVotes) - mean(withoutVotes));
        hint = hintFor(diff);
      }
      value.push({ factor, outcome, withN, withoutN, diff, tone: toneOf(diff), hint });
    }
  }
  return { value, coverage };
}
