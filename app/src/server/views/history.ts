/**
 * View model della schermata Storico: griglia del mese (L–D) con la durata per giorno e
 * riquadro di dettaglio della notte selezionata. Spec: docs/design/system/Schermate.md §Storico,
 * componente Calendar. Funzione pura: `today` e i dati sono parametri.
 */
import { clockChangeShiftMin, clockChangeText } from '../../domain/clock-change';
import { durationBand, nightDuration, sleep24h, type DurationBand } from '../../domain/sleep-balance';
import { DEFAULT_LABELS } from '../../domain/questions';
import { addDays, isWeekendNight } from '../../domain/time';
import type { Nap, Night, NightStatus } from '../../domain/types';
import { nightsByDate, statusOf } from './common';
import {
  DASH,
  WEEKDAYS_INITIAL,
  formatDayMonth,
  formatHm,
  formatHmCompact,
  formatLongDate,
  formatMinutes,
  formatMonthYear,
  formatRange,
  formatScore,
  nightStatusWord,
  provenanceWord,
  weekdayOf,
} from './format';

export interface HistoryViewInput {
  today: string;
  nights: Night[];
  naps?: Nap[];
  /** Mese da mostrare 'YYYY-MM'; default: il mese di `today`. */
  month?: string;
  /** Giorno selezionato 'YYYY-MM-DD'; default: `today` se nel mese, altrimenti l'ultimo giorno passato del mese. */
  selectedDate?: string | null;
  /** Etichette di fattori personalizzati. */
  factorLabels?: Record<string, string>;
}

export interface CalendarCellView {
  /** null per le celle vuote prima del primo giorno del mese. */
  date: string | null;
  day: number | null;
  /** Durata breve '7h12', '—' se mancante, '' se futuro o vuota. */
  shortText: string;
  band: DurationBand | null;
  status: NightStatus | null;
  future: boolean;
  disabled: boolean;
  selected: boolean;
  isToday: boolean;
  /** +60 / −60 se in quella notte è cambiata l'ora (anche nei giorni futuri), altrimenti 0. */
  clockShiftMin: number;
  ariaLabel: string;
}

export interface NightDetailView {
  date: string;
  title: string;
  dateLabel: string;
  durationText: string;
  rangeText: string;
  status: NightStatus;
  statusWord: string;
  bedProvenanceWord: string;
  wakeProvenanceWord: string;
  note: string;
  /** Frase sul cambio d'ora di quella notte, null se non c'è. */
  clockChangeNote: string | null;
  tags: string[];
}

export interface HistoryView {
  empty: boolean;
  emptyText: string | null;
  month: string;
  /** 'ottobre 2026'. */
  title: string;
  weekdays: string[];
  cells: CalendarCellView[];
  selectedDate: string | null;
  detail: NightDetailView | null;
  legend: string;
  prevMonth: string;
  /** null se il mese successivo è nel futuro. */
  nextMonth: string | null;
}

export const HISTORY_EMPTY_TEXT = 'Nessuna notte registrata in questo mese.';

