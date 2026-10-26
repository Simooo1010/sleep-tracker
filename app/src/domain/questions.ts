/**
 * Domande rapide del giorno e ordinamento dei chip eccezione.
 * Spec: docs/PROJECT.md §3c.4–6, docs/design/system/Dati-e-calcoli.md ("Provenienza e copertura").
 * Funzioni pure: nessun I/O, nessun Date.now(). "Oggi" arriva da ctx.today ('YYYY-MM-DD', Europe/Rome).
 */
import type { EveningCheck, Night } from './types';
import { addDays, localParts } from './time';

export type QuestionKind = 'confirm_night' | 'energy' | 'quality' | 'nap_today' | 'exception' | 'factors';

export interface Question {
  kind: QuestionKind;
  nightDate?: string;
  priority: number;
  text: string;
}

export interface AskedQuestion {
  /** Giorno locale in cui la domanda è stata mostrata. */
  date: string;
  kind: QuestionKind;
  /** Facoltativo: se presente, la domanda è identificata da kind + notte; altrimenti dal solo kind. */
  nightDate?: string;
  /** true = risposta data o saltata: oggi non si ripete. false = mostrata, ancora in attesa. */
  answeredOrSkipped: boolean;
}

export interface QuestionContext {
  today: string;
  nights: Night[];
  eveningChecks: EveningCheck[];
  asked: AskedQuestion[];
  napsRecentlyMissing: boolean;
}

/** Budget totale di domande al giorno (comprese quelle già mostrate oggi). */
export const DAILY_QUESTION_BUDGET = 3;
/** Notti recuperabili: oggi e le 2 precedenti. Le più vecchie restano stimate. */
export const RECOVERY_NIGHTS = 3;

/** Priorità (valore informativo). Più alto = prima. */
export const PRIORITY: Record<QuestionKind, number> = {
  confirm_night: 100,
  energy: 80,
  nap_today: 70,
  quality: 60,
  exception: 50,
  factors: 40,
};

export const DEFAULT_EXCEPTIONS: readonly string[] = ['malattia', 'viaggio', 'festa', 'notte-in-bianco', 'alcol'];

/** Il caffè non è un fattore: l'utente non lo consuma. */
export const DEFAULT_FACTORS: readonly string[] = [
  'schermo-a-letto',
  'sport',
  'giornata-stressante',
  'cena-tardi',
  'alcol',
  'mal-di-testa',
];

