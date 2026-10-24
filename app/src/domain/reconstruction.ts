/**
 * Ricostruzione di una notte dai segnali grezzi (docs/PROJECT.md §3c.3,
 * docs/design/system/Dati-e-calcoli.md "Segnali" e "Provenienza").
 * Funzione pura: nessun I/O, nessun Date.now().
 */
import { durationMinutes, localParts, addDays } from './time';
import type { EveningCheck, NightStatus, Provenance, SignalEvent, SignalType, Tracked } from './types';

/** Finestra del letto: [nightDate−1 18:00, nightDate 06:00] locali. */
const BED_WINDOW_START_MIN = 18 * 60;
const BED_WINDOW_END_MIN = 6 * 60;
/** Finestra del risveglio: [nightDate 03:00, nightDate 14:00] locali. */
const WAKE_WINDOW_START_MIN = 3 * 60;
const WAKE_WINDOW_END_MIN = 14 * 60;
/** Oltre questa durata la notte non è plausibile: il letto viene scartato. */
const MAX_PLAUSIBLE_SLEEP_MIN = 16 * 60;

export interface ReconstructedNight {
  bedAt: Tracked<string>;
  wakeAt: Tracked<string>;
  status: NightStatus;
}

interface TimedEvent {
  type: SignalType;
  ts: string;
  ms: number;
}

const missing = (): Tracked<string> => ({ value: null, provenance: 'mancante' });
const tracked = (value: string, provenance: Provenance): Tracked<string> => ({ value, provenance });

function inBedWindow(ts: string, nightDate: string): boolean {
  const { date, minutes } = localParts(ts);
  if (date === addDays(nightDate, -1)) return minutes >= BED_WINDOW_START_MIN;
  if (date === nightDate) return minutes <= BED_WINDOW_END_MIN;
  return false;
}

function inWakeWindow(ts: string, nightDate: string): boolean {
  const { date, minutes } = localParts(ts);
  return date === nightDate && minutes >= WAKE_WINDOW_START_MIN && minutes <= WAKE_WINDOW_END_MIN;
}

/** Ultimo evento con ms < limit; se nessuno lo è, l'ultimo in assoluto (sarà scartato come incoerente). */
function lastBefore(events: TimedEvent[], limitMs: number | null): TimedEvent | undefined {
  if (events.length === 0) return undefined;
  if (limitMs !== null) {
    const before = events.filter((e) => e.ms < limitMs);
    if (before.length > 0) return before[before.length - 1];
  }
  return events[events.length - 1];
}

/**
 * Ricostruisce la notte che termina al risveglio del giorno locale `nightDate` (Europe/Rome).
 * - Letto: `bedtime_candidate` (automatico) → ultimo `evening_check` (stimato) → mancante.
 * - Risveglio: primo `wake` (automatico) → primo `app_open` del mattino, limite superiore (stimato) → mancante.
 * - Incoerenze (risveglio <= letto, durata > 16 h): il letto viene scartato, nulla viene inventato.
 * - Lo stato non è mai 'confermata': la conferma la dà l'utente.
 *
 * `evening` (il check serale salvato) non porta un orario: la stima del letto usa il ts
 * dell'evento `evening_check`. Il parametro è accettato per stabilità del contratto.
 */
export function reconstructNight(
  events: SignalEvent[],
  nightDate: string,
  evening: EveningCheck | null,
): ReconstructedNight {
  void evening;

  const timed: TimedEvent[] = events
    .map((e) => ({ type: e.type, ts: e.ts, ms: Date.parse(e.ts) }))
    .filter((e) => !Number.isNaN(e.ms))
    .sort((a, b) => a.ms - b.ms);

  const ofType = (type: SignalType, inWindow: (ts: string, d: string) => boolean) =>
    timed.filter((e) => e.type === type && inWindow(e.ts, nightDate));

  // RISVEGLIO
  let wakeEvent: TimedEvent | undefined = ofType('wake', inWakeWindow)[0];
  let wakeAt: Tracked<string>;
  if (wakeEvent) {
    wakeAt = tracked(wakeEvent.ts, 'automatico');
  } else {
    wakeEvent = ofType('app_open', inWakeWindow)[0];
    wakeAt = wakeEvent ? tracked(wakeEvent.ts, 'stimato') : missing();
  }
  const wakeMs = wakeEvent ? wakeEvent.ms : null;

  // LETTO
  let bedAt: Tracked<string> = missing();
  const candidates = ofType('bedtime_candidate', inBedWindow);
  const bedEvent = candidates.length > 0
    ? lastBefore(candidates, wakeMs)
    : lastBefore(ofType('evening_check', inBedWindow), wakeMs);
  if (bedEvent) {
    bedAt = tracked(bedEvent.ts, candidates.length > 0 ? 'automatico' : 'stimato');
  }

  // INCOERENZE: si scarta il letto, senza ripiegare su altre stime.
  if (bedEvent && wakeEvent) {
    const minutes = durationMinutes(bedEvent.ts, wakeEvent.ts);
    if (wakeEvent.ms <= bedEvent.ms || minutes > MAX_PLAUSIBLE_SLEEP_MIN) bedAt = missing();
  }

  const status: NightStatus = bedAt.value !== null || wakeAt.value !== null ? 'stimata' : 'mancante';
  return { bedAt, wakeAt, status };
}
