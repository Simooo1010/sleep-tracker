/**
 * Scritture dell'utente dalla UI (Slice 3): conferma/annulla notte, voti, eccezioni,
 * check serale, registro domande, sonnellino. Dipendono solo da `Repo`.
 * Nessuna funzione lancia: gli errori del repo diventano un messaggio generico (niente dettagli interni).
 */
import { napFromCheck } from "../domain/naps";
import { durationMinutes } from "../domain/time";
import type { EveningCheck, Night, Score, Tracked } from "../domain/types";
import { ingestEvent } from "./ingest";
import type { QuestionLogRow, Repo } from "./types";

export type MutationResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const GENERIC_ERROR = "Errore nel salvataggio. Riprova.";
const MAX_NIGHT_MINUTES = 16 * 60;
const MAX_FACTORS = 12;
const MAX_NAP_MINUTES = 600;

const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});
const genericFail = (): { ok: false; error: string } => fail(GENERIC_ERROR);

const missing = <T>(): Tracked<T> => ({ value: null, provenance: "mancante" });
const confirmedOf = <T>(value: T): Tracked<T> => ({
  value,
  provenance: "confermato",
});

const isScore = (v: unknown): v is Score =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;

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

/** Conferma la notte con gli orari passati (o quelli esistenti). `previous` serve per l'annulla. */
export async function confirmNight(
  repo: Repo,
  input: { nightDate: string; bedAt?: string; wakeAt?: string },
): Promise<MutationResult<{ night: Night; previous: Night | null }>> {
  try {
    const previous = await repo.getNight(input.nightDate);
    const bedRaw = input.bedAt ?? previous?.bedAt.value ?? null;
    const wakeRaw = input.wakeAt ?? previous?.wakeAt.value ?? null;
    if (bedRaw === null || wakeRaw === null)
      return fail("Mancano gli orari della notte.");

    const bedMs = Date.parse(bedRaw);
    const wakeMs = Date.parse(wakeRaw);
    if (Number.isNaN(bedMs) || Number.isNaN(wakeMs) || wakeMs <= bedMs)
      return fail("Gli orari non sono coerenti.");
    const bedIso = new Date(bedMs).toISOString();
    const wakeIso = new Date(wakeMs).toISOString();
    if (durationMinutes(bedIso, wakeIso) > MAX_NIGHT_MINUTES)
      return fail("Gli orari non sono coerenti.");

    const base = previous ?? emptyNight(input.nightDate);
    const night: Night = {
      ...base,
      bedAt: confirmedOf(bedIso),
      wakeAt: confirmedOf(wakeIso),
      status: "confermata",
    };
    await repo.overwriteNight(night);
    return { ok: true, value: { night, previous } };
  } catch {
    return genericFail();
  }
}

/** Annulla una conferma: ripristina la notte precedente, o la riporta a 'mancante' se non esisteva. */
export async function undoConfirmNight(
  repo: Repo,
  previous: Night | null,
  nightDate: string,
): Promise<MutationResult> {
  try {
    await repo.overwriteNight(previous ?? emptyNight(nightDate));
    return { ok: true, value: undefined };
  } catch {
    return genericFail();
  }
}

/** Imposta energia e/o qualità (solo i campi passati) senza toccare lo status. */
export async function rateNight(
  repo: Repo,
  input: { nightDate: string; energy?: Score; quality?: Score },
): Promise<MutationResult<Night>> {
  if (
    (input.energy !== undefined && !isScore(input.energy)) ||
    (input.quality !== undefined && !isScore(input.quality))
  ) {
    return fail("Voto non valido.");
  }
  try {
    const existing = await repo.getNight(input.nightDate);
    if (!existing) return fail("Notte non trovata.");
    const night: Night = {
      ...existing,
      energy:
        input.energy !== undefined
          ? confirmedOf<Score>(input.energy)
          : existing.energy,
      quality:
        input.quality !== undefined
          ? confirmedOf<Score>(input.quality)
          : existing.quality,
    };
    await repo.overwriteNight(night);
    return { ok: true, value: night };
  } catch {
    return genericFail();
  }
}

