/**
 * Modifica di una notte dallo Storico (docs/NIGHT_EDIT.md): un'unica scrittura esplicita che può toccare
 * orari, voti, imprevisti e check della sera prima. Tutte le validazioni avvengono PRIMA di qualsiasi scrittura.
 * Convenzione dei campi (vedi `night-edit-contract.ts`): undefined = non toccato, null = rimuovi, valore = 'confermato'.
 * Non lancia mai: gli errori del repo diventano un messaggio generico.
 */
import {
  DAY_NOTE_MAX,
  EXCEPTION_SLUG_MAX,
  EXCEPTION_SLUG_RE,
  normalizeExceptionLabel,
} from "../domain/questions";
import { addDays, durationMinutes } from "../domain/time";
import type { EveningCheck, Night, Score, Tracked } from "../domain/types";
import type { MutationResult } from "./mutations";
import type { NightEditInput } from "./night-edit-contract";
import type { Repo } from "./types";

const GENERIC_ERROR = "Errore nel salvataggio. Riprova.";
const INVALID = "Dati non validi.";
const MAX_NIGHT_MINUTES = 16 * 60;
const MAX_ITEMS = 12;
const MIN_YEAR = 2000;

const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

const missing = <T>(): Tracked<T> => ({ value: null, provenance: "mancante" });
const confirmedOf = <T>(value: T): Tracked<T> => ({
  value,
  provenance: "confermato",
});
/** null = rimuovi (mancante), valore = confermato. */
const trackedFrom = <T>(value: T | null): Tracked<T> =>
  value === null ? missing<T>() : confirmedOf<T>(value);

const isScore = (v: unknown): v is Score =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;

const isSlug = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length <= EXCEPTION_SLUG_MAX &&
  EXCEPTION_SLUG_RE.test(v);

const isSlugList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= MAX_ITEMS && v.every(isSlug);

/** Data 'YYYY-MM-DD' reale (nessun rollover di calendario) con anno >= 2000. */
function isRealDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s)
    return false;
  return Number(s.slice(0, 4)) >= MIN_YEAR;
}

function emptyNight(nightDate: string): Night {
  return {
    nightDate,
    bedAt: missing<string>(),
    wakeAt: missing<string>(),
    status: "mancante",
    quality: missing<Score>(),
    energy: missing<Score>(),
    isException: false,
    factors: [],
  };
}

function emptyCheck(date: string): EveningCheck {
  return {
    date,
    tiredness: missing<Score>(),
    mood: missing<Score>(),
    factors: [],
    napMinutesToday: missing<number>(),
  };
}

