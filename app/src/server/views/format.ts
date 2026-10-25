/**
 * Formatter condivisi dei view model (testi italiani e formati del design system:
 * docs/design/system/README.md "Voce e contenuti").
 * - Orari in 24 ore '23:48' (Europe/Rome), durate '7h 32m', intervalli '23:48 → 07:20'.
 * - Scarti con segno '+12 min' / '−8 min' (meno tipografico U+2212), decimali con la virgola '+0,6'.
 * - Date per esteso minuscole 'sabato 24 ottobre'.
 * Mancante resta mancante: null (o un numero non finito) diventa '—', mai '0', mai 'NaN'.
 * Funzioni pure: nessun I/O, nessun Date.now().
 */
import { formatSigned } from '../../domain/deviations';
import { addDays, localParts } from '../../domain/time';
import type { Coverage, NightStatus, Provenance, Score } from '../../domain/types';

export const DASH = '—';
export const MINUS = '−';
export const ARROW = '→';

export const WEEKDAYS_LONG = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] as const;
export const WEEKDAYS_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] as const;
/** Etichette di colonna del calendario e della heatmap. */
export const WEEKDAYS_ROW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;
export const WEEKDAYS_INITIAL = ['L', 'M', 'M', 'G', 'V', 'S', 'D'] as const;
export const MONTHS_LONG = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;
export const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'] as const;

const pad = (n: number): string => String(n).padStart(2, '0');
const isNum = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);

/** Durata compatta: 452 → '7h 32m', 65 → '1h 05m', 40 → '0h 40m'. null → '—'. */
export function formatHm(min: number | null): string {
  if (!isNum(min)) return DASH;
  const total = Math.round(Math.abs(min));
  const sign = min < 0 && total > 0 ? MINUS : '';
  return `${sign}${Math.floor(total / 60)}h ${pad(total % 60)}m`;
}

/** Durata per le celle strette (calendario, heatmap, trend): 432 → '7h12'. null → '—'. */
export function formatHmCompact(min: number | null): string {
  if (!isNum(min)) return DASH;
  const total = Math.round(Math.abs(min));
  return `${Math.floor(total / 60)}h${pad(total % 60)}`;
}

/** Minuti semplici: 32 → '32 min'. null → '—'. */
export function formatMinutes(min: number | null): string {
  if (!isNum(min)) return DASH;
  return `${Math.round(min)} min`;
}