export const DEFAULT_LABELS: Readonly<Record<string, string>> = {
  malattia: 'Malattia',
  viaggio: 'Viaggio',
  festa: 'Festa',
  'notte-in-bianco': 'Notte in bianco',
  alcol: 'Alcol',
  'schermo-a-letto': 'Schermo a letto',
  sport: 'Sport',
  'giornata-stressante': 'Giornata stressante',
  'cena-tardi': 'Cena tardi',
  'mal-di-testa': 'Mal di testa',
};

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function dayLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''}`.trim();
}

function nightLabel(nightDate: string, today: string): string {
  if (nightDate === today) return 'Stanotte';
  return `Notte tra ${dayLabel(addDays(nightDate, -1))} e ${dayLabel(nightDate)}`;
}

function hhmm(iso: string): string {
  const m = localParts(iso).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function confirmText(n: Night, today: string): string {
  const label = nightLabel(n.nightDate, today);
  const bed = n.bedAt.value;
  const wake = n.wakeAt.value;
  if (bed !== null && wake !== null) return `${label}: a letto alle ${hhmm(bed)}, sveglia alle ${hhmm(wake)}. Confermi?`;
  if (bed !== null) return `${label}: a letto alle ${hhmm(bed)}. Confermi?`;
  if (wake !== null) return `${label}: sveglia alle ${hhmm(wake)}. Confermi?`;
  return `${label}: confermi gli orari stimati?`;
}

function key(kind: QuestionKind, nightDate?: string): string {
  return `${kind}|${nightDate ?? ''}`;
}

/**
 * Seleziona le domande del giorno, ordinate per valore informativo, entro il budget di 3.
 * - Il budget conta anche le domande già mostrate oggi (distinte per kind + notte).
 * - Una domanda già risposta/saltata oggi non si ripete; una mostrata e ancora in attesa
 *   viene riproposta (occupa lo slot già contato), così la funzione è idempotente.
 * - Si recuperano solo le ultime 3 notti (today, today-1, today-2): le più vecchie restano stimate.
 * - Energia, qualità, eccezione e fattori riguardano solo la notte più recente, e solo quando è confermata.
 * - Nulla da chiedere → [].
 */
export function selectQuestions(ctx: QuestionContext): Question[] {
  const { today } = ctx;
  const oldest = addDays(today, -(RECOVERY_NIGHTS - 1));

  // Notti nella finestra di recupero, una per data (l'ultima occorrenza vince), dalla più recente.
  const byDate = new Map<string, Night>();
  for (const n of ctx.nights) {
    if (n.nightDate >= oldest && n.nightDate <= today) byDate.set(n.nightDate, n);
  }
  const recent = [...byDate.values()].sort((a, b) => (a.nightDate < b.nightDate ? 1 : -1));

  const candidates: Question[] = [];

  // 1. Conferma delle notti stimate (la più recente vale di più).
  recent
    .filter((n) => n.status === 'stimata')
    .forEach((n, i) => {
      candidates.push({
        kind: 'confirm_night',
        nightDate: n.nightDate,
        priority: PRIORITY.confirm_night - i * 5,
        text: confirmText(n, today),
      });
    });

  // 2. Domande sulla notte più recente, solo se confermata.
  const latest = recent[0];
  if (latest && latest.status === 'confermata') {
    const nd = latest.nightDate;
    const isToday = nd === today;
    if (latest.energy.value === null) {
      candidates.push({
        kind: 'energy',
        nightDate: nd,
        priority: PRIORITY.energy,
        text: isToday ? 'Energia stamattina? (1–5)' : `Energia al risveglio del ${dayLabel(nd)}? (1–5)`,
      });
    }
    if (latest.quality.value === null) {
      candidates.push({
        kind: 'quality',
        nightDate: nd,
        priority: PRIORITY.quality,
        text: isToday ? 'Come hai dormito? (1–5)' : `Come hai dormito la ${nightLabel(nd, today).toLowerCase()}? (1–5)`,
      });
    }
    if (!latest.isException) {
      candidates.push({
        kind: 'exception',
        nightDate: nd,
        priority: PRIORITY.exception,
        text: 'Giornata particolare? (malattia, viaggio, festa…)',
      });
    }
    const eveningBefore = ctx.eveningChecks.find((c) => c.date === addDays(nd, -1));
    if (latest.factors.length === 0 && (eveningBefore?.factors.length ?? 0) === 0) {
      candidates.push({
        kind: 'factors',
        nightDate: nd,
        priority: PRIORITY.factors,
        text: 'Ieri sera: qualcosa da segnare? (schermo a letto, sport…)',
      });
    }
  }

  // 3. Sonnellino di oggi, solo se i comandi rapidi non vengono usati da giorni.
  if (ctx.napsRecentlyMissing) {
    const check = ctx.eveningChecks.find((c) => c.date === today);
    if (!check || check.napMinutesToday.value === null) {
      candidates.push({ kind: 'nap_today', priority: PRIORITY.nap_today, text: 'Sonnellino oggi? Quanto?' });
    }
  }

  // Domande già mostrate oggi.
  const todayAsked = ctx.asked.filter((a) => a.date === today);
  const askedKeys = new Set(todayAsked.map((a) => key(a.kind, a.nightDate)));
  const closedExact = new Set(todayAsked.filter((a) => a.answeredOrSkipped).map((a) => key(a.kind, a.nightDate)));
  const closedKind = new Set(todayAsked.filter((a) => a.answeredOrSkipped && !a.nightDate).map((a) => a.kind));
  const pendingExact = new Set(todayAsked.filter((a) => !a.answeredOrSkipped).map((a) => key(a.kind, a.nightDate)));
  const pendingKind = new Set(todayAsked.filter((a) => !a.answeredOrSkipped && !a.nightDate).map((a) => a.kind));

  const isClosed = (q: Question) => closedKind.has(q.kind) || closedExact.has(key(q.kind, q.nightDate));
  const isPending = (q: Question) => pendingKind.has(q.kind) || pendingExact.has(key(q.kind, q.nightDate));

  const ordered = candidates
    .filter((q) => !isClosed(q))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (b.nightDate ?? '').localeCompare(a.nightDate ?? '') ||
        a.kind.localeCompare(b.kind),
    );

  // Ogni voce già mostrata oggi consuma uno slot; le pendenti tornano senza consumarne altri.
  const pending: Question[] = [];
  const pendingSlotsUsed = new Set<string>();
  for (const q of ordered) {
    if (!isPending(q)) continue;
    const slot = pendingKind.has(q.kind) ? key(q.kind) : key(q.kind, q.nightDate);
    if (pendingSlotsUsed.has(slot)) continue;
    pendingSlotsUsed.add(slot);
    pending.push(q);
  }
  const remaining = Math.max(0, DAILY_QUESTION_BUDGET - askedKeys.size);
  const fresh = ordered.filter((q) => !isPending(q)).slice(0, remaining);

  return [...pending, ...fresh]
    .slice(0, DAILY_QUESTION_BUDGET)
    .sort((a, b) => b.priority - a.priority || (b.nightDate ?? '').localeCompare(a.nightDate ?? ''));
}

export interface ChipType {
  slug: string;
  label: string;
  uses: number;
}

function labelOf(slug: string): string {
  const known = DEFAULT_LABELS[slug];
  if (known) return known;
  const s = slug.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Chip eccezione: frequenza d'uso decrescente, a parità ordine alfabetico per label (it).
 * Lista aperta: i tipi personalizzati restano; i default non presenti si aggiungono in coda (uses 0),
 * nell'ordine dato.
 */
export function orderExceptionChips(types: ChipType[], defaults: readonly string[]): ChipType[] {
  const seen = new Set<string>();
  const unique: ChipType[] = [];
  for (const t of types) {
    if (seen.has(t.slug)) continue;
    seen.add(t.slug);
    unique.push({ slug: t.slug, label: t.label, uses: Math.max(0, t.uses) });
  }
  unique.sort(
    (a, b) =>
      b.uses - a.uses ||
      a.label.localeCompare(b.label, 'it', { sensitivity: 'base' }) ||
      a.slug.localeCompare(b.slug),
  );
  for (const slug of defaults) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    unique.push({ slug, label: labelOf(slug), uses: 0 });
  }
  return unique;
}

// --- Imprevisti liberi e descrizione della giornata ---

/** Lunghezza massima dell'etichetta di un imprevisto libero (caratteri, dopo la normalizzazione). */
export const EXCEPTION_LABEL_MAX = 30;
/** Lunghezza massima della descrizione della giornata (`EveningCheck.dayNote`). */
export const DAY_NOTE_MAX = 280;
/** Lunghezza massima del testo di una giornata inviato all'AI (`dayContext[].text`). */
export const DAY_CONTEXT_TEXT_MAX = 140;
/** Numero massimo di giornate "particolari" inviate all'AI. */
export const DAY_CONTEXT_MAX_DAYS = 10;
/** Lunghezza massima di uno slug di imprevisto. */
export const EXCEPTION_SLUG_MAX = 40;
/** Forma valida di uno slug di imprevisto/fattore. */
export const EXCEPTION_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Etichetta libera → slug kebab-case: minuscolo, senza accenti, non alfanumerici → '-',
 * trattini collassati e tolti ai bordi, max 40 caratteri senza trattino finale.
 * Ritorna '' se non resta nulla (es. solo simboli o emoji). Idempotente.
 */
export function slugifyExceptionLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, EXCEPTION_SLUG_MAX)
    .replace(/-+$/, '');
}

/** Etichetta mostrata: trim, spazi collassati, max EXCEPTION_LABEL_MAX caratteri (per code point). Idempotente. */
export function normalizeExceptionLabel(label: string): string {
  const collapsed = label.trim().replace(/\s+/g, ' ');
  return Array.from(collapsed).slice(0, EXCEPTION_LABEL_MAX).join('').trimEnd();
}
