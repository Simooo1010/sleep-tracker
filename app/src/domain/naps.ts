/**
 * Sonnellini: ricostruzione dai segnali, recupero dal check serale, statistiche.
 * Spec: docs/design/system/Dati-e-calcoli.md §Sonnellini, docs/PROJECT.md §3c e §5c.
 * Funzioni pure: nessun I/O, nessun Date.now(); la data di riferimento è sempre un parametro.
 */
import type { EveningCheck, Nap, Night, Provenance, SignalEvent, Stat } from './types';
import { BASELINE_WINDOW_DAYS } from './types';
import { addDays, bedAxisMinutes, durationMinutes, localParts, median } from './time';

/** Sotto questa durata un sonnellino da segnali è rumore (comando toccato per sbaglio). */
export const NAP_MIN_MINUTES = 5;
/** Sopra questa durata un sonnellino da segnali è rumore (fine dimenticata, timer rimasto aperto). */
export const NAP_MAX_MINUTES = 240;
/** Soglie per mostrare gli effetti del sonnellino (indizi, mai cause). */
export const NAP_EFFECT_MIN_NIGHTS = 14;
export const NAP_EFFECT_MIN_NAP_DAYS = 3;
/** Orario segnaposto (minuti locali) per i sonnellini recuperati dal check serale: mezzogiorno. */
export const NAP_CHECK_PLACEHOLDER_MIN = 12 * 60;

export interface NapStats {
  frequency: Stat<{ days: number; of: 14 }>;
  avgMinutes: Stat<number>;
  typicalStartMin: Stat<number>;
  effectOnBedtime: Stat<number>;
  effectOnEnergy: Stat<number>;
}

function timeOf(iso: string): number {
  return new Date(iso).getTime();
}

function isValidIso(iso: string): boolean {
  return typeof iso === 'string' && !Number.isNaN(timeOf(iso));
}

/**
 * Accoppia nap_start / nap_end consecutivi (in ordine temporale) dello stesso giorno locale.
 * - nap_start seguito da un altro nap_start: il primo resta senza fine → nessun sonnellino.
 * - nap_end senza un nap_start in attesa: ignorato.
 * - inizio e fine in giorni locali diversi: scartati entrambi (nessuna durata inventata).
 * - durata < 5 min o > 240 min: rumore, scartato.
 * Gli eventi con ts non valido sono ignorati. Provenienza 'automatico'. Output ordinato per startAt.
 */
export function napsFromEvents(events: SignalEvent[]): Nap[] {
  const relevant = events
    .filter((e) => (e.type === 'nap_start' || e.type === 'nap_end') && isValidIso(e.ts))
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const d = timeOf(a.e.ts) - timeOf(b.e.ts);
      if (d !== 0) return d;
      // A parità di istante: prima gli inizi, poi le fini; altrimenti ordine di input.
      if (a.e.type !== b.e.type) return a.e.type === 'nap_start' ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.e);

  const naps: Nap[] = [];
  let pending: SignalEvent | null = null;

  for (const ev of relevant) {
    if (ev.type === 'nap_start') {
      pending = ev; // un eventuale inizio precedente senza fine viene scartato
      continue;
    }
    // nap_end
    if (pending === null) continue;
    const start = localParts(pending.ts);
    const end = localParts(ev.ts);
    if (start.date === end.date) {
      const minutes = durationMinutes(pending.ts, ev.ts);
      if (minutes >= NAP_MIN_MINUTES && minutes <= NAP_MAX_MINUTES) {
        naps.push({ date: start.date, startAt: pending.ts, minutes, provenance: 'automatico' });
      }
    }
    pending = null;
  }

  return naps.sort((a, b) => timeOf(a.startAt) - timeOf(b.startAt));
}

/** Istante ISO UTC corrispondente alle 12:00 locali (Europe/Rome) di `date`, o null se la data non è valida. */
export function localNoonIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const guess = timeOf(`${date}T12:00:00Z`);
  if (Number.isNaN(guess)) return null;
  const guessIso = new Date(guess).toISOString();
  if (guessIso.slice(0, 10) !== date) return null; // es. 2026-02-30
  // A mezzogiorno UTC l'ora locale è 13:00 (CET) o 14:00 (CEST), sempre lo stesso giorno:
  // a mezzogiorno non c'è mai ambiguità (il cambio d'ora avviene tra le 2 e le 3).
  const offsetMin = localParts(guessIso).minutes - NAP_CHECK_PLACEHOLDER_MIN;
  return new Date(guess - offsetMin * 60000).toISOString();
}

