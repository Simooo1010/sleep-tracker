/**
 * Validazione del corpo di POST /api/events.
 *
 * I Comandi iOS compongono il JSON a mano: si è tolleranti sul formato (spazi attorno ai valori,
 * `type` in maiuscolo, numeri inviati come stringhe, campi vuoti o `null` trattati come assenti,
 * `ts` con offset qualsiasi) ma rigorosi sul contenuto (tipi ammessi, range, nessun campo extra,
 * testo libero solo in `check.dayNote`, con lunghezza massima). I messaggi di errore sono in italiano e non riportano mai il contenuto inviato.
 */
import { z } from 'zod';

import { DAY_NOTE_MAX } from '../domain/questions';
import type { Score, SignalType } from '../domain/types';
import type { IncomingEvent } from './types';

export const SIGNAL_TYPES = [
  'bedtime_candidate',
  'wake',
  'nap_start',
  'nap_end',
  'evening_check',
  'app_open',
] as const satisfies readonly SignalType[];

/** Tolleranza verso il futuro (orologi del telefono leggermente avanti). */
export const MAX_FUTURE_MS = 5 * 60 * 1000;
/** Oltre questa età un evento non viene più accettato. */
export const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000;

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9:_.-]{8,100}$/;
const FACTOR_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_FACTORS = 12;
const MAX_FACTOR_LEN = 40;

export type ParsedIncomingEvent = IncomingEvent & { ts: string; idempotencyKey: string };
export type ParseIncomingEventResult =
  | { ok: true; value: ParsedIncomingEvent }
  | { ok: false; error: string };

const MSG = {
  body: 'Il corpo della richiesta deve essere un oggetto JSON.',
  unknownField: 'Il corpo della richiesta contiene un campo non consentito.',
  type: `Il campo "type" è obbligatorio e deve essere uno fra: ${SIGNAL_TYPES.join(', ')}.`,
  tsType: 'Il campo "ts" deve essere una stringa con data e ora ISO 8601.',
  tsFormat:
    'Il campo "ts" non è una data ISO 8601 valida con fuso orario (es. 2026-10-24T22:30:00+02:00).',
  tsFuture: 'Il campo "ts" è nel futuro di oltre 5 minuti: controlla l\'orologio del dispositivo.',
  tsPast: 'Il campo "ts" è più vecchio di 7 giorni: l\'evento non può essere registrato.',
  key: 'Il campo "idempotencyKey" deve avere da 8 a 100 caratteri fra lettere, cifre e : _ . -',
  checkWrongType: 'Il campo "check" è consentito solo per gli eventi di tipo evening_check.',
  checkBody: 'Il campo "check" deve essere un oggetto.',
  checkUnknownField: 'Il campo "check" contiene un campo non consentito.',
  tiredness: 'Il campo "check.tiredness" deve essere un numero intero da 1 a 5.',
  mood: 'Il campo "check.mood" deve essere un numero intero da 1 a 5.',
  factorsList: `Il campo "check.factors" deve essere una lista di al massimo ${MAX_FACTORS} elementi.`,
  factorItem: `Ogni elemento di "check.factors" deve essere un'etichetta in minuscolo con trattini (es. schermo-a-letto), lunga al massimo ${MAX_FACTOR_LEN} caratteri.`,
  napMinutes: 'Il campo "check.napMinutesToday" deve essere un numero intero da 0 a 600.',
  dayNote: `Il campo "check.dayNote" deve essere un testo di al massimo ${DAY_NOTE_MAX} caratteri.`,
} as const;

// --- Normalizzazioni tolleranti -------------------------------------------------------------

/** `null` e stringhe vuote (tipiche dei Comandi con variabili non valorizzate) = campo assente. */
function blankToUndefined(v: unknown): unknown {
  if (v === null) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  return v;
}

function trimmed(v: unknown): unknown {
  const b = blankToUndefined(v);
  return typeof b === 'string' ? b.trim() : b;
}

/** Numeri inviati come testo ("3") diventano numeri; il resto passa invariato e lo valida Zod. */
function numeric(v: unknown): unknown {
  const b = trimmed(v);
  if (typeof b === 'string' && /^-?\d+(?:\.\d+)?$/.test(b)) return Number(b);
  return b;
}

function optional<T extends z.ZodType>(fn: (v: unknown) => unknown, schema: T) {
  return z.preprocess(fn, schema.optional()).optional();
}

function intInRange(min: number, max: number, message: string) {
  return z.int({ error: message }).min(min, { error: message }).max(max, { error: message });
}

const scoreSchema = (message: string) =>
  optional(numeric, intInRange(1, 5, message).transform((n) => n as Score));

// --- Schemi ---------------------------------------------------------------------------------

