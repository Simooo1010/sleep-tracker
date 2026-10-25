/**
 * Previsione dell'energia di domani e heatmap per giorno della settimana.
 * Spec: docs/design/system/Dati-e-calcoli.md ("Previsioni e insight", "Fasce di colore"),
 * docs/PROJECT.md §5c. Funzioni pure: la data di riferimento è sempre un parametro.
 */
import type { Nap, Night, Stat } from './types';
import { durationBand, type DurationBand } from './sleep-balance';
import { addDays, bedAxisMinutes, durationMinutes, hasTimes, localParts } from './time';

/** Notti con energia nota necessarie prima di mostrare una stima. */
export const FORECAST_MIN_NIGHTS = 10;
/** Raggio del kernel lineare sulla durata: oltre questo scarto la notte pesa 0. */
export const FORECAST_DURATION_BANDWIDTH_MIN = 90;
/** Raggio del kernel lineare sull'orario di letto (asse da 18:00): oltre pesa 0. */
export const FORECAST_BED_BANDWIDTH_MIN = 90;
/** Moltiplicatore del peso quando lo stato sonnellino della notte differisce da oggi. */
export const FORECAST_NAP_MISMATCH_FACTOR = 0.5;

export type EnergyLabel = 'bassa' | 'media' | 'alta';

export interface EnergyForecast {
  /** Media pesata dell'energia (1–5), 1 decimale. */
  score: number;
  label: EnergyLabel;
  /** Notti con peso > 0 ("Stima su N notti"). */
  basedOn: number;
}

export interface TonightInput {
  /** Orario di letto previsto su asse continuo (minuti dalle 18:00, vedi bedAxisMinutes). */
  bedAxisMin: number | null;
  /** Durata prevista in minuti. */
  expectedDurationMin: number | null;
  napToday: boolean;
}

export function energyLabel(score: number): EnergyLabel {
  if (score < 2.7) return 'bassa';
  if (score < 3.7) return 'media';
  return 'alta';
}

/** Kernel lineare: 1 a distanza 0, 0 a distanza >= bandwidth. */
function linearKernel(distance: number, bandwidth: number): number {
  return Math.max(0, 1 - Math.abs(distance) / bandwidth);
}

interface EnergySample {
  nightDate: string;
  energy: number;
  bedAxis: number;
  duration: number;
}

/**
 * Previsione dell'energia di domani mattina, per somiglianza con le notti passate.
 *
 * Notti usate: nightDate <= asOfNightDate, non eccezione, orari di letto e risveglio presenti
 * (durata > 0), energia con valore (non stimata). Peso = kernel(durata) × kernel(letto)
 * (le componenti con input null sono ignorate) × 0,5 se lo stato sonnellino differisce
 * (solo se `naps` è fornito). Punteggio = media pesata, 1 decimale.
 *
 * Nascosta (value null) se: meno di 10 notti con energia; input di stanotte tutto null;
 * nessuna notte con peso > 0.
 *
 * @param naps opzionale: sonnellini storici, per confrontare `napToday` con il giorno
 *   precedente a ciascuna notte (nap.date = giorno prima del nightDate). Senza, napToday è ignorato.
 */
export function forecastEnergy(
  nights: Night[],
  tonight: TonightInput,
  asOfNightDate: string,
  naps: Nap[] = [],
): Stat<EnergyForecast> {
  const samples: EnergySample[] = [];
  for (const n of nights) {
    if (n.nightDate > asOfNightDate) continue;
    if (n.isException) continue;
    if (n.energy.value === null || n.energy.provenance === 'stimato') continue;
    if (!hasTimes(n)) continue;
    const duration = durationMinutes(n.bedAt.value, n.wakeAt.value);
    if (!(duration > 0)) continue;
    samples.push({
      nightDate: n.nightDate,
      energy: n.energy.value,
      bedAxis: bedAxisMinutes(n.bedAt.value),
      duration,
    });
  }

  const available = samples.length;
  if (available < FORECAST_MIN_NIGHTS) {
    return {
      value: null,
      coverage: { used: available, window: FORECAST_MIN_NIGHTS },
      hiddenReason: `Servono almeno ${FORECAST_MIN_NIGHTS} notti con energia. Per ora ne hai ${available}.`,
    };
  }

  const { bedAxisMin, expectedDurationMin, napToday } = tonight;
  if (bedAxisMin === null && expectedDurationMin === null) {
    return {
      value: null,
      coverage: { used: 0, window: available },
      hiddenReason: 'Serve l’orario di letto o la durata prevista per stimare l’energia.',
    };
  }

  const useNaps = naps.length > 0;
  const napDays = new Set(naps.filter((p) => p.minutes > 0).map((p) => p.date));

  let weightSum = 0;
  let weighted = 0;
  let basedOn = 0;
  for (const s of samples) {
    let w = 1;
    if (expectedDurationMin !== null) {
      w *= linearKernel(s.duration - expectedDurationMin, FORECAST_DURATION_BANDWIDTH_MIN);
    }
    if (bedAxisMin !== null) {
      w *= linearKernel(s.bedAxis - bedAxisMin, FORECAST_BED_BANDWIDTH_MIN);
    }
    if (useNaps && napDays.has(addDays(s.nightDate, -1)) !== napToday) {
      w *= FORECAST_NAP_MISMATCH_FACTOR;
    }
    if (w <= 0) continue;
    basedOn++;
    weightSum += w;
    weighted += w * s.energy;
  }

  if (basedOn === 0) {
    return {
      value: null,
      coverage: { used: 0, window: available },
      hiddenReason: 'Nessuna notte passata simile a stanotte: stima non disponibile.',
    };
  }

  const score = Math.round((weighted / weightSum) * 10) / 10;
  return {
    value: { score, label: energyLabel(score), basedOn },
    coverage: { used: basedOn, window: available },
  };
}

export interface WeekdayCell {
  /** 0 = lunedì … 6 = domenica (giorno del risveglio, cioè del nightDate). */
  weekday: number;
  /** Durata media in minuti (arrotondata), null se n = 0. */
  avgMin: number | null;
  n: number;
  band: DurationBand | null;
}

/**
 * Durata media per giorno della settimana sulle ultime `weeks` settimane
 * (nightDate in (asOf − 7·weeks giorni, asOf]). Esclude eccezioni, notti senza orari
 * e durate <= 0. Restituisce sempre 7 celle, lunedì → domenica.
 */
export function weekdayHeatmap(nights: Night[], asOfNightDate: string, weeks = 8): WeekdayCell[] {
  const days = Math.max(0, Math.floor(Number.isFinite(weeks) ? weeks : 0)) * 7;
  const from = addDays(asOfNightDate, -days); // esclusivo
  const sums = Array.from({ length: 7 }, () => 0);
  const counts = Array.from({ length: 7 }, () => 0);

  for (const n of nights) {
    if (n.nightDate > asOfNightDate || n.nightDate <= from) continue;
    if (n.isException) continue;
    if (!hasTimes(n)) continue;
    const d = durationMinutes(n.bedAt.value, n.wakeAt.value);
    if (!(d > 0)) continue;
    const wd = localParts(`${n.nightDate}T12:00:00Z`).weekday;
    sums[wd] = (sums[wd] ?? 0) + d;
    counts[wd] = (counts[wd] ?? 0) + 1;
  }

  return counts.map((n, weekday) => {
    if (n === 0) return { weekday, avgMin: null, n: 0, band: null };
    const avgMin = Math.round((sums[weekday] ?? 0) / n);
    return { weekday, avgMin, n, band: durationBand(avgMin) };
  });
}
