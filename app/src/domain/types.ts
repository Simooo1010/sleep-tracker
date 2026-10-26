/**
 * Contratto condiviso del dominio. Spec dei calcoli: docs/design/system/Dati-e-calcoli.md
 * e docs/PROJECT.md §3c, §5b, §5c. Tutte le funzioni del dominio sono pure (nessun I/O, nessun Date.now()).
 * Istanti = stringhe ISO 8601 UTC. Fuso di riferimento: Europe/Rome (vedi time.ts).
 */

export type Provenance = 'automatico' | 'confermato' | 'stimato' | 'mancante';

/** Valore con provenienza. Mancante = value null (mai zero, mai stima nascosta). */
export interface Tracked<T> {
  value: T | null;
  provenance: Provenance;
}

export type Score = 1 | 2 | 3 | 4 | 5;

export type NightStatus = 'confermata' | 'stimata' | 'mancante';

export interface Night {
  /** Data locale (Europe/Rome) del risveglio, 'YYYY-MM-DD'. Identifica la notte. */
  nightDate: string;
  bedAt: Tracked<string>;
  wakeAt: Tracked<string>;
  status: NightStatus;
  quality: Tracked<Score>;
  energy: Tracked<Score>;
  /** Giorno-eccezione (malattia, viaggio, festa…): visibile ma escluso dal riferimento. */
  isException: boolean;
  /** Etichette fattori della sera precedente (slug, es. 'schermo-a-letto'). */
  factors: string[];
}

export interface Nap {
  /** Data locale del sonnellino 'YYYY-MM-DD'. */
  date: string;
  startAt: string;
  minutes: number;
  provenance: Provenance;
}

export type SignalType =
  | 'bedtime_candidate'
  | 'wake'
  | 'nap_start'
  | 'nap_end'
  | 'evening_check'
  | 'app_open';

export interface SignalEvent {
  type: SignalType;
  ts: string;
  source: 'comandi' | 'app' | 'stima';
}

export interface EveningCheck {
  /** Data locale della sera 'YYYY-MM-DD'. */
  date: string;
  tiredness: Tracked<Score>;
  mood: Tracked<Score>;
  factors: string[];
  napMinutesToday: Tracked<number>;
  /** Descrizione libera della giornata (facoltativa, max DAY_NOTE_MAX caratteri). null/assente = nessuna nota. */
  dayNote?: string | null;
}

/** Imprevisto (eccezione) inserito dall'utente: slug stabile + etichetta mostrata. Slug da `slugifyExceptionLabel`. */
export interface ExceptionInput {
  slug: string;
  label: string;
}

/** Quante notti sono state usate su quante disponibili nella finestra. */
export interface Coverage {
  used: number;
  window: number;
}

/** Risultato "statistica con copertura". Se sotto soglia: value null e reason valorizzata. */
export interface Stat<T> {
  value: T | null;
  coverage: Coverage;
  /** Es. 'Servono almeno 14 notti. Per ora ne hai 9.' quando nascosta. */
  hiddenReason?: string;
}

export const TOLERANCE_MIN = 30;
export const BASELINE_WINDOW_DAYS = 14;
export const DEFAULT_TARGET_SLEEP_MIN = 450; // 7h30
