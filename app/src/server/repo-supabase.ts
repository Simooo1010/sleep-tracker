/**
 * Implementazione di `Repo` su Supabase (Postgres, schema `public`).
 *
 * SOLO SERVER: usa la chiave service role, che bypassa la RLS. Questo modulo non deve mai
 * essere importato da codice client (componenti 'use client', bundle del browser).
 * `createServiceClient` lancia se eseguito in un ambiente con `window`.
 *
 * Il client è sempre iniettato in `createSupabaseRepo` (testabile con un client finto).
 * Gli errori Supabase diventano Error con messaggio breve e senza dati personali.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type {
  EveningCheck,
  Nap,
  Night,
  NightStatus,
  Provenance,
  Score,
  SignalEvent,
  SignalType,
  Tracked,
} from '../domain/types';
import type { Repo, StoredEvent } from './types';

// ---------- Righe del DB (schema della migration) ----------

export interface EventRow {
  id?: string | number;
  idempotency_key: string;
  type: string;
  ts: string;
  source: string;
  created_at?: string;
}

export interface NightRow {
  night_date: string;
  bed_at: string | null;
  bed_prov: string | null;
  wake_at: string | null;
  wake_prov: string | null;
  status: string;
  quality: number | null;
  quality_prov: string | null;
  energy: number | null;
  energy_prov: string | null;
  is_exception: boolean | null;
  factors: string[] | null;
  updated_at?: string;
}

export interface NapRow {
  id?: string | number;
  date: string;
  start_at: string;
  minutes: number;
  provenance: string;
}

export interface EveningCheckRow {
  date: string;
  tiredness: number | null;
  tiredness_prov: string | null;
  mood: number | null;
  mood_prov: string | null;
  factors: string[] | null;
  nap_minutes: number | null;
  nap_prov: string | null;
  saved_at?: string;
}

// ---------- Validazione / normalizzazione ----------

const PROVENANCES: readonly Provenance[] = ['automatico', 'confermato', 'stimato', 'mancante'];
const STATUSES: readonly NightStatus[] = ['confermata', 'stimata', 'mancante'];
const SIGNAL_TYPES: readonly SignalType[] = [
  'bedtime_candidate',
  'wake',
  'nap_start',
  'nap_end',
  'evening_check',
  'app_open',
];
const SOURCES: readonly SignalEvent['source'][] = ['comandi', 'app', 'stima'];

function invalid(table: string): Error {
  return new Error(`Dato non valido letto da ${table}`);
}

function dbError(op: string, err: { code?: string } | null | undefined): Error {
  const code = err?.code ? ` (${err.code})` : '';
  return new Error(`Supabase: ${op} non riuscita${code}`);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], table: string): T {
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  throw invalid(table);
}

/** Istante del DB (timestamptz, es. '...+00:00') → ISO UTC come nel dominio ('...Z'). */
function toIso(v: unknown, table: string): string {
  if (typeof v !== 'string') throw invalid(table);
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw invalid(table);
  return new Date(t).toISOString();
}

function toScore(v: unknown, table: string): Score {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) return v as Score;
  throw invalid(table);
}

/** Valore assente → { null, 'mancante' } sempre, qualunque cosa ci sia nella colonna _prov. */
function readTracked<T>(
  value: unknown,
  prov: unknown,
  parse: (v: unknown) => T,
  table: string,
): Tracked<T> {
  if (value === null || value === undefined) return { value: null, provenance: 'mancante' };
  const provenance = oneOf(prov, PROVENANCES, table);
  if (provenance === 'mancante') throw invalid(table);
  return { value: parse(value), provenance };
}

/** Scrittura: valore null → provenienza 'mancante' (mai un null con provenienza diversa). */
function writeTracked<T>(t: Tracked<T>): { value: T | null; prov: Provenance } {
  if (t.value === null || t.value === undefined) return { value: null, prov: 'mancante' };
  return { value: t.value, prov: t.provenance };
}

// ---------- Mapping righe ↔ dominio ----------

export function rowToEvent(r: EventRow): SignalEvent {
  return {
    type: oneOf(r.type, SIGNAL_TYPES, 'events'),
    ts: toIso(r.ts, 'events'),
    source: oneOf(r.source, SOURCES, 'events'),
  };
}

export function eventToRow(e: StoredEvent): EventRow {
  return { idempotency_key: e.idempotencyKey, type: e.type, ts: e.ts, source: e.source };
}

export function rowToNight(r: NightRow): Night {
  const T = 'nights';
  return {
    nightDate: r.night_date,
    bedAt: readTracked(r.bed_at, r.bed_prov, (v) => toIso(v, T), T),
    wakeAt: readTracked(r.wake_at, r.wake_prov, (v) => toIso(v, T), T),
    status: oneOf(r.status, STATUSES, T),
    quality: readTracked(r.quality, r.quality_prov, (v) => toScore(v, T), T),
    energy: readTracked(r.energy, r.energy_prov, (v) => toScore(v, T), T),
    isException: r.is_exception === true,
    factors: Array.isArray(r.factors) ? [...r.factors] : [],
  };
}

export function nightToRow(n: Night, updatedAt: string): NightRow {
  const bed = writeTracked(n.bedAt);
  const wake = writeTracked(n.wakeAt);
  const quality = writeTracked(n.quality);
  const energy = writeTracked(n.energy);
  return {
    night_date: n.nightDate,
    bed_at: bed.value,
    bed_prov: bed.prov,
    wake_at: wake.value,
    wake_prov: wake.prov,
    status: n.status,
    quality: quality.value,
    quality_prov: quality.prov,
    energy: energy.value,
    energy_prov: energy.prov,
    is_exception: n.isException,
    factors: [...n.factors],
    updated_at: updatedAt,
  };
}