/** Sostituisce le eccezioni della notte (la crea come 'mancante' se non esiste) e aggiorna `isException`. */
export async function setExceptions(
  repo: Repo,
  input: { nightDate: string; slugs: string[] },
): Promise<MutationResult> {
  try {
    let night = await repo.getNight(input.nightDate);
    if (!night) {
      night = emptyNight(input.nightDate);
      await repo.overwriteNight(night);
    }
    try {
      await repo.setNightExceptions(input.nightDate, input.slugs);
    } catch {
      return fail("Eccezione non valida.");
    }
    await repo.overwriteNight({
      ...night,
      isException: input.slugs.length > 0,
    });
    return { ok: true, value: undefined };
  } catch {
    return genericFail();
  }
}

/** Salva il check serale dalla UI: campi passati 'confermato', gli altri restano quelli esistenti (o mancanti). */
export async function saveEveningCheckFromUi(
  repo: Repo,
  input: {
    date: string;
    tiredness?: Score;
    mood?: Score;
    factors?: string[];
    napMinutesToday?: number;
  },
): Promise<MutationResult> {
  const { tiredness, mood, factors, napMinutesToday } = input;
  const invalid =
    (tiredness !== undefined && !isScore(tiredness)) ||
    (mood !== undefined && !isScore(mood)) ||
    (factors !== undefined &&
      (!Array.isArray(factors) ||
        factors.length > MAX_FACTORS ||
        factors.some((f) => typeof f !== "string"))) ||
    (napMinutesToday !== undefined &&
      (typeof napMinutesToday !== "number" ||
        !Number.isInteger(napMinutesToday) ||
        napMinutesToday < 0 ||
        napMinutesToday > MAX_NAP_MINUTES));
  if (invalid) return fail("Dati non validi.");

  try {
    const previous = await repo.getEveningCheck(input.date);
    const check: EveningCheck = {
      date: input.date,
      tiredness:
        tiredness !== undefined
          ? confirmedOf<Score>(tiredness)
          : (previous?.tiredness ?? missing<Score>()),
      mood:
        mood !== undefined
          ? confirmedOf<Score>(mood)
          : (previous?.mood ?? missing<Score>()),
      factors:
        factors !== undefined ? [...factors] : [...(previous?.factors ?? [])],
      napMinutesToday:
        napMinutesToday !== undefined
          ? confirmedOf<number>(napMinutesToday)
          : (previous?.napMinutesToday ?? missing<number>()),
    };
    await repo.saveEveningCheck(check);
    if (napMinutesToday !== undefined && napMinutesToday > 0) {
      const nap = napFromCheck(check);
      if (nap) await repo.saveNap(nap);
    }
    return { ok: true, value: undefined };
  } catch {
    return genericFail();
  }
}

/** Registra una domanda posta (per il budget giornaliero). */
export async function recordQuestion(
  repo: Repo,
  row: QuestionLogRow,
): Promise<MutationResult> {
  try {
    await repo.logQuestion(row);
    return { ok: true, value: undefined };
  } catch {
    return genericFail();
  }
}

/** Inizio/fine sonnellino dal pulsante dell'app: passa dall'ingestione con sorgente 'app'. */
export async function napFromUi(
  repo: Repo,
  action: "start" | "stop",
  now: Date,
): Promise<MutationResult<{ nightDate: string | null }>> {
  try {
    const type = action === "start" ? "nap_start" : "nap_end";
    const ts = now.toISOString();
    const result = await ingestEvent(
      repo,
      { type, ts, idempotencyKey: `${type}:${ts.slice(0, 16)}` },
      now,
      "app",
    );
    if (!result.ok) return fail(result.error);
    return { ok: true, value: { nightDate: result.nightDate } };
  } catch {
    return genericFail();
  }
}
