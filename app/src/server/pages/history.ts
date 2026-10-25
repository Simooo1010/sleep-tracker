/**
 * Dati della pagina Storico: valida i parametri dell'URL, legge dal repo le notti e i sonnellini del
 * mese mostrato e costruisce la view (funzione pura `buildHistoryView`). Nessun accesso a variabili
 * globali: repo e istante arrivano dal chiamante.
 */
import { todayInRome } from '@/lib/clock';
import type { Repo } from '@/server/types';
import { buildHistoryView, type HistoryView, type HistoryViewInput } from '@/server/views';

/** Parametri grezzi dell'URL: `m` = mese 'YYYY-MM', `d` = giorno 'YYYY-MM-DD'. */
export interface HistoryParams {
  m?: string | undefined;
  d?: string | undefined;
}

export interface HistorySelection {
  /** Mese da mostrare 'YYYY-MM' (default: il mese di oggi). */
  month: string;
  /** Giorno scelto e valido; assente se il parametro manca o è da ignorare (la view sceglie il predefinito). */
  selectedDate?: string;
}

export interface HistoryPageData {
  /** Data locale di oggi ('YYYY-MM-DD'). */
  today: string;
  view: HistoryView;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Sotto questo anno il parametro è considerato non valido (evita date degeneri). */
const MIN_YEAR = 2000;

/** true se `m` è un mese 'YYYY-MM' ben formato (anno da 2000). */
export function isValidMonth(m: unknown): m is string {
  if (typeof m !== 'string') return false;
  const match = MONTH_RE.exec(m);
  return match !== null && Number(match[1]) >= MIN_YEAR;
}

/** true se `d` è un giorno 'YYYY-MM-DD' che esiste davvero nel calendario (29 febbraio solo negli anni bisestili). */
export function isValidDay(d: unknown): d is string {
  if (typeof d !== 'string') return false;
  const match = DAY_RE.exec(d);
  if (!match) return false;
  const [y, mo, da] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < MIN_YEAR) return false;
  const dt = new Date(Date.UTC(y, mo - 1, da));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === da;
}

/** Primo e ultimo giorno ('YYYY-MM-DD') di un mese 'YYYY-MM' valido. */
export function monthBounds(month: string): { first: string; last: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(total).padStart(2, '0')}` };
}

/**
 * Valida i parametri dell'URL. Valori non validi non producono errori: si ignorano.
 * - `m`: ben formato e non oltre il mese di oggi; altrimenti il mese corrente.
 * - `d`: giorno reale, dentro il mese mostrato e non nel futuro; altrimenti nessuna scelta.
 */
export function parseHistoryParams(params: HistoryParams, today: string): HistorySelection {
  const currentMonth = today.slice(0, 7);
  const month = isValidMonth(params.m) && params.m <= currentMonth ? params.m : currentMonth;
  const d = params.d;
  if (isValidDay(d) && d.slice(0, 7) === month && d <= today) return { month, selectedDate: d };
  return { month };
}

export async function loadHistoryPage(repo: Repo, now: Date, params: HistoryParams): Promise<HistoryPageData> {
  const today = todayInRome(now);
  const { month, selectedDate } = parseHistoryParams(params, today);
  const { first, last } = monthBounds(month);
  // Ogni notte è identificata dalla data del risveglio; il mese non supera mai il mese di oggi, quindi to >= first.
  const to = last < today ? last : today;

  const [nights, naps, exceptionTypes] = await Promise.all([
    repo.listNights(first, to),
    repo.listNaps(first, to),
    repo.listExceptionTypes(),
  ]);

  // Le eccezioni sono già in `Night.isException` e in `Night.factors`: i tipi servono solo per le etichette.
  const factorLabels: Record<string, string> = {};
  for (const t of exceptionTypes) factorLabels[t.slug] = t.label;

  const input: HistoryViewInput = {
    today,
    nights,
    naps,
    month,
    factorLabels,
    ...(selectedDate !== undefined ? { selectedDate } : {}),
  };
  return { today, view: buildHistoryView(input) };
}
