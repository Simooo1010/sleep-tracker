'use server';

/**
 * Server Actions della UI: wrapper sottili sulle mutation di `@/server/mutations`.
 * Ogni azione valida l'input (`unknown`) con Zod, ottiene il repo, chiama la mutation e,
 * solo in caso di successo, invalida la cache. L'output è sempre JSON-serializzabile
 * (mai Error, mai Date) e gli errori non riportano mai l'input ricevuto.
 * Regola Next per 'use server': si esportano solo funzioni async (e tipi).
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { Night } from '@/domain/types';
import { getRepo } from '@/server/repo-factory';
import {
  confirmNight,
  napFromUi,
  rateNight,
  recordQuestion,
  saveEveningCheckFromUi,
  setExceptions,
  undoConfirmNight,
  type MutationResult,
} from '@/server/mutations';
import type { Repo } from '@/server/types';

export type ActionResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };

const INVALID = 'Dati non validi.';
const NOT_CONFIGURED = 'Servizio non configurato.';
const FAILED = 'Operazione non riuscita.';

// --- Schemi ---------------------------------------------------------------------------------

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoSchema = z.string().datetime({ offset: true });
const scoreSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const slugSchema = z
  .string()
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const slugsSchema = z.array(slugSchema).max(12);
const provenanceSchema = z.enum(['automatico', 'confermato', 'stimato', 'mancante']);

function tracked<T extends z.ZodType>(value: T) {
  return z.strictObject({ value: value.nullable(), provenance: provenanceSchema });
}

const nightSchema = z.strictObject({
  nightDate: dateSchema,
  bedAt: tracked(isoSchema),
  wakeAt: tracked(isoSchema),
  status: z.enum(['confermata', 'stimata', 'mancante']),
  quality: tracked(scoreSchema),
  energy: tracked(scoreSchema),
  isException: z.boolean(),
  factors: slugsSchema,
});

const confirmSchema = z.strictObject({
  nightDate: dateSchema,
  bedAt: isoSchema.optional(),
  wakeAt: isoSchema.optional(),
});

const undoSchema = z.strictObject({ previous: nightSchema.nullable(), nightDate: dateSchema });

const rateSchema = z.strictObject({
  nightDate: dateSchema,
  energy: scoreSchema.optional(),
  quality: scoreSchema.optional(),
});

const exceptionsSchema = z.strictObject({ nightDate: dateSchema, slugs: slugsSchema });

const eveningSchema = z.strictObject({
  date: dateSchema,
  tiredness: scoreSchema.optional(),
  mood: scoreSchema.optional(),
  factors: slugsSchema.optional(),
  napMinutesToday: z.int().min(0).max(600).optional(),
});

const questionSchema = z.strictObject({
  date: dateSchema,
  kind: z.enum(['confirm_night', 'energy', 'quality', 'nap_today', 'exception', 'factors']),
  nightDate: dateSchema.optional(),
  answeredOrSkipped: z.boolean(),
});

const napSchema = z.strictObject({ action: z.enum(['start', 'stop']) });

// --- Esecuzione comune ----------------------------------------------------------------------

/** Rimuove le chiavi `undefined` (exactOptionalPropertyTypes-safe e payload più pulito). */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

async function run<S extends z.ZodType, V>(
  schema: S,
  input: unknown,
  mutate: (repo: Repo, data: z.output<S>) => Promise<MutationResult<V>>,
): Promise<ActionResult<V>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID };

  let repo: Repo;
  try {
    repo = getRepo();
  } catch {
    return { ok: false, error: NOT_CONFIGURED };
  }

  let result: MutationResult<V>;
  try {
    result = await mutate(repo, parsed.data);
  } catch {
    return { ok: false, error: FAILED };
  }
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/', 'layout');
  return result.value === undefined ? { ok: true } : { ok: true, value: result.value };
}

// --- Azioni ---------------------------------------------------------------------------------

export async function actionConfirmNight(
  input: unknown,
): Promise<ActionResult<{ night: Night; previous: Night | null }>> {
  return run(confirmSchema, input, (repo, d) => confirmNight(repo, compact(d)));
}

export async function actionUndoConfirmNight(input: unknown): Promise<ActionResult> {
  return run(undoSchema, input, (repo, d) => undoConfirmNight(repo, d.previous as Night | null, d.nightDate));
}

export async function actionRateNight(input: unknown): Promise<ActionResult<Night>> {
  return run(rateSchema, input, (repo, d) => rateNight(repo, compact(d)));
}

export async function actionSetExceptions(input: unknown): Promise<ActionResult> {
  return run(exceptionsSchema, input, (repo, d) => setExceptions(repo, d));
}

export async function actionSaveEveningCheck(input: unknown): Promise<ActionResult> {
  return run(eveningSchema, input, (repo, d) => saveEveningCheckFromUi(repo, compact(d)));
}

export async function actionRecordQuestion(input: unknown): Promise<ActionResult> {
  return run(questionSchema, input, (repo, d) => recordQuestion(repo, compact(d)));
}

export async function actionNap(input: unknown): Promise<ActionResult<{ nightDate: string | null }>> {
  return run(napSchema, input, (repo, d) => napFromUi(repo, d.action, new Date()));
}
