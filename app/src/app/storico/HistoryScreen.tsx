'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Calendar, type CalendarNight } from '@/components/Calendar';
import { Coverage, type CoverageMark } from '@/components/Coverage';
import type { HistoryView } from '@/server/views';

import styles from './HistoryScreen.module.css';

/**
 * Pagina Storico (sola lettura): mese con la durata per giorno e dettaglio della notte selezionata.
 * Il `Calendar` è controllato dall'URL (`?m=YYYY-MM&d=YYYY-MM-DD`): scegliere un giorno aggiorna l'URL
 * con `router.replace`, le frecce portano al mese vicino. Telefono: la cella mostra la durata compatta e il
 * dettaglio sta sotto il calendario; PC: calendario a sinistra e dettaglio a destra.
 */

export const NO_DATA_TEXT = 'Nessun dato per questo giorno.';
const RANGE_SEPARATOR = ' → ';

/** '7h12' (formatHmCompact) → minuti; null per '—' o testi non validi. */
export function minutesFromCompact(text: string): number | null {
  const match = /^(\d+)h(\d{2})$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Indirizzo dello Storico per mese e giorno (il giorno è facoltativo). */
export function historyHref(month: string, date?: string | null): string {
  return date ? `/storico?m=${month}&d=${date}` : `/storico?m=${month}`;
}

const lower = (word: string): string => word.charAt(0).toLowerCase() + word.slice(1);

/** Notti del `Calendar` dalla view: durata dalle celle, orari, note e tag dal dettaglio della notte selezionata. */
export function toCalendarNights(view: HistoryView): CalendarNight[] {
  const out: CalendarNight[] = [];
  for (const cell of view.cells) {
    if (cell.date === null || cell.future) continue;
    const status = cell.status ?? 'mancante';
    const minutes = status === 'mancante' ? null : minutesFromCompact(cell.shortText);
    const night: CalendarNight = { date: cell.date, minutes, status };
    const detail = view.detail;
    if (detail && detail.date === cell.date) {
      const missing = detail.status === 'mancante';
      const [start, end] = detail.rangeText.split(RANGE_SEPARATOR);
      if (!missing && start && end) {
        night.start = start;
        night.end = end;
      }
      night.note = missing
        ? [NO_DATA_TEXT, detail.clockChangeNote].filter(Boolean).join(' ')
        : `Letto: ${lower(detail.bedProvenanceWord)}. Sveglia: ${lower(detail.wakeProvenanceWord)}. ${detail.note}`;
      night.tags = detail.tags;
    }
    out.push(night);
  }
  return out;
}

/** Giorni del mese con cambio d'ora (data → ±60 minuti), anche futuri. */
export function clockChangesOf(view: HistoryView): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of view.cells) if (c.date !== null && c.clockShiftMin !== 0) out[c.date] = c.clockShiftMin;
  return out;
}

/** Segni di copertura del mese: una notte per ogni giorno passato. */
export function coverageMarks(view: HistoryView): CoverageMark[] {
  return view.cells.filter((c) => c.date !== null && !c.future).map((c) => c.status ?? 'mancante');
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

export interface HistoryScreenProps {
  view: HistoryView;
  /** Oggi 'YYYY-MM-DD'; se manca si ricava dalla cella di oggi. */
  today?: string;
}

export function HistoryScreen({ view, today }: HistoryScreenProps) {
  const router = useRouter();
  const year = Number(view.month.slice(0, 4));
  const month = Number(view.month.slice(5, 7));
  const todayDate = today ?? view.cells.find((c) => c.isToday)?.date ?? undefined;
  const marks = coverageMarks(view);

  function select(date: string) {
    router.replace(historyHref(view.month, date), { scroll: false });
  }

  return (
    <div className={styles.page}>
      <h1 className={`serif ${styles.pageTitle}`}>Storico</h1>

      <nav className={styles.monthNav} aria-label="Cambia mese">
        <Link
          href={historyHref(view.prevMonth)}
          replace
          scroll={false}
          className={`btn btn-secondary btn-round ${styles.arrow}`}
          aria-label="Mese precedente"
        >
          <Chevron direction="left" />
        </Link>
        {view.nextMonth === null ? (
          <button
            type="button"
            className={`btn btn-secondary btn-round ${styles.arrow}`}
            aria-label="Mese successivo"
            disabled
          >
            <Chevron direction="right" />
          </button>
        ) : (
          <Link
            href={historyHref(view.nextMonth)}
            replace
            scroll={false}
            className={`btn btn-secondary btn-round ${styles.arrow}`}
            aria-label="Mese successivo"
          >
            <Chevron direction="right" />
          </Link>
        )}
      </nav>

      <h2 className={styles.srOnly}>Calendario del mese</h2>
      <Calendar
        year={year}
        month={month}
        nights={toCalendarNights(view)}
        clockChanges={clockChangesOf(view)}
        {...(todayDate !== undefined ? { today: todayDate } : {})}
        selectedDate={view.selectedDate}
        onSelect={select}
      />

      {view.empty && view.emptyText ? <p className={`body muted ${styles.note}`}>{view.emptyText}</p> : null}
      {marks.length > 0 ? (
        <Coverage used={0} total={marks.length} marks={marks} prefix="Notti con dati nel mese:" />
      ) : null}
    </div>
  );
}