const checkSchema = z.strictObject(
  {
    tiredness: scoreSchema(MSG.tiredness),
    mood: scoreSchema(MSG.mood),
    factors: optional(
      blankToUndefined,
      z
        .array(
          z.preprocess(
            (v) => (typeof v === 'string' ? v.trim() : v),
            z
              .string({ error: MSG.factorItem })
              .max(MAX_FACTOR_LEN, { error: MSG.factorItem })
              .regex(FACTOR_SLUG_RE, { error: MSG.factorItem }),
          ),
          { error: MSG.factorsList },
        )
        .max(MAX_FACTORS, { error: MSG.factorsList }),
    ),
    napMinutesToday: optional(numeric, intInRange(0, 600, MSG.napMinutes)),
    dayNote: optional(trimmed, z.string({ error: MSG.dayNote }).max(DAY_NOTE_MAX, { error: MSG.dayNote })),
  },
  { error: (iss) => (iss.code === 'unrecognized_keys' ? MSG.checkUnknownField : MSG.checkBody) },
);

const bodySchema = z.strictObject(
  {
    type: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
      z.enum(SIGNAL_TYPES, { error: MSG.type }),
    ),
    ts: optional(trimmed, z.string({ error: MSG.tsType })),
    idempotencyKey: optional(trimmed, z.string({ error: MSG.key }).regex(IDEMPOTENCY_KEY_RE, { error: MSG.key })),
    check: optional(blankToUndefined, checkSchema),
  },
  { error: (iss) => (iss.code === 'unrecognized_keys' ? MSG.unknownField : MSG.body) },
);

// --- Date ISO 8601 --------------------------------------------------------------------------

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Interpreta un istante ISO 8601 completo di fuso orario (Z oppure ±hh, ±hhmm, ±hh:mm).
 * Rifiuta date inesistenti (31 aprile, 25:00…) e orari senza fuso (ambigui). Ritorna null se non valido.
 */
export function parseIsoInstant(input: string): Date | null {
  const m = ISO_RE.exec(input);
  if (!m) return null;
  const [, ys, mos, ds, hs, mis, ss, frac, tz] = m;
  const year = Number(ys);
  const month = Number(mos);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mis);
  const second = ss === undefined ? 0 : Number(ss);
  const ms = frac === undefined ? 0 : Number(frac.slice(0, 3).padEnd(3, '0'));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let offsetMin = 0;
  if (tz !== undefined && tz.toUpperCase() !== 'Z') {
    const sign = tz.startsWith('-') ? -1 : 1;
    const digits = tz.slice(1).replace(':', '');
    const oh = Number(digits.slice(0, 2));
    const om = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
    if (oh > 14 || om > 59) return null;
    offsetMin = sign * (oh * 60 + om);
  }

  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, ms);
  const t = d.getTime() - offsetMin * 60_000;
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Chiave deterministica `${type}:${ts troncato al minuto}`, es. "wake:2026-10-24T06:30Z". */
export function deriveIdempotencyKey(type: SignalType, tsIso: string): string {
  const t = Math.floor(Date.parse(tsIso) / 60_000) * 60_000;
  return `${type}:${new Date(t).toISOString().slice(0, 16)}Z`;
}

// --- API ------------------------------------------------------------------------------------

export function parseIncomingEvent(body: unknown, now: Date): ParseIncomingEventResult {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('parseIncomingEvent: "now" deve essere una Date valida');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: MSG.body };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? MSG.body };
  }
  const { type, ts: rawTs, idempotencyKey, check } = parsed.data;

  let tsDate = now;
  if (rawTs !== undefined) {
    const d = parseIsoInstant(rawTs);
    if (d === null) return { ok: false, error: MSG.tsFormat };
    if (d.getTime() - now.getTime() > MAX_FUTURE_MS) return { ok: false, error: MSG.tsFuture };
    if (now.getTime() - d.getTime() > MAX_PAST_MS) return { ok: false, error: MSG.tsPast };
    tsDate = d;
  }
  const ts = tsDate.toISOString();

  if (check !== undefined && type !== 'evening_check') {
    return { ok: false, error: MSG.checkWrongType };
  }

  const value: ParsedIncomingEvent = {
    type,
    ts,
    idempotencyKey: idempotencyKey ?? deriveIdempotencyKey(type, ts),
  };
  if (check !== undefined) {
    const c: NonNullable<IncomingEvent['check']> = {};
    if (check.tiredness !== undefined) c.tiredness = check.tiredness;
    if (check.mood !== undefined) c.mood = check.mood;
    if (check.factors !== undefined) c.factors = check.factors;
    if (check.napMinutesToday !== undefined) c.napMinutesToday = check.napMinutesToday;
    if (check.dayNote !== undefined) c.dayNote = check.dayNote;
    value.check = c;
  }
  return { ok: true, value };
}