/** Etichette difensive: solo per gli slug richiesti, normalizzate; le vuote o non stringa vengono ignorate. */
function cleanLabels(
  slugs: string[],
  labels: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!labels || typeof labels !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const slug of slugs) {
    if (!Object.prototype.hasOwnProperty.call(labels, slug)) continue;
    const raw = labels[slug];
    if (typeof raw !== "string") continue;
    const label = normalizeExceptionLabel(raw);
    if (label !== "") out[slug] = label;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Valida e normalizza `times`; null se incoerenti. */
function parseTimes(
  times: NonNullable<NightEditInput["times"]>,
): { bedIso: string; wakeIso: string } | null {
  if (
    !times ||
    typeof times.bedAt !== "string" ||
    typeof times.wakeAt !== "string"
  )
    return null;
  const bedMs = Date.parse(times.bedAt);
  const wakeMs = Date.parse(times.wakeAt);
  if (Number.isNaN(bedMs) || Number.isNaN(wakeMs) || wakeMs <= bedMs)
    return null;
  const bedIso = new Date(bedMs).toISOString();
  const wakeIso = new Date(wakeMs).toISOString();
  if (durationMinutes(bedIso, wakeIso) > MAX_NIGHT_MINUTES) return null;
  return { bedIso, wakeIso };
}

export async function saveNightDetails(
  repo: Repo,
  input: NightEditInput,
  today: string,
): Promise<MutationResult<{ night: Night }>> {
  // --- Validazioni (nessuna scrittura) ---
  if (!input || typeof input !== "object") return fail(INVALID);
  const { nightDate } = input;
  if (!isRealDate(nightDate) || nightDate > today) return fail(INVALID);

  if (input.quality !== undefined && input.quality !== null && !isScore(input.quality))
    return fail(INVALID);
  if (input.energy !== undefined && input.energy !== null && !isScore(input.energy))
    return fail(INVALID);

  if (input.exceptions !== undefined) {
    if (!input.exceptions || !isSlugList(input.exceptions.slugs))
      return fail(INVALID);
  }

  const ev = input.evening;
  let dayNote: string | null | undefined;
  if (ev !== undefined) {
    if (!ev || typeof ev !== "object") return fail(INVALID);
    if (ev.tiredness !== undefined && ev.tiredness !== null && !isScore(ev.tiredness))
      return fail(INVALID);
    if (ev.mood !== undefined && ev.mood !== null && !isScore(ev.mood))
      return fail(INVALID);
    if (ev.factors !== undefined && !isSlugList(ev.factors))
      return fail(INVALID);
    if (ev.dayNote !== undefined) {
      if (ev.dayNote !== null && typeof ev.dayNote !== "string")
        return fail(INVALID);
      const t = ev.dayNote === null ? "" : ev.dayNote.trim();
      if (Array.from(t).length > DAY_NOTE_MAX) return fail(INVALID);
      dayNote = t === "" ? null : t;
    }
  }

  let times: { bedIso: string; wakeIso: string } | null = null;
  if (input.times !== undefined) {
    times = parseTimes(input.times);
    if (times === null) return fail("Gli orari non sono coerenti.");
  }

  try {
    const previous = await repo.getNight(nightDate);
    const base = previous ?? emptyNight(nightDate);

    const hasChanges =
      input.times !== undefined ||
      input.quality !== undefined ||
      input.energy !== undefined ||
      input.exceptions !== undefined ||
      input.evening !== undefined;
    if (!hasChanges) return { ok: true, value: { night: base } };

    const night: Night = { ...base };
    if (times) {
      night.bedAt = confirmedOf(times.bedIso);
      night.wakeAt = confirmedOf(times.wakeIso);
      night.status = "confermata";
    }
    if (input.quality !== undefined) night.quality = trackedFrom<Score>(input.quality);
    if (input.energy !== undefined) night.energy = trackedFrom<Score>(input.energy);

    // --- Scritture ---
    if (input.exceptions !== undefined) {
      const { slugs } = input.exceptions;
      const labels = cleanLabels(slugs, input.exceptions.labels);
      try {
        if (labels) await repo.setNightExceptions(nightDate, slugs, labels);
        else await repo.setNightExceptions(nightDate, slugs);
      } catch {
        return fail("Eccezione non valida.");
      }
      night.isException = slugs.length > 0;
    }

    if (ev !== undefined) {
      const date = addDays(nightDate, -1);
      const prevCheck = (await repo.getEveningCheck(date)) ?? emptyCheck(date);
      const check: EveningCheck = { ...prevCheck, factors: [...prevCheck.factors] };
      if (ev.tiredness !== undefined) check.tiredness = trackedFrom<Score>(ev.tiredness);
      if (ev.mood !== undefined) check.mood = trackedFrom<Score>(ev.mood);
      if (ev.factors !== undefined) {
        check.factors = [...ev.factors];
        night.factors = [...ev.factors];
      }
      if (dayNote !== undefined) check.dayNote = dayNote;
      await repo.saveEveningCheck(check);
    }

    await repo.overwriteNight(night);
    return { ok: true, value: { night } };
  } catch {
    return fail(GENERIC_ERROR);
  }
}
