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
    /** Descrizione libera della giornata (facoltativa, max DAY_NOTE_MAX caratteri). */
    dayNote?: string | null;
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

  // --- Aggiunte Slice 3 (scritture e letture della UI) ---
  /**
   * Scrittura ESPLICITA dell'utente: sostituisce la notte anche se era 'confermata'
   * (Conferma, Correggi, Annulla). Diversa da upsertNight, che protegge le conferme.
   */
  overwriteNight(night: Night): Promise<void>;
  /** Sonnellini con `date` in [fromDate, toDate], ordinati per start_at. */
  listNaps(fromDate: string, toDate: string): Promise<Nap[]>;
  /** Check serali con `date` in [fromDate, toDate], ordinati per data. */
  listEveningChecks(fromDate: string, toDate: string): Promise<EveningCheck[]>;
  /** Tipi di eccezione con contatore d'uso (per ordinare i chip). */
  listExceptionTypes(): Promise<ExceptionTypeRow[]>;
  /**
   * Sostituisce le eccezioni di una notte e aggiorna `uses` (+1 per i nuovi slug, mai sotto 0).
   * Slug sconosciuti vengono creati con l'etichetta in `labels[slug]` se presente, altrimenti con label derivata.
   * `labels` è facoltativo: i chiamanti esistenti (solo slug) restano validi.
   */
  setNightExceptions(nightDate: string, slugs: string[], labels?: Record<string, string>): Promise<void>;
  /** Slug delle eccezioni di ciascuna notte in [fromDate, toDate]. */
  listNightExceptions(fromDate: string, toDate: string): Promise<Record<string, string[]>>;
  /** Registro delle domande poste (per il budget giornaliero). */
  logQuestion(q: QuestionLogRow): Promise<void>;
  listQuestions(fromDate: string, toDate: string): Promise<QuestionLogRow[]>;
  /** Impostazione chiave/valore (es. 'target_sleep_minutes'); null se assente. */
  getSetting<T = unknown>(key: string): Promise<T | null>;

  // --- Token API dei Comandi (gestiti dalla pagina Impostazioni) ---
  /**
   * Salva l'hash di un nuovo token (attivo). `label`: 1–40 caratteri dopo il trim, altrimenti Error('Etichetta non valida.').
   * Restituisce i metadati, mai l'hash.
   */
  createToken(input: { tokenHash: string; label: string }): Promise<ApiTokenInfo>;
  /** Tutti i token (attivi e revocati), dal più recente. MAI l'hash. */
  listTokens(): Promise<ApiTokenInfo[]>;
  /** Imposta active=false; false se il token non esiste. */
  revokeToken(id: number): Promise<boolean>;
}

/** Metadati di un token API: l'hash non esce mai dal repo. */
export interface ApiTokenInfo {
  id: number;
  label: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ExceptionTypeRow {
  slug: string;
  label: string;
  uses: number;
}

export type QuestionKind =
  | 'confirm_night'
  | 'energy'
  | 'quality'
  | 'nap_today'
  | 'exception'
  | 'factors';

export interface QuestionLogRow {
  date: string;
  kind: QuestionKind;
  nightDate?: string;
  answeredOrSkipped: boolean;
}

export type IngestResult =
  | { ok: true; duplicate: boolean; nightDate: string | null }
  | { ok: false; status: 400 | 401; error: string };