/** Minuti dalla mezzanotte (anche fuori da 0–1439) → 'HH:MM'. */
export function formatClockMinutes(min: number | null): string {
  if (!isNum(min)) return DASH;
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Minuti sull'asse del letto (dalle 18:00 locali, vedi bedAxisMinutes) → 'HH:MM'. */
export function formatAxisClock(axisMin: number | null): string {
  if (!isNum(axisMin)) return DASH;
  return formatClockMinutes(axisMin + 18 * 60);
}

/** Istante ISO → 'HH:MM' in Europe/Rome. null o ISO non valido → '—'. */
export function formatClock(iso: string | null): string {
  if (iso === null || Number.isNaN(Date.parse(iso))) return DASH;
  return formatClockMinutes(localParts(iso).minutes);
}

/** Intervallo '23:48 → 07:20'; le parti mancanti restano '—'. */
export function formatRange(fromIso: string | null, toIso: string | null): string {
  return `${formatClock(fromIso)} ${ARROW} ${formatClock(toIso)}`;
}

/** Scarto in minuti con segno: '+12 min', '−8 min', '0 min' (formatSigned del dominio). null → '—'. */
export function formatSignedMin(min: number | null): string {
  if (!isNum(min)) return DASH;
  return formatSigned(min);
}

/** Numero intero con segno senza unità: '+8', '−12', '0'. null → '—'. */
export function formatSignedNumber(n: number | null): string {
  if (!isNum(n)) return DASH;
  const abs = Math.round(Math.abs(n));
  if (abs === 0) return '0';
  return `${n < 0 ? MINUS : '+'}${abs}`;
}

/** Decimale con la virgola: 3.44 → '3,4'. null → '—'. */
export function formatDecimal(x: number | null, digits = 1): string {
  if (!isNum(x)) return DASH;
  const s = Math.abs(x).toFixed(digits);
  const zero = Number(s) === 0;
  return `${x < 0 && !zero ? MINUS : ''}${s.replace('.', ',')}`;
}

/** Decimale con segno: '+0,6', '−0,8', '0,0'. null → '—'. */
export function formatSignedDecimal(x: number | null, digits = 1): string {
  if (!isNum(x)) return DASH;
  const s = Math.abs(x).toFixed(digits);
  if (Number(s) === 0) return s.replace('.', ',');
  return `${x < 0 ? MINUS : '+'}${s.replace('.', ',')}`;
}

/** Ampiezza simmetrica: 24.3 → '± 24 min'. null → '—'. */
export function formatPlusMinus(min: number | null): string {
  if (!isNum(min)) return DASH;
  return `± ${Math.round(Math.abs(min))} min`;
}

/** Voto 1–5: '4 su 5'. null → '—'. */
export function formatScore(v: Score | number | null): string {
  if (!isNum(v)) return DASH;
  return `${Math.round(v)} su 5`;
}

/** 0 = lunedì … 6 = domenica per una data 'YYYY-MM-DD'. */
export function weekdayOf(date: string): number {
  return localParts(`${date}T12:00:00Z`).weekday;
}

function dateParts(date: string): { y: number; m: number; d: number } {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

/** 'sabato 24 ottobre' (minuscolo, per le frasi). */
export function formatLongDate(date: string): string {
  const { m, d } = dateParts(date);
  return `${WEEKDAYS_LONG[weekdayOf(date)] ?? ''} ${d} ${MONTHS_LONG[m - 1] ?? ''}`.trim();
}

/** '24 ottobre'. */
export function formatDayMonth(date: string): string {
  const { m, d } = dateParts(date);
  return `${d} ${MONTHS_LONG[m - 1] ?? ''}`.trim();
}

/** 'sab 24 ott'. */
export function formatShortDate(date: string): string {
  const { m, d } = dateParts(date);
  return `${WEEKDAYS_SHORT[weekdayOf(date)] ?? ''} ${d} ${MONTHS_SHORT[m - 1] ?? ''}`.trim();
}

/** Etichetta di riga del confronto tra notti: 'S 24'. */
export function formatDayInitial(date: string): string {
  return `${WEEKDAYS_INITIAL[weekdayOf(date)] ?? ''} ${dateParts(date).d}`.trim();
}

/** 'YYYY-MM' → 'ottobre 2026'. */
export function formatMonthYear(month: string): string {
  const { y, m } = dateParts(`${month}-01`);
  return `${MONTHS_LONG[m - 1] ?? ''} ${y}`.trim();
}

/** 'YYYY-MM' → 'ott'. */
export function formatMonthShort(month: string): string {
  return MONTHS_SHORT[Number(month.slice(5, 7)) - 1] ?? month;
}

/** Giorno relativo a oggi: 'oggi', 'ieri', 'ven' (ultimi 6 giorni), altrimenti '17 ott'. */
export function formatRelativeDay(date: string, today: string): string {
  if (date === today) return 'oggi';
  if (date === addDays(today, -1)) return 'ieri';
  for (let i = 2; i <= 6; i++) {
    if (date === addDays(today, -i)) return WEEKDAYS_SHORT[weekdayOf(date)] ?? date;
  }
  const { m, d } = dateParts(date);
  return `${d} ${MONTHS_SHORT[m - 1] ?? ''}`.trim();
}

/** Istante relativo: 'oggi 07:20', 'ieri 23:48', 'ven 08:05'. ISO non valido → '—'. */
export function formatWhen(iso: string, today: string): string {
  if (Number.isNaN(Date.parse(iso))) return DASH;
  return `${formatRelativeDay(localParts(iso).date, today)} ${formatClock(iso)}`;
}

const PROVENANCE_WORDS: Record<Provenance, string> = {
  automatico: 'Automatico',
  confermato: 'Confermato',
  stimato: 'Stimato',
  mancante: 'Mancante',
};

const STATUS_WORDS: Record<NightStatus, string> = {
  confermata: 'Confermata',
  stimata: 'Stimata',
  mancante: 'Mancante',
};

/** Provenienza di un valore con una parola: 'Automatico', 'Confermato', 'Stimato', 'Mancante'. */
export function provenanceWord(p: Provenance): string {
  return PROVENANCE_WORDS[p];
}

/** Stato di una notte (femminile): 'Confermata', 'Stimata', 'Mancante'. */
export function nightStatusWord(s: NightStatus): string {
  return STATUS_WORDS[s];
}

export type CoverageUnit = 'notti' | 'giorni' | 'settimane';
const SINGULAR: Record<CoverageUnit, string> = { notti: 'notte', giorni: 'giorno', settimane: 'settimana' };

/** 'Calcolata su 12 su 14 notti'. Con finestra di 1: 'Calcolata su 1 notte' / 'Nessuna notte disponibile'. */
export function formatCoverage(c: Coverage, unit: CoverageUnit = 'notti'): string {
  const used = Math.max(0, Math.round(c.used));
  const window = Math.max(0, Math.round(c.window));
  if (window <= 1) {
    if (used === 0) return unit === 'notti' ? 'Nessuna notte disponibile' : `Nessun dato disponibile`;
    return `Calcolata su 1 ${SINGULAR[unit]}`;
  }
  return `Calcolata su ${used} su ${window} ${unit}`;
}

/** Forma breve '9 su 14 notti'. */
export function formatCoverageShort(c: Coverage, unit: CoverageUnit = 'notti'): string {
  const window = Math.max(0, Math.round(c.window));
  return `${Math.max(0, Math.round(c.used))} su ${window} ${window === 1 ? SINGULAR[unit] : unit}`;
}