function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const year = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(year).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}`;
}

function daysInMonth(month: string): number {
  let n = 28;
  while (addDays(`${month}-01`, n).slice(0, 7) === month) n++;
  return n;
}

function labelOf(slug: string, extra: Record<string, string> | undefined): string {
  return extra?.[slug] ?? DEFAULT_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function buildNightDetail(
  date: string,
  night: Night | null,
  naps: Nap[],
  factorLabels?: Record<string, string>,
): NightDetailView {
  const title = `Notte del ${formatDayMonth(date)}`;
  const shift = clockChangeShiftMin(date);
  const clockTag = shift === 0 ? [] : [`Cambio d'ora: ${shift > 0 ? '+' : '−'}${Math.abs(shift) / 60} h`];
  const dateLabel = formatLongDate(date);
  const hasTimes = !!night && (night.bedAt.value !== null || night.wakeAt.value !== null);
  if (!night || !hasTimes) {
    return {
      date,
      title,
      dateLabel,
      durationText: DASH,
      rangeText: 'Nessun dato',
      status: 'mancante',
      statusWord: nightStatusWord('mancante'),
      bedProvenanceWord: provenanceWord('mancante'),
      wakeProvenanceWord: provenanceWord('mancante'),
      note: [
        'Nessun segnale ricevuto. Puoi inserire gli orari a mano o lasciare la stima dei giorni vicini.',
        clockChangeText(shift, 'quella'),
      ]
        .filter(Boolean)
        .join(' '),
      clockChangeNote: clockChangeText(shift, 'quella'),
      tags: [...(night?.isException ? ['Eccezione'] : []), ...clockTag],
    };
  }
  const min = nightDuration(night);
  const status = night.status;
  const tags: string[] = [];
  if (night.quality.value !== null) tags.push(`Qualità ${formatScore(night.quality.value)}`);
  if (night.energy.value !== null) tags.push(`Energia ${formatScore(night.energy.value)}`);
  tags.push(isWeekendNight(date) ? 'Notte del weekend' : 'Giorno feriale');
  const napMin = naps
    .filter((p) => p.date === date && p.minutes > 0 && p.provenance !== 'mancante')
    .reduce((a, p) => a + p.minutes, 0);
  if (napMin > 0) {
    tags.push(`Sonnellino ${formatMinutes(napMin)}`);
    const s24 = sleep24h(night, naps);
    if (s24 !== null) tags.push(`Sonno 24 ore ${formatHm(s24)}`);
  }
  if (night.isException) tags.push('Eccezione');
  tags.push(...clockTag);
  for (const f of night.factors) tags.push(labelOf(f, factorLabels));
  const note =
    status === 'confermata'
      ? 'Orari confermati da te la mattina dopo.'
      : status === 'stimata'
        ? 'Orari stimati dai segnali. Conferma per renderli definitivi.'
        : 'Dati parziali: il resto della notte manca.';
  const noteWithClock = [note, clockChangeText(shift, 'quella')].filter(Boolean).join(' ');
  return {
    date,
    title,
    dateLabel,
    durationText: formatHm(min),
    rangeText: formatRange(night.bedAt.value, night.wakeAt.value),
    status,
    statusWord: nightStatusWord(status),
    bedProvenanceWord: provenanceWord(night.bedAt.value === null ? 'mancante' : night.bedAt.provenance),
    wakeProvenanceWord: provenanceWord(night.wakeAt.value === null ? 'mancante' : night.wakeAt.provenance),
    clockChangeNote: clockChangeText(shift, 'quella'),
    note: night.isException ? `${noteWithClock} Giorno-eccezione: non conta nel riferimento della regolarità.` : noteWithClock,
    tags,
  };
}

export function buildHistoryView(input: HistoryViewInput): HistoryView {
  const { today } = input;
  const naps = input.naps ?? [];
  const month = input.month ?? today.slice(0, 7);
  const byDate = nightsByDate(input.nights);
  const first = `${month}-01`;
  const total = daysInMonth(month);
  const lastPast = month === today.slice(0, 7) ? today : month < today.slice(0, 7) ? addDays(first, total - 1) : null;

  let selected: string | null = input.selectedDate !== undefined ? input.selectedDate : lastPast;
  if (selected !== null && (selected.slice(0, 7) !== month || selected > today)) selected = null;

  const cells: CalendarCellView[] = [];
  for (let i = 0; i < weekdayOf(first); i++) {
    cells.push({
      date: null,
      day: null,
      shortText: '',
      band: null,
      status: null,
      future: false,
      disabled: true,
      selected: false,
      isToday: false,
      clockShiftMin: 0,
      ariaLabel: '',
    });
  }
  let nightsInMonth = 0;
  for (let d = 0; d < total; d++) {
    const date = addDays(first, d);
    const future = date > today;
    const n = byDate.get(date);
    const min = n ? nightDuration(n) : null;
    const status: NightStatus | null = future ? null : statusOf(n);
    if (n && (n.bedAt.value !== null || n.wakeAt.value !== null)) nightsInMonth++;
    const shortText = future ? '' : min === null ? DASH : formatHmCompact(min);
    cells.push({
      date,
      day: d + 1,
      shortText,
      band: future || min === null ? null : durationBand(min),
      status,
      future,
      disabled: future,
      selected: date === selected,
      isToday: date === today,
      clockShiftMin: clockChangeShiftMin(date),
      ariaLabel:
        (future
          ? `Notte del ${formatDayMonth(date)}`
          : `Notte del ${formatDayMonth(date)}: ${min === null ? 'mancante' : `${formatHm(min)}, ${nightStatusWord(statusOf(n)).toLowerCase()}`}`) +
        (clockChangeShiftMin(date) === 0 ? '' : ", cambio d'ora"),
    });
  }

  const empty = nightsInMonth === 0;
  const next = shiftMonth(month, 1);
  return {
    empty,
    emptyText: empty ? HISTORY_EMPTY_TEXT : null,
    month,
    title: formatMonthYear(month),
    weekdays: [...WEEKDAYS_INITIAL],
    cells,
    selectedDate: selected,
    detail: selected === null ? null : buildNightDetail(selected, byDate.get(selected) ?? null, naps, input.factorLabels),
    legend: 'Verde 8h+ · Azzurro 7–8h · Pesca meno di 7h · Tratteggio = stimata · Punti = mancante',
    prevMonth: shiftMonth(month, -1),
    nextMonth: next > today.slice(0, 7) ? null : next,
  };
}
