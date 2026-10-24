/**
 * Social jet lag: differenza tra il punto medio del sonno del weekend e quello dei giorni feriali.
 * Spec: docs/design/system/Dati-e-calcoli.md (§Regolarità) e docs/PROJECT.md §5b/§5c.
 *
 * Funzione pura: nessun Date.now(); la data di riferimento è sempre passata come parametro.
 */
import type { Night, Stat } from './types';
import { addDays, bedAxisMinutes, hasTimes, isWeekendNight, median, wakeAxisMinutes } from './time';

export const SJL_MIN_WEEKEND_NIGHTS = 3;
export const SJL_MIN_WEEKDAY_NIGHTS = 5;
export const SJL_DEFAULT_WINDOW_DAYS = 28;

export interface SocialJetlag {
  /** Mediana dei punti medi feriali, minuti dalle 18:00 locali (stesso asse di bedAxisMinutes). */
  weekdayMidMin: number;
  /** Mediana dei punti medi del weekend, minuti dalle 18:00 locali. */
  weekendMidMin: number;
  /** weekendMidMin − weekdayMidMin, con segno (positivo = nel weekend si dorme più tardi). */
  sjlMin: number;
  /** Mediana orario di letto feriale, minuti dalle 18:00 locali (bedAxisMinutes). */
  weekdayBedMin: number;
  /** Mediana orario di letto weekend, minuti dalle 18:00 locali (bedAxisMinutes). */
  weekendBedMin: number;
  /** Mediana orario di risveglio feriale, minuti dalla mezzanotte locale (wakeAxisMinutes). */
  weekdayWakeMin: number;
  /** Mediana orario di risveglio weekend, minuti dalla mezzanotte locale (wakeAxisMinutes). */
  weekendWakeMin: number;
}

/**
 * Punto medio del sonno di una notte, in minuti dalle 18:00 locali della sera.
 *
 * Scelta: letto e sveglia vengono portati sullo stesso asse continuo "minuti dalle 18:00":
 * - letto  = bedAxisMinutes(bedAt)            (23:30 → 330, 00:40 → 400)
 * - sveglia = wakeAxisMinutes(wakeAt) + 6*60  (07:00 → 780: dalle 18:00 alla mezzanotte sono 6 h)
 * Il punto medio è la media dei due. Si lavora sugli orari dell'orologio locale (Europe/Rome),
 * non sulla durata fisica: nelle notti del cambio d'ora il punto medio è quindi l'ora "di parete"
 * a metà tra le due letture, coerente con come l'utente legge letto e sveglia.
 */
export function sleepMidpointAxisMinutes(bedIso: string, wakeIso: string): number {
  const bed = bedAxisMinutes(bedIso);
  const wake = wakeAxisMinutes(wakeIso) + 6 * 60;
  return (bed + wake) / 2;
}

interface Bucket {
  mids: number[];
  beds: number[];
  wakes: number[];
}

const emptyBucket = (): Bucket => ({ mids: [], beds: [], wakes: [] });

/**
 * Calcola il social jet lag sulle notti con nightDate in [asOfNightDate − windowDays + 1, asOfNightDate].
 * Escluse: notti-eccezione e notti senza entrambi gli orari. Le notti stimate con orari sono incluse.
 * Weekend = notti di venerdì e sabato (isWeekendNight). Mediane robuste (median di time.ts).
 * Sotto soglia (≥3 notti weekend e ≥5 feriali): value null con hiddenReason.
 */
export function computeSocialJetlag(
  nights: Night[],
  asOfNightDate: string,
  windowDays: number = SJL_DEFAULT_WINDOW_DAYS,
): Stat<SocialJetlag> {
  const span = Math.max(0, Math.floor(windowDays));
  const fromDate = addDays(asOfNightDate, -(span - 1));

  const weekend = emptyBucket();
  const weekday = emptyBucket();

  for (const n of nights) {
    if (span === 0) break;
    if (n.nightDate < fromDate || n.nightDate > asOfNightDate) continue;
    if (n.isException) continue;
    if (!hasTimes(n)) continue;
    const bedIso = n.bedAt.value;
    const wakeIso = n.wakeAt.value;
    const b = isWeekendNight(n.nightDate) ? weekend : weekday;
    b.mids.push(sleepMidpointAxisMinutes(bedIso, wakeIso));
    b.beds.push(bedAxisMinutes(bedIso));
    b.wakes.push(wakeAxisMinutes(wakeIso));
  }

  const we = weekend.mids.length;
  const wd = weekday.mids.length;
  const coverage = { used: we + wd, window: windowDays };

  if (we < SJL_MIN_WEEKEND_NIGHTS || wd < SJL_MIN_WEEKDAY_NIGHTS) {
    return {
      value: null,
      coverage,
      hiddenReason: `Servono almeno ${SJL_MIN_WEEKEND_NIGHTS} notti nel weekend e ${SJL_MIN_WEEKDAY_NIGHTS} nei giorni feriali. Per ora ne hai ${we} e ${wd}.`,
    };
  }

  // Le soglie garantiscono array non vuoti: median non restituisce null.
  const m = (xs: number[]): number => median(xs) as number;
  const weekendMidMin = m(weekend.mids);
  const weekdayMidMin = m(weekday.mids);

  return {
    value: {
      weekdayMidMin,
      weekendMidMin,
      sjlMin: weekendMidMin - weekdayMidMin,
      weekdayBedMin: m(weekday.beds),
      weekendBedMin: m(weekend.beds),
      weekdayWakeMin: m(weekday.wakes),
      weekendWakeMin: m(weekend.wakes),
    },
    coverage,
  };
}

/**
 * Durata leggibile per la UI: 65 → '1 h 05 min', 40 → '40 min', 60 → '1 h 00 min', 0 → '0 min'.
 * Arrotonda al minuto. Valori negativi: prefisso '-' (es. −65 → '-1 h 05 min').
 */
export function formatDuration(min: number): string {
  if (!Number.isFinite(min)) throw new RangeError(`Durata non valida: ${min}`);
  const total = Math.round(Math.abs(min));
  const sign = min < 0 && total > 0 ? '-' : '';
  const h = Math.floor(total / 60);
  const mm = total % 60;
  if (h === 0) return `${sign}${mm} min`;
  return `${sign}${h} h ${String(mm).padStart(2, '0')} min`;
}
