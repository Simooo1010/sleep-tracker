/**
 * Contratto del livello server (Slice 2). Il dominio puro sta in `src/domain/`.
 * Tutta la logica server dipende da `Repo` (interfaccia), mai direttamente da Supabase:
 * così si testa con un repo in memoria e con un DB reale.
 */
import type { EveningCheck, Nap, Night, SignalEvent, SignalType } from '../domain/types';

/** Payload accettato da POST /api/events (validato con Zod in events-schema.ts). */
export interface IncomingEvent {
  type: SignalType;
  /** Istante ISO UTC dell'evento; se assente il server usa l'orario di ricezione (`now`). */
  ts?: string;
  /** Chiave di idempotenza scelta dal Comando (es. "wake-2026-10-25"); se assente il server ne deriva una da type+ts. */
  idempotencyKey?: string;
  /** Solo per evening_check. */
  check?: {
    tiredness?: 1 | 2 | 3 | 4 | 5;
    mood?: 1 | 2 | 3 | 4 | 5;
    factors?: string[];
    napMinutesToday?: number;
  };
}

export interface StoredEvent extends SignalEvent {
  idempotencyKey: string;
}

export interface Repo {
  /** Inserisce l'evento; `inserted:false` se la idempotencyKey esiste già (nessun errore). */
  insertEvent(e: StoredEvent): Promise<{ inserted: boolean }>;
  /** Eventi con ts in [fromIso, toIso], ordinati per ts crescente. */
  listEvents(fromIso: string, toIso: string): Promise<SignalEvent[]>;
  getEveningCheck(date: string): Promise<EveningCheck | null>;
  saveEveningCheck(check: EveningCheck): Promise<void>;
  getNight(nightDate: string): Promise<Night | null>;
  /** Mai sovrascrivere una notte `confermata` (l'implementazione deve rifiutare in silenzio e ritornare false). */
  upsertNight(night: Night): Promise<boolean>;
  /** Notti con nightDate in [fromDate, toDate], ordinate. */
  listNights(fromDate: string, toDate: string): Promise<Night[]>;
  saveNap(nap: Nap): Promise<void>;
  /** true se l'hash del token esiste ed è attivo. */
  tokenExists(tokenHash: string): Promise<boolean>;
}

export type IngestResult =
  | { ok: true; duplicate: boolean; nightDate: string | null }
  | { ok: false; status: 400 | 401; error: string };
