/**
 * View model della schermata Segnali: una riga per automazione con stato a parole, registro degli
 * ultimi eventi, avvisi (una sola volta, solo se cala la precisione).
 * Spec: docs/design/system/Schermate.md §Segnali, componente SignalRow, PROJECT.md §3c.8.
 * Funzione pura: `today` e i dati sono parametri.
 */
import { signalsHealth, type SignalHealthStatus } from '../../domain/signals-health';
import { addDays, localParts } from '../../domain/time';
import type { EveningCheck, Night, SignalEvent, SignalType } from '../../domain/types';
import { DASH, formatRelativeDay, formatWhen } from './format';

export interface SignalsViewInput {
  today: string;
  events: SignalEvent[];
  /** Segnali per cui l'avviso è già stato mostrato (si avvisa una sola volta). */
  alreadyWarned?: SignalType[];
  /** Per la riga "Stima di riserva". */
  nights?: Night[];
  /** Per la riga "Recupero sonnellino". */
  eveningChecks?: EveningCheck[];
  /** Righe del registro (default 8). */
  logLimit?: number;
}

export type SignalRowStatus = SignalHealthStatus | 'riserva';

export interface SignalRowView {
  key: string;
  name: string;
  description: string;
  /** 'oggi 07:20', 'ieri 23:48', 'Mai ricevuto'. */
  lastText: string;
  status: SignalRowStatus;
  /** 'Attivo', 'Da configurare', 'In pausa'. */
  statusWord: string;
  statusTone: 'sage' | 'peach' | 'neutral';
}

export interface SignalLogItemView {
  ts: string;
  when: string;
  what: string;
  /** 'Registrato', 'Stima usata'. */
  result: string;
}

export interface SignalWarningView {
  type: SignalType;
  text: string;
}

export interface SignalsView {
  empty: boolean;
  emptyText: string | null;
  title: string;
  rows: SignalRowView[];
  log: { title: string; items: SignalLogItemView[]; emptyText: string | null };
  warnings: SignalWarningView[];
  /** Segnali che l'app non attende più (nessun buco rosso, nessun rimprovero). */
  notWaitingFor: SignalType[];
}

export const SIGNALS_EMPTY_TEXT = 'Nessun segnale ancora. Quando un Comando invia il primo evento, compare qui.';

const DESCRIPTIONS: Record<string, string> = {
  wake: 'Comando automatico · invia "wake", coincide con l\'alzata',
  bedtime_candidate: 'Full Immersion attivata a mano · invia "bedtime_candidate"',
  evening_check: 'Comando "Sera" · salva stanchezza, umore e fattori',
  nap_start: 'Comando inizio/fine · oppure timer chiuso dalla sveglia',
  app_open: 'Prima app aperta al mattino · limite superiore del risveglio',
};

const STATUS_WORDS: Record<SignalRowStatus, string> = {
  attivo: 'Attivo',
  'da-configurare': 'Da configurare',
  inattivo: 'In pausa',
  riserva: 'Attivo',
};
const STATUS_TONES: Record<SignalRowStatus, SignalRowView['statusTone']> = {
  attivo: 'sage',
  'da-configurare': 'peach',
  inattivo: 'neutral',
  riserva: 'sage',
};

const EVENT_TEXT: Record<SignalType, string> = {
  wake: 'Sveglia interrotta → wake',
  bedtime_candidate: 'Riposo attivato → bedtime_candidate',
  evening_check: 'Check serale salvato → evening_check',
  nap_start: 'Sonnellino iniziato → nap_start',
  nap_end: 'Sonnellino terminato → nap_end',
  app_open: 'Primo uso del telefono → app_open',
};

function volte(n: number): string {
  return n === 1 ? '1 volta' : `${n} volte`;
}

export function buildSignalsView(input: SignalsViewInput): SignalsView {
  const { today } = input;
  const valid = input.events.filter((e) => {
    const ms = Date.parse(e.ts);
    return !Number.isNaN(ms) && localParts(e.ts).date <= today;
  });
  const health = signalsHealth(valid, today, input.alreadyWarned ?? []);

  const rows: SignalRowView[] = health.signals.map((s) => ({
    key: s.type,
    name: s.label,
    description: DESCRIPTIONS[s.type] ?? '',
    lastText: s.lastSeen === null ? 'Mai ricevuto' : formatWhen(s.lastSeen, today),
    status: s.status,
    statusWord: STATUS_WORDS[s.status],
    statusTone: STATUS_TONES[s.status],
  }));

  // Stima di riserva: sempre disponibile; dice quante volte è servita negli ultimi 14 giorni.
  const from = addDays(today, -13);
  const recent = (input.nights ?? []).filter((n) => n.nightDate >= from && n.nightDate <= today);
  const estimatedUses = recent.filter(
    (n) =>
      n.status !== 'confermata' &&
      ((n.bedAt.value !== null && n.bedAt.provenance === 'stimato') ||
        (n.wakeAt.value !== null && n.wakeAt.provenance === 'stimato')),
  ).length;
  rows.push({
    key: 'stima',
    name: 'Stima di riserva',
    description: "Se un segnale manca, propone l'orario dei giorni simili",
    lastText: estimatedUses === 0 ? 'Non usata negli ultimi 14 giorni' : `Usata ${volte(estimatedUses)} negli ultimi 14 giorni`,
    status: 'riserva',
    statusWord: STATUS_WORDS.riserva,
    statusTone: STATUS_TONES.riserva,
  });

  // Recupero sonnellino: domanda nel check serale.
  const lastRecovery = (input.eveningChecks ?? [])
    .filter((c) => c.date <= today && c.napMinutesToday.value !== null)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  rows.push({
    key: 'recupero-sonnellino',
    name: 'Recupero sonnellino',
    description: 'Domanda nel check serale se il comando non è stato usato',
    lastText: lastRecovery ? `${formatRelativeDay(lastRecovery.date, today)} sera` : DASH,
    status: 'riserva',
    statusWord: STATUS_WORDS.riserva,
    statusTone: STATUS_TONES.riserva,
  });

  const limit = Math.max(0, Math.floor(input.logLimit ?? 8));
  const items: SignalLogItemView[] = [...valid]
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, limit)
    .map((e) => ({
      ts: e.ts,
      when: formatWhen(e.ts, today),
      what: EVENT_TEXT[e.type],
      result: e.source === 'stima' ? 'Stima usata' : 'Registrato',
    }));

  const empty = valid.length === 0;
  return {
    empty,
    emptyText: empty ? SIGNALS_EMPTY_TEXT : null,
    title: 'Segnali',
    rows,
    log: { title: 'Ultimi segnali', items, emptyText: items.length === 0 ? 'Ancora nessun evento registrato.' : null },
    warnings: health.warnings.map((w) => ({ type: w.type, text: w.text })),
    notWaitingFor: [...health.shouldStopWaiting],
  };
}
