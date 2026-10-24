/**
 * Stima delle notti con segnali mancanti (docs/PROJECT.md §3b/§3c, Dati-e-calcoli.md "Stato di una notte").
 * Un buco si colma con una stima marcata ('stimato'/'stimata'), mai nascosta, mai errore.
 * Funzioni pure: nessun I/O, nessun Date.now().
 */
import type { Night, Tracked } from './types';
import { addDays, bedAxisMinutes, hasTimes, isWeekendNight, localParts, median, wakeAxisMinutes } from './time';

/** Finestra di storico usata per la stima (giorni di calendario prima della notte). */
export const ESTIMATE_WINDOW_DAYS = 28;
/** Notti minime nella stessa categoria (feriale/weekend). */
export const ESTIMATE_MIN_SAME_CATEGORY = 3;
/** Notti minime nel fallback su tutte le categorie. */
export const ESTIMATE_MIN_ANY_CATEGORY = 5;

const DAY_MIN = 1440;
const BED_AXIS_ORIGIN_MIN = 18 * 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Offset locale (minuti, locale − UTC) di Europe/Rome all'istante `t` (ms), letto via Intl. */
function offsetMinutesAt(t: number): number {
  const p = localParts(new Date(t).toISOString());
  const wallAsUtc = Date.parse(`${p.date}T00:00:00Z`) + p.minutes * 60_000;
  // t è sempre al minuto intero (Europe/Rome ha offset in ore intere).
  return Math.round((wallAsUtc - t) / 60_000);
}

/**
 * Converte un orario locale Europe/Rome in istante ISO UTC.
 *
 * `minutesSinceLocalMidnight` può essere > 1440 o negativo per cavalcare la mezzanotte
 * (es. `localToIso('2026-01-14', 1480)` = 15 gen 00:40 locali). I minuti frazionari si arrotondano.
 *
 * L'ora locale si risolve con Intl (si cerca l'istante il cui `localParts` coincide), senza offset fissi:
 * - **ora ambigua** (ritorno all'ora solare, es. 2026-10-25 02:30): si sceglie la **prima occorrenza**
 *   (ancora in ora legale) → `2026-10-25T00:30:00.000Z`.
 * - **ora inesistente** (passaggio all'ora legale, es. 2026-03-29 02:30): si applica l'offset in vigore
 *   *prima* del salto, cioè l'orario scatta in avanti della durata del buco (02:30 → 03:30 CEST)
 *   → `2026-03-29T01:30:00.000Z`. È la stessa regola di `Temporal` con `disambiguation: 'compatible'`
 *   e mantiene la distanza reale dagli orari precedenti al salto.
 *
 * @throws Error se `date` non è 'YYYY-MM-DD' valida o se i minuti non sono finiti.
 */
export function localToIso(date: string, minutesSinceLocalMidnight: number): string {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || addDays(date, 0) !== date) {
    throw new Error(`Data non valida: ${date}`);
  }
  if (!Number.isFinite(minutesSinceLocalMidnight)) {
    throw new Error(`Minuti non validi: ${minutesSinceLocalMidnight}`);
  }
  const total = Math.round(minutesSinceLocalMidnight);
  const dayShift = Math.floor(total / DAY_MIN);
  const targetDate = addDays(date, dayShift);
  const targetMin = total - dayShift * DAY_MIN;

  // Orario "a muro" interpretato come se fosse UTC; l'istante vero è wall − offset.
  const wall = Date.parse(`${targetDate}T00:00:00Z`) + targetMin * 60_000;
  // Offset possibili: quelli in vigore un giorno prima e un giorno dopo (copre qualsiasi transizione vicina).
  const before = offsetMinutesAt(wall - DAY_MIN * 60_000);
  const after = offsetMinutesAt(wall + DAY_MIN * 60_000);

  const matches = [...new Set([before, after])]
    .map((off) => wall - off * 60_000)
    .filter((t) => {
      const p = localParts(new Date(t).toISOString());
      return p.date === targetDate && p.minutes === targetMin;
    })
    .sort((a, b) => a - b);

  // Ambigua → prima occorrenza; inesistente → offset pre-salto (scatto in avanti).
  const t = matches[0] ?? wall - before * 60_000;
  return new Date(t).toISOString();
}

/** Notti utilizzabili come riferimento: nella finestra, non eccezioni, con letto e sveglia. */
function referenceNights(night: Night, history: Night[]): Night[] {
  const from = addDays(night.nightDate, -ESTIMATE_WINDOW_DAYS);
  const inWindow = history.filter(
    (n) => n.nightDate < night.nightDate && n.nightDate >= from && !n.isException && hasTimes(n),
  );
  const weekend = isWeekendNight(night.nightDate);
  const same = inWindow.filter((n) => isWeekendNight(n.nightDate) === weekend);
  if (same.length >= ESTIMATE_MIN_SAME_CATEGORY) return same;
  if (inWindow.length >= ESTIMATE_MIN_ANY_CATEGORY) return inWindow;
  return [];
}

function estimated(value: string): Tracked<string> {
  return { value, provenance: 'stimato' };
}

/**
 * Completa SOLO i campi `bedAt`/`wakeAt` con value null, stimandoli dalla mediana dei giorni simili:
 * stessa categoria (weekend/feriale, `isWeekendNight`) nelle ultime 28 notti di calendario prima di
 * `night.nightDate`, escluse eccezioni e notti senza orari, con almeno 3 notti; altrimenti tutte le
 * categorie con almeno 5 notti; altrimenti il campo resta null/'mancante'.
 *
 * - Letto: mediana su `bedAxisMinutes` (asse dalle 18:00 della sera prima di nightDate).
 * - Risveglio: mediana su `wakeAxisMinutes`, sul giorno nightDate.
 * - I campi già valorizzati non si toccano (anche se 'stimato'). Campi riempiti → provenance 'stimato'.
 * - status → 'stimata' solo se era 'mancante' e almeno un campo è stato riempito; mai 'confermata'.
 * - Coerenza: se la stima produrrebbe letto ≥ risveglio, quel campo non viene riempito.
 */
export function estimateMissing(night: Night, history: Night[]): Night {
  const needBed = night.bedAt.value === null;
  const needWake = night.wakeAt.value === null;
  if (!needBed && !needWake) return night;

  const refs = referenceNights(night, history);
  if (refs.length === 0) return night;

  let bedAt = night.bedAt;
  let wakeAt = night.wakeAt;

  if (needWake) {
    const m = median(refs.map((n) => wakeAxisMinutes(n.wakeAt.value as string)));
    if (m !== null) wakeAt = estimated(localToIso(night.nightDate, m));
  }
  if (needBed) {
    const m = median(refs.map((n) => bedAxisMinutes(n.bedAt.value as string)));
    if (m !== null) {
      bedAt = estimated(localToIso(addDays(night.nightDate, -1), BED_AXIS_ORIGIN_MIN + m));
    }
  }

  // Una stima non deve creare una notte di durata nulla o negativa: in quel caso il campo stimato resta mancante.
  if (bedAt.value !== null && wakeAt.value !== null && Date.parse(bedAt.value) >= Date.parse(wakeAt.value)) {
    if (needBed) bedAt = night.bedAt;
    if (needWake) wakeAt = night.wakeAt;
  }

  const filled = bedAt !== night.bedAt || wakeAt !== night.wakeAt;
  if (!filled) return night;
  return {
    ...night,
    bedAt,
    wakeAt,
    status: night.status === 'mancante' ? 'stimata' : night.status,
  };
}
