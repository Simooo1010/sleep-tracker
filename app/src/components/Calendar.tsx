'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';

import styles from './Calendar.module.css';

/**
 * Calendar: lo Storico. Mese con la durata di ogni notte e riquadro di dettaglio della notte selezionata.
 * Spec: docs/design/system/components/Calendar/README.md. Classi: `.card`, `.cell*`, `.badge*`, `.big` di bundle.css.
 * Griglia da lunedì, frecce per spostarsi, Invio/Spazio per selezionare. Ogni giorno ha un aria-label completo
 * ("sabato 24 ottobre, 7h 32m, confermata"). La durata è sempre scritta: su telefono in forma compatta (7h32).
 */

export type CalendarStatus = 'confermata' | 'stimata' | 'mancante';

export interface CalendarNight {
  /** Giorno della notte, YYYY-MM-DD. */
  date: string;
  /** Durata in minuti; null se assente. */
  minutes: number | null;
  status: CalendarStatus;
  /** Orari già formattati per il dettaglio, es. "23:48" e "07:20". */
  start?: string;
  end?: string;
  /** Nota breve per il dettaglio. */
  note?: string;
  /** Tag già scritti, es. "Qualità 4 su 5", "Energia 3 su 5", "Notte del weekend", "Sonnellino 32 min". */
  tags?: readonly string[];
  /** Descrizione della giornata scritta dall'utente (sola lettura). `label` inizia sempre con "Nota". */
  dayNote?: { label: string; text: string };
}

export interface CalendarProps {
  year: number;
  /** Mese 1–12. */
  month: number;
  /** Notti del mese. Un giorno passato senza voce è mostrato come mancante. */
  nights: readonly CalendarNight[];
  /** Oggi, YYYY-MM-DD: i giorni successivi sono futuri (vuoti e non selezionabili). */
  today?: string;
  /** Selezione controllata. */
  selectedDate?: string | null;
  /** Selezione iniziale se non controllata. */
  defaultSelectedDate?: string | null;
  onSelect?: (date: string) => void;
  /** Giorni con cambio d'ora: data → +60 (ora tornata indietro) o −60 (ora andata avanti). Segnati anche se futuri. */
  clockChanges?: Readonly<Record<string, number>>;
  /** Titolo. Default "Ottobre 2026". */
  title?: string;
  className?: string;
}

// ——— Date (pure, in UTC, nessun fuso) ———

