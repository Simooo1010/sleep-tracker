/**
 * Contratto condiviso della funzionalità «Modifica notte dallo Storico» (docs/NIGHT_EDIT.md).
 * Solo tipi e costanti: nessuna logica. Lo usano la mutation (`night-edit.ts`), la view/pagina
 * (`views/night-edit.ts`, `pages/night-edit.ts`) e la UI (`app/storico/[date]`).
 */
import type { NightStatus, Score } from '../domain/types';

/**
 * Modifica di una notte. Convenzione per ogni campo: `undefined` = non toccato,
 * `null` = rimuovi il valore (torna «mancante»), valore = imposta come «confermato».
 */
export interface NightEditInput {
  /** Data del risveglio 'YYYY-MM-DD' (identifica la notte); non nel futuro. */
  nightDate: string;
  /**
   * Orari, SEMPRE insieme: istanti ISO UTC (la UI li ricava da "HH:MM" con `toNightIso`).
   * Se presenti, la notte diventa 'confermata' con entrambi gli orari 'confermato'.
   */
  times?: { bedAt: string; wakeAt: string };
  quality?: Score | null;
  energy?: Score | null;
  /** Imprevisti della notte (sostituisce l'elenco); `labels` = nomi dei tipi nuovi creati qui. */
  exceptions?: { slugs: string[]; labels?: Record<string, string> };
  /** Check della SERA PRIMA (data = nightDate − 1 giorno). Ogni campo segue la convenzione sopra. */
  evening?: {
    tiredness?: Score | null;
    mood?: Score | null;
    /** Sostituisce i fattori della sera; riflessi anche in `Night.factors`. */
    factors?: string[];
    dayNote?: string | null;
  };
}

export interface NightEditOption {
  slug: string;
  label: string;
  selected: boolean;
}

/** Tutto ciò che serve alla schermata `/storico/[date]`. Serializzabile. */
export interface NightEditView {
  /** nightDate 'YYYY-MM-DD'. */
  date: string;
  /** 'Notte del 24 ottobre'. */
  title: string;
  /** 'sabato 24 ottobre 2026'. */
  dateLabel: string;
  /** 'Sera di venerdì 23 ottobre' (la sera a cui si riferiscono fattori, umore e nota). */
  eveningLabel: string;
  status: NightStatus;
  statusWord: string;
  /** "HH:MM" locali (Europe/Rome); null se mancanti. */
  bedTime: string | null;
  wakeTime: string | null;
  bedProvenanceWord: string;
  wakeProvenanceWord: string;
  /** '7h 12m' oppure '—'. */
  durationText: string;
  /** Punto di partenza dei campi orario quando mancano: mediana delle notti recenti, altrimenti 23:30 / 07:30. */
  suggestedBedTime: string;
  suggestedWakeTime: string;
  quality: Score | null;
  energy: Score | null;
  /** Imprevisti noti (ordinati per uso) con quelli attivi della notte. */
  exceptions: NightEditOption[];
  /** Fattori della sera prima: predefiniti + eventuali personalizzati già selezionati. */
  factors: NightEditOption[];
  tiredness: Score | null;
  mood: Score | null;
  /** Nota sulla giornata (testo intero, '' se assente). */
  dayNote: string;
  /** Sonnellino registrato quel giorno, in sola lettura ('Sonnellino 32 min'), altrimenti null. */
  napText: string | null;
  /** Notte precedente; null solo se prima del limite minimo. */
  prevDate: string | null;
  /** Notte successiva; null se sarebbe nel futuro (oltre oggi). */
  nextDate: string | null;
  /** '/storico?m=YYYY-MM&d=YYYY-MM-DD' */
  backHref: string;
}

/** Notte recente da sistemare (mancante o stimata), mostrata in Storico come «Da sistemare». */
export interface HistoryTodoItem {
  date: string;
  /** 'giovedì 22 ottobre' */
  label: string;
  status: Extract<NightStatus, 'mancante' | 'stimata'>;
  /** '/storico/2026-10-22' */
  href: string;
}

/** Quanti giorni indietro (da ieri) cerca «Da sistemare». */
export const HISTORY_TODO_DAYS = 14;

/** Indirizzo della schermata di modifica. */
export const nightEditHref = (date: string): string => `/storico/${date}`;
