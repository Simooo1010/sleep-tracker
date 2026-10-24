/**
 * Riferimento della regolarità (docs/design/system/Dati-e-calcoli.md §Regolarità, PROJECT.md §3c/§5b).
 * Riferimento = MEDIANA di orario di letto (asse dalle 18:00) e di risveglio (minuti dalla mezzanotte)
 * sulle notti dei 14 giorni di calendario che precedono la notte di riferimento (esclusa).
 * Funzione pura: la data di riferimento è sempre passata come parametro.
 */
import { BASELINE_WINDOW_DAYS, type Night, type Stat } from './types';
import { addDays, bedAxisMinutes, hasTimes, median, wakeAxisMinutes } from './time';

export const BASELINE_MIN_NIGHTS = 5;

export interface Baseline {
  /** Mediana dell'orario di letto, in minuti dalle 18:00 locali (vedi bedAxisMinutes). */
  bedMin: number;
  /** Mediana dell'orario di risveglio, in minuti dalla mezzanotte locale. */
  wakeMin: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Una notte entra nel riferimento se ha entrambi gli orari, non è eccezione e non è 'mancante'. */
function isUsable(n: Night): n is Night & { bedAt: { value: string }; wakeAt: { value: string } } {
  return !n.isException && n.status !== 'mancante' && hasTimes(n);
}

/** In caso di più record per la stessa nightDate ne conta uno solo: preferisce 'confermata', poi il primo. */
function rank(n: Night): number {
  return n.status === 'confermata' ? 0 : 1;
}

export function computeBaseline(nights: Night[], asOfNightDate: string): Stat<Baseline> {
  if (!DATE_RE.test(asOfNightDate)) throw new Error(`Data non valida: ${asOfNightDate}`);

  const from = addDays(asOfNightDate, -BASELINE_WINDOW_DAYS); // incluso
  const to = asOfNightDate; // escluso

  const byDate = new Map<string, Night & { bedAt: { value: string }; wakeAt: { value: string } }>();
  for (const n of nights) {
    if (n.nightDate < from || n.nightDate >= to) continue;
    if (!isUsable(n)) continue;
    const prev = byDate.get(n.nightDate);
    if (!prev || rank(n) < rank(prev)) byDate.set(n.nightDate, n);
  }

  const used = [...byDate.values()];
  const coverage = { used: used.length, window: BASELINE_WINDOW_DAYS };

  if (used.length < BASELINE_MIN_NIGHTS) {
    return {
      value: null,
      coverage,
      hiddenReason: `Servono almeno ${BASELINE_MIN_NIGHTS} notti. Per ora ne hai ${used.length}.`,
    };
  }

  const bedMin = median(used.map((n) => bedAxisMinutes(n.bedAt.value)));
  const wakeMin = median(used.map((n) => wakeAxisMinutes(n.wakeAt.value)));
  // used.length >= 5 ⇒ le mediane non sono mai null.
  return { value: { bedMin: bedMin as number, wakeMin: wakeMin as number }, coverage };
}