const MONTHS = [
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

/** Lunedì = 0 … domenica = 6. */
export const WEEKDAYS: readonly { short: string; full: string }[] = [
  { short: 'L', full: 'lunedì' },
  { short: 'M', full: 'martedì' },
  { short: 'M', full: 'mercoledì' },
  { short: 'G', full: 'giovedì' },
  { short: 'V', full: 'venerdì' },
  { short: 'S', full: 'sabato' },
  { short: 'D', full: 'domenica' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function fromUtc(dt: Date): string {
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** "YYYY-MM-DD". */
export function isoDate(year: number, month: number, day: number): string {
  return fromUtc(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(iso: string, n: number): string {
  const dt = toUtc(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

/** Giorno della settimana con lunedì = 0. */
export function weekdayIndex(iso: string): number {
  return (toUtc(iso).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface MonthGridDay {
  date: string;
  /** Numero del giorno nel suo mese. */
  day: number;
  /** false per i giorni del mese precedente o successivo che completano la settimana. */
  inMonth: boolean;
}

/** Settimane del mese da lunedì a domenica (4–6 righe da 7), con i giorni fuori mese a completare. */
export function buildMonthGrid(year: number, month: number): MonthGridDay[][] {
  const first = isoDate(year, month, 1);
  const last = isoDate(year, month, daysInMonth(year, month));
  let cursor = addDays(first, -weekdayIndex(first));
  const end = addDays(last, 6 - weekdayIndex(last));
  const weeks: MonthGridDay[][] = [];
  while (cursor <= end) {
    const week: MonthGridDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = toUtc(cursor);
      week.push({
        date: cursor,
        day: dt.getUTCDate(),
        inMonth: dt.getUTCFullYear() === year && dt.getUTCMonth() + 1 === month,
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** "Ottobre 2026". */
export function monthTitle(year: number, month: number): string {
  const name = MONTHS[month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** "sabato 24 ottobre". */
export function formatDayLabel(iso: string): string {
  const dt = toUtc(iso);
  return `${WEEKDAYS[weekdayIndex(iso)]?.full ?? ''} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()] ?? ''}`;
}

// ——— Durate ———

export type DurationBand = 'sage' | 'blue' | 'peach';

/** 8h o più salvia, 7h–8h azzurro, meno di 7h pesca. Minuti arrotondati come nel testo. */
export function durationBand(minutes: number): DurationBand {
  const m = Math.round(minutes);
  if (m >= 480) return 'sage';
  if (m >= 420) return 'blue';
  return 'peach';
}

function validMinutes(minutes: number | null): minutes is number {
  return minutes !== null && Number.isFinite(minutes) && minutes >= 0;
}

/** "7h 32m". Valori non validi: "—". */
export function formatDuration(minutes: number | null): string {
  if (!validMinutes(minutes)) return '—';
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`;
}

/** Forma compatta per il telefono: "7h32". */
export function formatDurationCompact(minutes: number | null): string {
  if (!validMinutes(minutes)) return '—';
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h${pad2(m % 60)}`;
}

function nightHasDuration(n: CalendarNight | undefined): n is CalendarNight & { minutes: number } {
  return n !== undefined && n.status !== 'mancante' && validMinutes(n.minutes);
}

/** aria-label completo del giorno: "sabato 24 ottobre, 7h 32m, confermata". */
export function dayAriaLabel(iso: string, night: CalendarNight | undefined, future = false, clockShift = 0): string {
  const day = formatDayLabel(iso);
  const clock = clockShift === 0 ? '' : clockShift > 0 ? ", cambio d'ora: un'ora in più" : ", cambio d'ora: un'ora in meno";
  if (future) return `${day}, giorno futuro${clock}`;
  if (!night || night.status === 'mancante') return `${day}, mancante${clock}`;
  if (!nightHasDuration(night)) return `${day}, durata non disponibile, ${night.status}${clock}`;
  return `${day}, ${formatDuration(night.minutes)}, ${night.status}${clock}`;
}

/** Segno vettoriale del giorno del cambio d'ora (orologio con freccia). */
function ClockMark() {
  return (
    <svg className={styles.clockMark} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 3.4V6l1.8 1.1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Classi di bundle.css per la cella di un giorno passato. */
export function dayCellClass(night: CalendarNight | undefined): string {
  if (!nightHasDuration(night)) return night?.status === 'stimata' ? 'cell cell-miss cell-est' : 'cell cell-miss';
  const band = { sage: 'cell-8', blue: 'cell-7', peach: 'cell-6' }[durationBand(night.minutes)];
  return night.status === 'stimata' ? `cell ${band} cell-est` : `cell ${band}`;
}

/**
 * Giorno su cui spostare il focus per un tasto (frecce, Home, End), limitato a [first, last].
 * null per gli altri tasti.
 */
export function nextFocusDate(current: string, key: string, first: string, last: string): string | null {
  let target: string;
  switch (key) {
    case 'ArrowLeft':
      target = addDays(current, -1);
      break;
    case 'ArrowRight':
      target = addDays(current, 1);
      break;
    case 'ArrowUp':
      target = addDays(current, -7);
      break;
    case 'ArrowDown':
      target = addDays(current, 7);
      break;
    case 'Home':
      target = addDays(current, -weekdayIndex(current));
      break;
    case 'End':
      target = addDays(current, 6 - weekdayIndex(current));
      break;
    default:
      return null;
  }
  if (target < first) return first;
  if (target > last) return last;
  return target;
}

const STATUS_WORD: Record<CalendarStatus, string> = {
  confermata: 'Confermata',
  stimata: 'Stimata',
  mancante: 'Mancante',
};

const STATUS_BADGE: Record<CalendarStatus, string> = {
  confermata: 'badge-confirmed',
  stimata: 'badge-estimated',
  mancante: 'badge-missing',
};

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Calendar({
  year,
  month,
  nights,
  today,
  selectedDate,
  defaultSelectedDate = null,
  onSelect,
  clockChanges,
  title,
  className,
}: CalendarProps) {
  const titleId = useId();
  const [internalSelected, setInternalSelected] = useState<string | null>(defaultSelectedDate);
  const [focused, setFocused] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const selected = selectedDate !== undefined ? selectedDate : internalSelected;
  const weeks = buildMonthGrid(year, month);
  const byDate = new Map(nights.map((n) => [n.date, n]));

  const first = isoDate(year, month, 1);
  const monthEnd = isoDate(year, month, daysInMonth(year, month));
  const last = today !== undefined && today < monthEnd ? today : monthEnd;
  const hasSelectable = last >= first;
  const isSelectable = (iso: string | null | undefined): iso is string =>
    hasSelectable && typeof iso === 'string' && iso >= first && iso <= last;

  const tabTarget = [focused, selected, today, last].find(isSelectable) ?? null;
  const selectedNight = isSelectable(selected)
    ? (byDate.get(selected) ?? { date: selected, minutes: null, status: 'mancante' as const })
    : null;

  function choose(date: string) {
    setFocused(date);
    if (selectedDate === undefined) setInternalSelected(date);
    onSelect?.(date);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, date: string) {
    const next = nextFocusDate(date, e.key, first, last);
    if (next === null) return;
    e.preventDefault();
    setFocused(next);
    buttons.current.get(next)?.focus();
  }

  return (
    <section className={cx('card', styles.root, className)} aria-labelledby={titleId}>
      <h3 id={titleId} className={cx('serif', styles.title)}>
        {title ?? monthTitle(year, month)}
      </h3>
      <div className={styles.layout}>
        <div className={styles.month}>
          <div role="grid" aria-labelledby={titleId} className={styles.grid}>
            <div role="row" className={styles.row}>
              {WEEKDAYS.map((w) => (
                <div key={w.full} role="columnheader" aria-label={w.full} className={styles.weekday}>
                  <span aria-hidden="true">{w.short}</span>
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]?.date} role="row" className={styles.row}>
                {week.map((d) => {
                  if (!d.inMonth) return <div key={d.date} role="gridcell" className={styles.empty} />;
                  if (!isSelectable(d.date)) {
                    return (
                      <div
                        key={d.date}
                        role="gridcell"
                        aria-disabled="true"
                        aria-label={dayAriaLabel(d.date, undefined, true, clockChanges?.[d.date] ?? 0)}
                        className={cx('cell', styles.day, styles.future)}
                      >
                        <span className={styles.num}>{d.day}</span>
                        {clockChanges?.[d.date] ? <ClockMark /> : null}
                      </div>
                    );
                  }
                  const night = byDate.get(d.date);
                  const shown = nightHasDuration(night);
                  const isSelected = d.date === selected;
                  return (
                    <div key={d.date} role="gridcell" aria-selected={isSelected} className={styles.slot}>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) buttons.current.set(d.date, el);
                          else buttons.current.delete(d.date);
                        }}
                        tabIndex={d.date === tabTarget ? 0 : -1}
                        aria-label={dayAriaLabel(d.date, night, false, clockChanges?.[d.date] ?? 0)}
                        aria-current={d.date === today ? 'date' : undefined}
                        className={cx(dayCellClass(night), styles.day, isSelected && styles.isSelected)}
                        onClick={() => choose(d.date)}
                        onKeyDown={(e) => handleKeyDown(e, d.date)}
                      >
                        <span className={styles.num}>{d.day}</span>
                        {clockChanges?.[d.date] ? <ClockMark /> : null}
                        <span className={styles.dur} aria-hidden="true">
                          <span className={styles.durFull}>{shown ? formatDuration(night.minutes) : '—'}</span>
                          <span className={styles.durShort}>
                            {shown ? formatDurationCompact(night.minutes) : '—'}
                          </span>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <ul className={cx('caption', 'muted', styles.legend)} aria-label="Legenda">
            <li>Verde 8h+</li>
            <li>Azzurro 7–8h</li>
            <li>Pesca meno di 7h</li>
            <li>Tratteggio = stimata</li>
            <li>Punti = mancante</li>
            {clockChanges && Object.keys(clockChanges).length > 0 ? <li>Orologio = cambio d&apos;ora</li> : null}
          </ul>
        </div>
        <div className={styles.detail} aria-live="polite">
          {selectedNight ? (
            <>
              <h4 className={cx('eyebrow', styles.detailDate)}>{formatDayLabel(selectedNight.date)}</h4>
              <p className={cx('big', styles.detailValue)}>
                {nightHasDuration(selectedNight) ? formatDuration(selectedNight.minutes) : '—'}
              </p>
              {selectedNight.start && selectedNight.end ? (
                <p className={cx('body', styles.interval)}>{`${selectedNight.start} → ${selectedNight.end}`}</p>
              ) : null}
              <div className="row">
                <span className={cx('badge', STATUS_BADGE[selectedNight.status])}>
                  {STATUS_WORD[selectedNight.status]}
                </span>
                {(selectedNight.tags ?? []).map((t) => (
                  <span key={t} className={cx('badge', styles.tag)}>
                    {t}
                  </span>
                ))}
              </div>
              {selectedNight.note ? (
                <p className={cx('body-sm', 'muted', styles.note)}>{selectedNight.note}</p>
              ) : selectedNight.status === 'mancante' ? (
                <p className={cx('body-sm', 'muted', styles.note)}>Nessun dato per questa notte.</p>
              ) : null}
              {selectedNight.dayNote ? (
                <div>
                  <p className="eyebrow">{selectedNight.dayNote.label}</p>
                  <p className={cx('body-sm', styles.note)}>{selectedNight.dayNote.text}</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className={cx('body-sm', 'muted', styles.note)}>Scegli un giorno per vedere la notte.</p>
          )}
        </div>
      </div>
    </section>
  );
}
