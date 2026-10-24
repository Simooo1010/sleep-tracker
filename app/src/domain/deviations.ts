/**
 * Scarti dal riferimento e statistiche di regolarità
 * (docs/design/system/Dati-e-calcoli.md §Regolarità, PROJECT.md §3c/§5b/§5c).
 *
 * - Scarto di una notte = orario − mediana, in minuti con segno. Letto sull'asse dalle 18:00
 *   (bedAxisMinutes), sveglia in minuti dalla mezzanotte (wakeAxisMinutes): entrambi orario
 *   locale Europe/Rome, quindi il cambio d'ora non sposta lo scarto.
 * - Mancante resta mancante: dato assente ⇒ null, mai zero.
 * - Il riferimento (baseline) è un parametro: qui non si calcola.
 * Funzioni pure: la data di riferimento è sempre passata come parametro.
 */
import { BASELINE_WINDOW_DAYS, TOLERANCE_MIN, type Night, type Stat } from './types';
import { addDays, bedAxisMinutes, hasTimes, median, stdDev, wakeAxisMinutes } from './time';

/** Minimo di notti utilizzabili per mostrare le statistiche di regolarità (come il riferimento). */
export const REGULARITY_MIN_NIGHTS = 5;

/** Riferimento passato dall'esterno (stessa forma di Baseline in baseline.ts). */
export interface DeviationBaseline {
  /** Mediana dell'orario di letto, minuti dalle 18:00 locali. */
  bedMin: number;
  /** Mediana dell'orario di risveglio, minuti dalla mezzanotte locale. */
  wakeMin: number;
}

export interface NightDeviation {
  nightDate: string;
  /** Orario di letto − mediana (min, con segno). null se manca l'orario di letto. */
  bedDev: number | null;
  /** Orario di risveglio − mediana (min, con segno). null se manca l'orario di risveglio. */
  wakeDev: number | null;
  /** |bedDev| <= TOLERANCE_MIN. null se manca il dato. */
  bedOk: boolean | null;
  /** |wakeDev| <= TOLERANCE_MIN. null se manca il dato. */
  wakeOk: boolean | null;
  /** bedOk && wakeOk. null se manca uno dei due dati. */
  regular: boolean | null;
  /** true per le notti-eccezione: scarto calcolato e visibile, ma fuori dalle statistiche. */
  excluded: boolean;
}

export interface RegularityStats {
  /** Notti regolari (letto e sveglia entro tolleranza) su notti utilizzabili. */
  withinTolerance: Stat<{ count: number; of: number }>;
  /** Deviazione standard campionaria dell'orario di letto (min). */
  stdBed: Stat<number>;
  /** Deviazione standard campionaria dell'orario di risveglio (min). */
  stdWake: Stat<number>;
  /** Mediana dei punti medi del sonno, minuti sull'asse letto (dalle 18:00). */
  midpoint: Stat<number>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MIN = 24 * 60;

type TimedNight = Night & { bedAt: { value: string }; wakeAt: { value: string } };

function isOk(dev: number | null): boolean | null {
  return dev === null ? null : Math.abs(dev) <= TOLERANCE_MIN;
}

export function nightDeviation(night: Night, baseline: DeviationBaseline): NightDeviation {
  const bedDev = night.bedAt.value === null ? null : bedAxisMinutes(night.bedAt.value) - baseline.bedMin;
  const wakeDev = night.wakeAt.value === null ? null : wakeAxisMinutes(night.wakeAt.value) - baseline.wakeMin;
  const bedOk = isOk(bedDev);
  const wakeOk = isOk(wakeDev);
  return {
    nightDate: night.nightDate,
    bedDev,
    wakeDev,
    bedOk,
    wakeOk,
    regular: bedOk === null || wakeOk === null ? null : bedOk && wakeOk,
    excluded: night.isException,
  };
}

/**
 * Punto medio sull'asse letto: metà tra orario di letto e orario di risveglio letti sull'orologio
 * locale (coerente con le barre del grafico). Il risveglio è riportato sull'asse letto e, se
 * cadesse prima del letto, spostato di 24 h; il risultato resta in [0, 1440).
 */
function midpointAxis(n: TimedNight): number {
  const bed = bedAxisMinutes(n.bedAt.value);
  let wake = bedAxisMinutes(n.wakeAt.value);
  if (wake < bed) wake += DAY_MIN;
  return ((bed + wake) / 2) % DAY_MIN;
}

/** Una notte entra nelle statistiche se ha entrambi gli orari, non è eccezione e non è 'mancante'. */
function isUsable(n: Night): n is TimedNight {
  return !n.isException && n.status !== 'mancante' && hasTimes(n);
}

/** Più record per la stessa nightDate: se ne conta uno, preferendo 'confermata', poi il primo. */
function rank(n: Night): number {
  return n.status === 'confermata' ? 0 : 1;
}

export function regularityStats(
  nights: Night[],
  baseline: DeviationBaseline,
  asOfNightDate: string,
): RegularityStats {
  if (!DATE_RE.test(asOfNightDate)) throw new Error(`Data non valida: ${asOfNightDate}`);

  const from = addDays(asOfNightDate, -(BASELINE_WINDOW_DAYS - 1)); // incluso
  const to = asOfNightDate; // incluso

  const byDate = new Map<string, TimedNight>();
  for (const n of nights) {
    if (n.nightDate < from || n.nightDate > to) continue;
    if (!isUsable(n)) continue;
    const prev = byDate.get(n.nightDate);
    if (!prev || rank(n) < rank(prev)) byDate.set(n.nightDate, n);
  }

  const used = [...byDate.values()];
  const coverage = { used: used.length, window: BASELINE_WINDOW_DAYS };

  if (used.length < REGULARITY_MIN_NIGHTS) {
    const hiddenReason = `Servono almeno ${REGULARITY_MIN_NIGHTS} notti. Per ora ne hai ${used.length}.`;
    const hidden = { value: null, coverage, hiddenReason };
    return { withinTolerance: hidden, stdBed: hidden, stdWake: hidden, midpoint: hidden };
  }

  const count = used.filter((n) => nightDeviation(n, baseline).regular === true).length;
  // used.length >= 5 ⇒ stdDev e median non sono mai null.
  const stdBed = stdDev(used.map((n) => bedAxisMinutes(n.bedAt.value))) as number;
  const stdWake = stdDev(used.map((n) => wakeAxisMinutes(n.wakeAt.value))) as number;
  const midpoint = median(used.map(midpointAxis)) as number;

  return {
    withinTolerance: { value: { count, of: used.length }, coverage },
    stdBed: { value: stdBed, coverage },
    stdWake: { value: stdWake, coverage },
    midpoint: { value: midpoint, coverage },
  };
}

/**
 * Minuti con segno, arrotondati all'intero (simmetrico rispetto allo zero):
 * '+12 min', '−5 min' (meno tipografico U+2212), '0 min'.
 */
export function formatSigned(min: number): string {
  if (!Number.isFinite(min)) throw new RangeError(`Minuti non validi: ${min}`);
  const abs = Math.round(Math.abs(min));
  if (abs === 0) return '0 min';
  return `${min < 0 ? '−' : '+'}${abs} min`;
}