/**
 * Recupero dal check serale ("Sonnellino oggi? Nessuno, 15, 30, 45 min, 1 ora").
 * - value null, ≤ 0 o non finito, oppure provenienza 'mancante' → null (nessun sonnellino).
 * - startAt: segnaposto alle 12:00 locali del giorno (l'orario reale non è noto); questi
 *   sonnellini sono esclusi dall'orario di inizio tipico.
 * - provenienza: 'stimato' se il valore del check è stimato, altrimenti 'confermato'
 *   (è l'utente ad aver salvato il check, anche se il valore era precompilato 'automatico').
 * Nessun filtro di rumore 5–240 min: è un valore dichiarato dall'utente.
 */
export function napFromCheck(check: EveningCheck): Nap | null {
  const { value, provenance } = check.napMinutesToday;
  if (value === null || provenance === 'mancante') return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  const startAt = localNoonIso(check.date);
  if (startAt === null) return null;
  const prov: Provenance = provenance === 'stimato' ? 'stimato' : 'confermato';
  return { date: check.date, startAt, minutes: Math.round(value), provenance: prov };
}

/** Vero se l'orario di inizio è il segnaposto del check serale (non un orario reale). */
export function hasPlaceholderStart(nap: Nap): boolean {
  return nap.provenance !== 'automatico' && nap.startAt === localNoonIso(nap.date);
}

/**
 * Sonnellini validi, senza doppioni: se in un giorno esistono sonnellini con orario reale,
 * quelli recuperati dal check (segnaposto) per lo stesso giorno sono considerati lo stesso
 * sonnellino e scartati.
 */
function cleanNaps(naps: Nap[]): Nap[] {
  const valid = naps.filter((n) => Number.isFinite(n.minutes) && n.minutes > 0 && isValidIso(n.startAt));
  const realDays = new Set(valid.filter((n) => !hasPlaceholderStart(n)).map((n) => n.date));
  return valid.filter((n) => !(hasPlaceholderStart(n) && realDays.has(n.date)));
}