export function rowToEveningCheck(r: EveningCheckRow): EveningCheck {
  const T = 'evening_checks';
  return {
    date: r.date,
    tiredness: readTracked(r.tiredness, r.tiredness_prov, (v) => toScore(v, T), T),
    mood: readTracked(r.mood, r.mood_prov, (v) => toScore(v, T), T),
    factors: Array.isArray(r.factors) ? [...r.factors] : [],
    napMinutesToday: readTracked(
      r.nap_minutes,
      r.nap_prov,
      (v) => {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
        throw invalid(T);
      },
      T,
    ),
  };
}

export function eveningCheckToRow(c: EveningCheck, savedAt: string): EveningCheckRow {
  const tiredness = writeTracked(c.tiredness);
  const mood = writeTracked(c.mood);
  const nap = writeTracked(c.napMinutesToday);
  return {
    date: c.date,
    tiredness: tiredness.value,
    tiredness_prov: tiredness.prov,
    mood: mood.value,
    mood_prov: mood.prov,
    factors: [...c.factors],
    nap_minutes: nap.value,
    nap_prov: nap.prov,
    saved_at: savedAt,
  };
}

export function napToRow(n: Nap): NapRow {
  return { date: n.date, start_at: n.startAt, minutes: n.minutes, provenance: n.provenance };
}

// ---------- Repo ----------

export function createSupabaseRepo(
  client: SupabaseClient,
  now: () => Date = () => new Date(),
): Repo {
  return {
    async insertEvent(e) {
      const { data, error } = await client
        .from('events')
        .upsert(eventToRow(e), { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select('idempotency_key');
      if (error) throw dbError('inserimento evento', error);
      return { inserted: Array.isArray(data) && data.length > 0 };
    },

    async listEvents(fromIso, toIso) {
      const { data, error } = await client
        .from('events')
        .select('type, ts, source')
        .gte('ts', fromIso)
        .lte('ts', toIso)
        .order('ts', { ascending: true });
      if (error) throw dbError('lettura eventi', error);
      return ((data ?? []) as EventRow[]).map(rowToEvent);
    },

    async getEveningCheck(date) {
      const { data, error } = await client
        .from('evening_checks')
        .select('*')
        .eq('date', date)
        .maybeSingle();
      if (error) throw dbError('lettura check serale', error);
      return data ? rowToEveningCheck(data as EveningCheckRow) : null;
    },

    async saveEveningCheck(check) {
      const { error } = await client
        .from('evening_checks')
        .upsert(eveningCheckToRow(check, now().toISOString()), { onConflict: 'date' });
      if (error) throw dbError('salvataggio check serale', error);
    },

    async getNight(nightDate) {
      const { data, error } = await client
        .from('nights')
        .select('*')
        .eq('night_date', nightDate)
        .maybeSingle();
      if (error) throw dbError('lettura notte', error);
      return data ? rowToNight(data as NightRow) : null;
    },

    /**
     * Due istruzioni, ciascuna atomica lato Postgres:
     * 1) insert-if-missing (ON CONFLICT DO NOTHING): se crea la riga, fatto;
     * 2) altrimenti UPDATE ... WHERE night_date = ? AND status <> 'confermata'.
     * Una notte confermata non viene mai toccata: 0 righe aggiornate → false.
     */
    async upsertNight(night) {
      const row = nightToRow(night, now().toISOString());
      const ins = await client
        .from('nights')
        .upsert(row, { onConflict: 'night_date', ignoreDuplicates: true })
        .select('night_date');
      if (ins.error) throw dbError('salvataggio notte', ins.error);
      if (Array.isArray(ins.data) && ins.data.length > 0) return true;

      const { night_date: _key, ...changes } = row;
      void _key;
      const upd = await client
        .from('nights')
        .update(changes)
        .eq('night_date', night.nightDate)
        .neq('status', 'confermata')
        .select('night_date');
      if (upd.error) throw dbError('aggiornamento notte', upd.error);
      return Array.isArray(upd.data) && upd.data.length > 0;
    },

    async listNights(fromDate, toDate) {
      const { data, error } = await client
        .from('nights')
        .select('*')
        .gte('night_date', fromDate)
        .lte('night_date', toDate)
        .order('night_date', { ascending: true });
      if (error) throw dbError('lettura notti', error);
      return ((data ?? []) as NightRow[]).map(rowToNight);
    },

    async saveNap(nap) {
      const { error } = await client.from('naps').upsert(napToRow(nap), { onConflict: 'start_at' });
      if (error) throw dbError('salvataggio sonnellino', error);
    },

    async tokenExists(tokenHash) {
      const { data, error } = await client
        .from('api_tokens')
        .select('id')
        .eq('token_hash', tokenHash)
        .eq('active', true)
        .maybeSingle();
      if (error) throw dbError('verifica token', error);
      if (!data) return false;
      // Best effort: un errore qui non deve far fallire la richiesta autenticata.
      try {
        await client
          .from('api_tokens')
          .update({ last_used_at: now().toISOString() })
          .eq('token_hash', tokenHash);
      } catch {
        // ignorato di proposito
      }
      return true;
    },
  };
}

// ---------- Client service role (solo server) ----------

/**
 * Crea il client con la chiave service role. Da chiamare solo lato server
 * (route handler / server action). Lancia se manca la configurazione o se gira nel browser.
 */
export function createServiceClient(
  env: Record<string, string | undefined> = process.env,
): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('createServiceClient è solo per il server: la service role non va mai nel client');
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !url ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
    !key ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
  ].filter((x): x is string => x !== null);
  if (!url || !key) {
    throw new Error(`Configurazione Supabase mancante: ${missing.join(', ')}`);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
