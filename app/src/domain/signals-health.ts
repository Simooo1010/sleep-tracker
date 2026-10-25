/**
 * Salute dei segnali (schermata Segnali, docs/PROJECT.md §3c.8).
 * Se un segnale non arriva da giorni l'app smette di attenderlo (niente buchi rossi,
 * niente rimproveri) e avvisa una sola volta, solo se la sua assenza fa calare la precisione.
 * Funzione pura: nessun I/O, nessun Date.now(). Giorni calcolati in Europe/Rome.
 */
import type { SignalEvent, SignalType } from './types';
import { localParts } from './time';

export type SignalHealthStatus = 'attivo' | 'da-configurare' | 'inattivo';

export interface SignalHealthRow {
  type: SignalType;
  label: string;
  status: SignalHealthStatus;
  /** Istante ISO dell'ultimo evento visto (fino a oggi compreso), null se mai visto. */
  lastSeen: string | null;
  /** Giorni di calendario locali tra l'ultimo evento e oggi (0 = oggi), null se mai visto. */
  daysSince: number | null;
}

export interface SignalWarning {
  type: SignalType;
  text: string;
}

export interface SignalsHealth {
  signals: SignalHealthRow[];
  shouldStopWaiting: SignalType[];
  warnings: SignalWarning[];
}

/** Da quanti giorni senza eventi un segnale smette di essere atteso. */
export const SIGNAL_INACTIVE_DAYS = 3;

interface RowSpec {
  type: SignalType;
  label: string;
  /** Tipi di evento che alimentano la riga. */
  sources: SignalType[];
}

/** Righe mostrate, nell'ordine della schermata Segnali. */
const ROWS: RowSpec[] = [
  { type: 'wake', label: 'Sveglia interrotta', sources: ['wake'] },
  { type: 'bedtime_candidate', label: 'Riposo attivato', sources: ['bedtime_candidate'] },
  { type: 'evening_check', label: 'Check serale', sources: ['evening_check'] },
  { type: 'nap_start', label: 'Sonnellino rapido', sources: ['nap_start', 'nap_end'] },
  { type: 'app_open', label: 'Prima apertura al mattino', sources: ['app_open'] },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayIndex(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function giorni(n: number): string {
  return n === 1 ? '1 giorno' : `${n} giorni`;
}

export function signalsHealth(
  events: SignalEvent[],
  today: string,
  alreadyWarned: SignalType[],
): SignalsHealth {
  if (!DATE_RE.test(today) || Number.isNaN(Date.parse(`${today}T00:00:00Z`))) {
    throw new Error(`Data non valida: ${today}`);
  }
  const todayIdx = dayIndex(today);

  // Ultimo evento per tipo (per istante), ignorando eventi oltre oggi locale.
  const latest = new Map<SignalType, { ts: string; ms: number; days: number }>();
  for (const ev of events) {
    const ms = Date.parse(ev.ts);
    if (Number.isNaN(ms)) continue;
    const days = todayIdx - dayIndex(localParts(ev.ts).date);
    if (days < 0) continue;
    const prev = latest.get(ev.type);
    if (!prev || ms > prev.ms) latest.set(ev.type, { ts: ev.ts, ms, days });
  }

  const signals: SignalHealthRow[] = ROWS.map((row) => {
    let best: { ts: string; ms: number; days: number } | undefined;
    for (const t of row.sources) {
      const l = latest.get(t);
      if (l && (!best || l.ms > best.ms)) best = l;
    }
    if (!best) {
      return { type: row.type, label: row.label, status: 'da-configurare', lastSeen: null, daysSince: null };
    }
    return {
      type: row.type,
      label: row.label,
      status: best.days >= SIGNAL_INACTIVE_DAYS ? 'inattivo' : 'attivo',
      lastSeen: best.ts,
      daysSince: best.days,
    };
  });

  const byType = new Map(signals.map((s) => [s.type, s]));
  const isActive = (t: SignalType): boolean => byType.get(t)?.status === 'attivo';

  const shouldStopWaiting = signals
    .filter((s) => s.status === 'inattivo' && (s.daysSince ?? 0) >= SIGNAL_INACTIVE_DAYS)
    .map((s) => s.type);

  const warned = new Set(alreadyWarned);
  const warnings: SignalWarning[] = [];
  for (const s of signals) {
    if (s.status !== 'inattivo' || s.daysSince === null || warned.has(s.type)) continue;
    if (s.type === 'wake') {
      const fallback = isActive('app_open')
        ? 'userò la prima apertura al mattino come limite'
        : 'stimerò il risveglio dai giorni simili';
      warnings.push({
        type: 'wake',
        text: `La sveglia interrotta non arriva da ${giorni(s.daysSince)}: ${fallback}.`,
      });
    } else if (s.type === 'bedtime_candidate') {
      const fallback = isActive('evening_check')
        ? 'userò il check serale come orario di letto'
        : "stimerò l'orario di letto dai giorni simili";
      warnings.push({
        type: 'bedtime_candidate',
        text: `Riposo non si attiva da ${giorni(s.daysSince)}: ${fallback}.`,
      });
    }
  }

  return { signals, shouldStopWaiting, warnings };
}