function hidden<T>(coverage: { used: number; window: number }, hiddenReason: string): Stat<T> {
  return { value: null, coverage, hiddenReason };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Statistiche dei sonnellini.
 *
 * Finestra di frequenza/durata/orario: i 14 giorni locali da asOfNightDate−13 ad asOfNightDate inclusi.
 * - frequency: giorni con almeno un sonnellino su 14. coverage.used = giorni "osservati"
 *   (con un sonnellino, oppure con la notte nightDate D o D+1 non 'mancante'). Nascosta solo se
 *   nessun giorno è osservato.
 * - avgMinutes: durata media per sonnellino (arrotondata al minuto). coverage.used = giorni con sonnellino.
 * - typicalStartMin: mediana dei minuti dalla mezzanotte locale di inizio, solo sonnellini con
 *   orario reale (esclusi i segnaposto del check). coverage.used = sonnellini con orario reale.
 *
 * Effetti (storico completo, notti con nightDate ≤ asOfNightDate, esclusi i giorni-eccezione):
 * la notte con nightDate D+1 segue il giorno D; il giorno D è "con sonnellino" se c'è almeno un
 * sonnellino con date D, altrimenti "senza" (la notte registrata implica che il giorno era tracciato).
 * - effectOnBedtime: mediana bedAxisMinutes(con) − mediana(senza), arrotondata al minuto
 *   (positivo = a letto più tardi dopo un sonnellino).
 * - effectOnEnergy: media energia mattutina (con) − media (senza), arrotondata a 2 decimali.
 * Visibili solo con ≥ 14 notti utilizzabili per quella metrica, ≥ 3 di esse dopo un giorno con
 * sonnellino e ≥ 1 dopo un giorno senza. coverage = { notti utilizzabili, notti ≤ asOfNightDate }.
 */
export function napStats(naps: Nap[], nights: Night[], asOfNightDate: string): NapStats {
  const windowStart = addDays(asOfNightDate, -(BASELINE_WINDOW_DAYS - 1));
  const inWindow = (d: string) => d >= windowStart && d <= asOfNightDate;

  const clean = cleanNaps(naps);
  const napDays = new Set(clean.map((n) => n.date));
  const windowNaps = clean.filter((n) => inWindow(n.date));
  const windowNapDays = new Set(windowNaps.map((n) => n.date));

  // --- frequenza ---
  const trackedNightDates = new Set(nights.filter((n) => n.status !== 'mancante').map((n) => n.nightDate));
  let observedDays = 0;
  for (let i = 0; i < BASELINE_WINDOW_DAYS; i++) {
    const d = addDays(windowStart, i);
    if (windowNapDays.has(d) || trackedNightDates.has(d) || trackedNightDates.has(addDays(d, 1))) {
      observedDays++;
    }
  }
  const freqCoverage = { used: observedDays, window: BASELINE_WINDOW_DAYS };
  const frequency: Stat<{ days: number; of: 14 }> =
    observedDays === 0
      ? hidden(freqCoverage, 'Nessun dato negli ultimi 14 giorni.')
      : { value: { days: windowNapDays.size, of: 14 }, coverage: freqCoverage };

  // --- durata media ---
  const avgCoverage = { used: windowNapDays.size, window: BASELINE_WINDOW_DAYS };
  const avgMinutes: Stat<number> =
    windowNaps.length === 0
      ? hidden(avgCoverage, 'Nessun sonnellino negli ultimi 14 giorni.')
      : { value: Math.round(mean(windowNaps.map((n) => n.minutes))), coverage: avgCoverage };

  // --- orario di inizio tipico ---
  const realStarts = windowNaps.filter((n) => !hasPlaceholderStart(n)).map((n) => localParts(n.startAt).minutes);
  const startCoverage = { used: realStarts.length, window: BASELINE_WINDOW_DAYS };
  const typicalStart = median(realStarts);
  const typicalStartMin: Stat<number> =
    typicalStart === null
      ? hidden(
          startCoverage,
          windowNaps.length === 0
            ? 'Nessun sonnellino negli ultimi 14 giorni.'
            : 'Orario di inizio non noto: i sonnellini sono stati inseriti dal check serale.',
        )
      : { value: Math.round(typicalStart), coverage: startCoverage };

  // --- effetti ---
  const history = nights.filter((n) => n.nightDate <= asOfNightDate);
  const candidates = history.filter((n) => !n.isException);
  const afterNap = (n: Night) => napDays.has(addDays(n.nightDate, -1));

  function effect(
    pick: (n: Night) => number | null,
    combine: (withNap: number[], without: number[]) => number,
  ): Stat<number> {
    const withNap: number[] = [];
    const without: number[] = [];
    for (const n of candidates) {
      const v = pick(n);
      if (v === null) continue;
      (afterNap(n) ? withNap : without).push(v);
    }
    const used = withNap.length + without.length;
    const coverage = { used, window: history.length };
    if (used < NAP_EFFECT_MIN_NIGHTS) {
      return hidden(coverage, `Servono almeno ${NAP_EFFECT_MIN_NIGHTS} notti. Per ora ne hai ${used}.`);
    }
    if (withNap.length < NAP_EFFECT_MIN_NAP_DAYS) {
      return hidden(
        coverage,
        `Servono almeno ${NAP_EFFECT_MIN_NAP_DAYS} giorni con sonnellino. Per ora ne hai ${withNap.length}.`,
      );
    }
    if (without.length === 0) {
      return hidden(coverage, 'Servono anche notti dopo giorni senza sonnellino.');
    }
    return { value: combine(withNap, without), coverage };
  }

  const effectOnBedtime = effect(
    (n) => (n.bedAt.value !== null && isValidIso(n.bedAt.value) ? bedAxisMinutes(n.bedAt.value) : null),
    (w, wo) => Math.round((median(w) as number) - (median(wo) as number)),
  );
  const effectOnEnergy = effect(
    (n) => n.energy.value,
    (w, wo) => Math.round((mean(w) - mean(wo)) * 100) / 100,
  );

  return { frequency, avgMinutes, typicalStartMin, effectOnBedtime, effectOnEnergy };
}
