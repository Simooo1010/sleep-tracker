/**
 * View model della schermata Notte (scheda Stanotte, timeline, domande rapide, eccezioni,
 * confronto con il solito, quattro StatTile). Spec: docs/design/system/Schermate.md §Notte,
 * componenti SessionCard, Timeline, QuickQuestion, ExceptionChips, StatTile.
 * Funzione pura: `today` ('YYYY-MM-DD', giorno del risveglio di stanotte) e i dati sono parametri.
 */
import { computeBaseline } from '../../domain/baseline';
import { nightDeviation, regularityStats } from '../../domain/deviations';
import {
  DEFAULT_EXCEPTIONS,
  orderExceptionChips,
  selectQuestions,
  type AskedQuestion,
  type ChipType,
  type QuestionKind,
} from '../../domain/questions';
import { durationStats, nightDuration, sleep24h, sleepDebt } from '../../domain/sleep-balance';
import { addDays, bedAxisMinutes, localParts } from '../../domain/time';
import {
  DEFAULT_TARGET_SLEEP_MIN,
  TOLERANCE_MIN,
  type EveningCheck,
  type Nap,
  type Night,
  type NightStatus,
  type Provenance,
  type SignalEvent,
  type SignalType,
} from '../../domain/types';
import {
  DURATION_SCALE_MIN,
  axisPct,
  bedAxisToAxis,
  clamp,
  coverageMarks,
  coverageView,
  hiddenTextOf,
  nightBar,
  nightsByDate,
  round2,
  tile,
  type BarView,
  type StatTileView,
} from './common';
import {
  DASH,
  formatAxisClock,
  formatClock,
  formatHm,
  formatLongDate,
  formatPlusMinus,
  formatRange,
  formatScore,
  formatSignedMin,
  nightStatusWord,
  provenanceWord,
} from './format';

export interface NightViewInput {
  today: string;
  nights: Night[];
  /** Segnali grezzi (almeno quelli della notte: dalle 18:00 di ieri alle 14:00 di oggi). */
  events?: SignalEvent[];
  naps?: Nap[];
  eveningChecks?: EveningCheck[];
  /** Domande già mostrate oggi (per il budget di 2–3 al giorno). */
  asked?: AskedQuestion[];
  napsRecentlyMissing?: boolean;
  /** Tipi di eccezione con la loro frequenza d'uso (lista aperta). */
  exceptionTypes?: ChipType[];
  /**
   * Slug delle eccezioni della notte di stanotte (fonte: `night_exceptions`, da `listNightExceptions`).
   * Se assente o vuoto si ricade sul vecchio schema (`isException` + slug in `factors`, come nel seed demo).
   */
  activeExceptions?: string[];
  targetMin?: number;
}

export interface TimeValueView {
  iso: string | null;
  /** '23:48' oppure '—'. */
  text: string;
  provenance: Provenance;
  provenanceWord: string;
}

export interface ScoreView {
  value: number | null;
  /** '4 su 5' oppure '—'. */
  text: string;
  provenance: Provenance;
  provenanceWord: string;
}

/** confermato = punto azzurro; serale = punto salvia (check serale, primo uso); da-confermare = punto vuoto tratteggiato. */
export type TimelineKind = 'confermato' | 'serale' | 'da-confermare';

export interface TimelineItemView {
  /** Istante ISO (per ordinamento e chiavi), null per gli orari solo stimati senza segnale. */
  ts: string | null;
  time: string;
  title: string;
  origin: string;
  kind: TimelineKind;
}

export interface QuickAnswerView {
  value: string;
  label: string;
}

export interface QuickQuestionView {
  kind: QuestionKind;
  nightDate: string | null;
  text: string;
  answers: QuickAnswerView[];
  skipLabel: string;
}

export interface ExceptionChipView {
  slug: string;
  label: string;
  uses: number;
  active: boolean;
}

export interface RegularityPillView {
  bedText: string;
  wakeText: string;
  ok: boolean;
  /** 'nella tolleranza' / 'fuori tolleranza'. */
  word: string;
  /** 'Letto +8 min · Sveglia −12 min · nella tolleranza (scarti dalla mediana)'. */
  text: string;
}

export interface ComparisonRowView {
  key: 'bed' | 'duration' | 'regularity';
  label: string;
  text: string;
  nowPct: number | null;
  usualPct: number | null;
}

export interface NightView {
  empty: boolean;
  emptyText: string | null;
  nightDate: string;
  label: string;
  /** 'sabato 24 ottobre'. */
  dateLabel: string;
  status: NightStatus;
  statusWord: string;
  durationMin: number | null;
  durationText: string;
  bed: TimeValueView;
  wake: TimeValueView;
  /** '23:48 → 07:20' (parti mancanti '—'). */
  rangeText: string;
  bar: BarView | null;
  explanation: string;
  confirmed: boolean;
  canConfirm: boolean;
  confirmLabel: string;
  editLabel: string;
  confirmedText: string;
  undoLabel: string;
  energy: ScoreView;
  quality: ScoreView;
  regularity: RegularityPillView | null;
  timeline: { title: string; items: TimelineItemView[]; emptyText: string | null };
  questions: QuickQuestionView[];
  exceptions: { chips: ExceptionChipView[]; addLabel: string; note: string };
  comparison: { title: string; hidden: boolean; hiddenText: string | null; rows: ComparisonRowView[] };
  stats: StatTileView[];
}

export const NIGHT_EMPTY_TEXT =
  'Per stanotte non è arrivato nessun segnale. Puoi inserire gli orari a mano, oppure lasciarla mancante.';
export const TIMELINE_EMPTY_TEXT = 'Nessun segnale per questa notte.';

const missingTime = (): TimeValueView => ({ iso: null, text: DASH, provenance: 'mancante', provenanceWord: 'Mancante' });

function timeValue(t: Night['bedAt']): TimeValueView {
  const prov: Provenance = t.value === null ? 'mancante' : t.provenance;
  return { iso: t.value, text: formatClock(t.value), provenance: prov, provenanceWord: provenanceWord(prov) };
}

function scoreValue(t: Night['energy'] | undefined): ScoreView {
  if (!t || t.value === null) return { value: null, text: DASH, provenance: 'mancante', provenanceWord: 'Mancante' };
  return { value: t.value, text: formatScore(t.value), provenance: t.provenance, provenanceWord: provenanceWord(t.provenance) };
}

const sameInstant = (a: string, b: string): boolean => Date.parse(a) === Date.parse(b);

function matchType(events: SignalEvent[], iso: string): SignalType | null {
  return events.find((e) => sameInstant(e.ts, iso))?.type ?? null;
}

/** Frase "come è stata stimata". */
export function explainNight(night: Night | null, events: SignalEvent[]): string {
  if (!night || (night.bedAt.value === null && night.wakeAt.value === null)) return NIGHT_EMPTY_TEXT;
  if (night.status === 'confermata') return 'Orari confermati da te.';

  let bedPart: string | null = null;
  if (night.bedAt.value !== null) {
    const t = matchType(events, night.bedAt.value);
    const src =
      t === 'bedtime_candidate' || (t === null && night.bedAt.provenance === 'automatico')
        ? 'da Riposo'
        : t === 'evening_check'
          ? 'dal check serale'
          : night.bedAt.provenance === 'confermato'
            ? 'da te'
            : 'dai giorni simili';
    bedPart = `Inizio stimato ${src} (${formatClock(night.bedAt.value)})`;
  }
  let wakePart: string | null = null;
  if (night.wakeAt.value !== null) {
    const t = matchType(events, night.wakeAt.value);
    const src =
      t === 'wake' || (t === null && night.wakeAt.provenance === 'automatico')
        ? 'dalla sveglia interrotta'
        : t === 'app_open'
          ? 'dal primo uso del telefono'
          : night.wakeAt.provenance === 'confermato'
            ? 'confermata da te'
            : 'stimata dai giorni simili';
    wakePart = `fine ${src} (${formatClock(night.wakeAt.value)})`;
  }
  const head =
    bedPart && wakePart
      ? `${bedPart}, ${wakePart}`
      : (bedPart ?? `${(wakePart as string).charAt(0).toUpperCase()}${(wakePart as string).slice(1)}`);
  return `${head}. Controlla e conferma.`;
}

/** Segnali nella finestra della notte: [ieri 18:00, oggi 14:00] locali. */
function inNightWindow(ts: string, nightDate: string): boolean {
  if (Number.isNaN(Date.parse(ts))) return false;
  const { date, minutes } = localParts(ts);
  if (date === addDays(nightDate, -1)) return minutes >= 18 * 60;
  return date === nightDate && minutes <= 14 * 60;
}

function buildTimeline(
  night: Night | null,
  nightDate: string,
  events: SignalEvent[],
  checks: EveningCheck[],
): TimelineItemView[] {
  const evs = events
    .filter((e) => inNightWindow(e.ts, nightDate))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const check = checks.find((c) => c.date === addDays(nightDate, -1)) ?? null;
  const items: TimelineItemView[] = [];
  let firstAppOpen = true;
  let firstWake = true;
  for (const e of evs) {
    const time = formatClock(e.ts);
    switch (e.type) {
      case 'evening_check': {
        const tired = check?.tiredness.value ?? null;
        items.push({
          ts: e.ts,
          time,
          title: 'Check serale salvato',
          origin: tired === null ? 'Comando "Sera"' : `Comando "Sera" · stanchezza ${formatScore(tired)}`,
          kind: 'serale',
        });
        break;
      }
      case 'bedtime_candidate':
        items.push({ ts: e.ts, time, title: 'Riposo attivato', origin: 'Comando Full Immersion', kind: 'confermato' });
        break;
      case 'wake':
        if (!firstWake) break;
        firstWake = false;
        items.push({ ts: e.ts, time, title: 'Sveglia interrotta', origin: 'Comando automatico · sei in piedi', kind: 'confermato' });
        break;
      case 'app_open':
        if (!firstAppOpen) break;
        firstAppOpen = false;
        items.push({
          ts: e.ts,
          time,
          title: 'Primo uso del telefono',
          origin: night?.status === 'confermata' ? 'Comando automatico' : 'Notte ricostruita, da confermare',
          kind: 'serale',
        });
        break;
      case 'nap_start':
        items.push({ ts: e.ts, time, title: 'Sonnellino iniziato', origin: 'Comando rapido', kind: 'confermato' });
        break;
      case 'nap_end':
        items.push({ ts: e.ts, time, title: 'Sonnellino terminato', origin: 'Comando rapido', kind: 'confermato' });
        break;
    }
  }
  // Orari stimati senza un segnale corrispondente: si vedono come "da confermare".
  if (night && night.status !== 'confermata') {
    const synth: Array<{ iso: string | null; title: string }> = [
      { iso: night.bedAt.provenance === 'stimato' ? night.bedAt.value : null, title: 'Inizio stimato' },
      { iso: night.wakeAt.provenance === 'stimato' ? night.wakeAt.value : null, title: 'Risveglio stimato' },
    ];
    for (const s of synth) {
      if (s.iso === null || evs.some((e) => sameInstant(e.ts, s.iso as string))) continue;
      items.push({
        ts: s.iso,
        time: formatClock(s.iso),
        title: s.title,
        origin: 'Notte ricostruita dai giorni simili · da confermare',
        kind: 'da-confermare',
      });
    }
    items.sort((a, b) => Date.parse(a.ts ?? '') - Date.parse(b.ts ?? ''));
  }
  return items;
}

const YES_NO: QuickAnswerView[] = [
  { value: 'si', label: 'Sì' },
  { value: 'no', label: 'No' },
];
const SCORES: QuickAnswerView[] = [1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: String(v) }));
export const NAP_CHOICES: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 0, label: 'Nessuno' },
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 ora' },
];

function answersFor(kind: QuestionKind): QuickAnswerView[] {
  switch (kind) {
    case 'confirm_night':
      return [
        { value: 'conferma', label: 'Conferma' },
        { value: 'correggi', label: 'Correggi' },
      ];
    case 'energy':
    case 'quality':
      return SCORES;
    case 'nap_today':
      return NAP_CHOICES.map((c) => ({ value: String(c.minutes), label: c.label }));
    case 'exception':
    case 'factors':
      return YES_NO;
  }
}

export function buildNightView(input: NightViewInput): NightView {
  const { today } = input;
  const events = input.events ?? [];
  const naps = input.naps ?? [];
  const checks = input.eveningChecks ?? [];
  const target = input.targetMin ?? DEFAULT_TARGET_SLEEP_MIN;
  const byDate = nightsByDate(input.nights);
  const night = byDate.get(today) ?? null;
  const hasAny = !!night && (night.bedAt.value !== null || night.wakeAt.value !== null);
  const status: NightStatus = night && hasAny ? night.status : 'mancante';
  const durationMin = night ? nightDuration(night) : null;

  // Regolarità di stanotte rispetto alla mediana dei 14 giorni precedenti.
  const baseline = computeBaseline(input.nights, today);
  let regularity: RegularityPillView | null = null;
  const dev = night && baseline.value ? nightDeviation(night, baseline.value) : null;
  if (dev && dev.bedDev !== null && dev.wakeDev !== null) {
    const ok = dev.regular === true;
    const word = ok ? 'nella tolleranza' : 'fuori tolleranza';
    const bedText = formatSignedMin(dev.bedDev);
    const wakeText = formatSignedMin(dev.wakeDev);
    regularity = { bedText, wakeText, ok, word, text: `Letto ${bedText} · Sveglia ${wakeText} · ${word} (scarti dalla mediana)` };
  }

  // Statistiche (finestre che includono stanotte).
  const durations = durationStats(input.nights, today);
  const debt = sleepDebt(input.nights, today, target);
  const reg = baseline.value ? regularityStats(input.nights, baseline.value, today) : null;
  const marks14 = coverageMarks(byDate, today, 14);
  const marks7 = coverageMarks(byDate, today, 7);

  const regHidden = reg ? hiddenTextOf(reg.stdBed) : hiddenTextOf(baseline);
  const tol = reg?.withinTolerance.value ?? null;
  const yesterday = byDate.get(addDays(today, -1)) ?? null;
  const s24 = yesterday ? sleep24h(yesterday, naps) : null;
  const napYesterday = naps.some((p) => p.date === addDays(today, -1) && p.minutes > 0 && p.provenance !== 'mancante');

  const stats: StatTileView[] = [
    tile({
      key: 'duration',
      label: 'Durata media',
      tone: 'blue',
      note: 'Ultime 7 notti',
      value: durations.avg7.value === null ? null : formatHm(durations.avg7.value),
      hiddenText: hiddenTextOf(durations.avg7),
      coverage: coverageView(durations.avg7.coverage, marks7),
    }),
    tile({
      key: 'regularity',
      label: 'Regolarità',
      tone: 'sage',
      note: tol ? `${tol.count} notti su ${tol.of} nella tolleranza` : `Letto e sveglia entro ± ${TOLERANCE_MIN} min`,
      value: reg && reg.stdBed.value !== null ? formatPlusMinus(reg.stdBed.value) : null,
      hiddenText: regHidden,
      coverage: coverageView(reg ? reg.stdBed.coverage : baseline.coverage, marks14),
    }),
    tile({
      key: 'debt',
      label: 'Debito',
      tone: 'peach',
      note: 'Ultime 7 notti',
      value: debt.value === null ? null : formatHm(debt.value),
      hiddenText: hiddenTextOf(debt),
      coverage: coverageView(debt.coverage, marks7),
    }),
    tile({
      key: 'sleep24h',
      label: 'Sonno 24 ore',
      tone: 'yellow',
      note: napYesterday ? 'Ieri, con sonnellino' : 'Ieri, senza sonnellino',
      value: s24 === null ? null : formatHm(s24),
      hiddenText: 'La notte di ieri non ha una durata: il totale resta vuoto.',
      coverage: coverageView({ used: s24 === null ? 0 : 1, window: 1 }),
    }),
  ];

  // Confronto con il solito.
  const usual = durationStats(input.nights, addDays(today, -1)).avg7;
  const comparisonHidden = baseline.value === null;
  const rows: ComparisonRowView[] = [];
  if (baseline.value) {
    const b = baseline.value;
    const bedNow = night?.bedAt.value ?? null;
    rows.push({
      key: 'bed',
      label: 'Addormentamento',
      text: `${formatClock(bedNow)} · mediana ${formatAxisClock(b.bedMin)}`,
      nowPct: bedNow === null ? null : axisPct(bedAxisToAxis(bedAxisMinutes(bedNow))),
      usualPct: axisPct(bedAxisToAxis(b.bedMin)),
    });
    const durPct = (m: number | null) => (m === null ? null : round2(clamp((m / DURATION_SCALE_MIN) * 100, 5, 100)));
    rows.push({
      key: 'duration',
      label: 'Durata',
      text: `${formatHm(durationMin)} · media ${formatHm(usual.value)}`,
      nowPct: durPct(durationMin),
      usualPct: durPct(usual.value),
    });
    const sd = reg?.stdBed.value ?? null;
    const devPct = (m: number | null) =>
      m === null ? null : round2(clamp((Math.abs(m) / (TOLERANCE_MIN * 2)) * 100, 5, 100));
    rows.push({
      key: 'regularity',
      label: 'Regolarità',
      text: `scarto ${formatSignedMin(dev?.bedDev ?? null)} · mediana ${formatPlusMinus(sd)}`,
      nowPct: devPct(dev?.bedDev ?? null),
      usualPct: devPct(sd),
    });
  }

  // Domande rapide del giorno.
  const questions: QuickQuestionView[] = selectQuestions({
    today,
    nights: input.nights,
    eveningChecks: checks,
    asked: input.asked ?? [],
    napsRecentlyMissing: input.napsRecentlyMissing ?? false,
  }).map((q) => ({
    kind: q.kind,
    nightDate: q.nightDate ?? null,
    text: q.text,
    answers: answersFor(q.kind),
    skipLabel: 'Salta',
  }));

  // Chip eccezioni (scorciatoia).
  const stored = input.activeExceptions ?? [];
  const activeSet =
    stored.length > 0
      ? new Set(stored)
      : new Set(night && night.isException ? night.factors : []);
  const ordered = orderExceptionChips(input.exceptionTypes ?? [], DEFAULT_EXCEPTIONS);
  // Imprevisti scelti ma assenti dai tipi noti: chip in coda, etichetta ricavata dallo slug.
  const known = new Set(ordered.map((c) => c.slug));
  for (const slug of stored) {
    if (known.has(slug)) continue;
    known.add(slug);
    const s = slug.replace(/-/g, ' ');
    ordered.push({ slug, label: s.charAt(0).toUpperCase() + s.slice(1), uses: 0 });
  }
  const chips = ordered.map((c) => ({
    slug: c.slug,
    label: c.label,
    uses: c.uses,
    active: activeSet.has(c.slug),
  }));

  const timelineItems = buildTimeline(night, today, events, checks);
  const confirmed = status === 'confermata';

  return {
    empty: !hasAny,
    emptyText: hasAny ? null : NIGHT_EMPTY_TEXT,
    nightDate: today,
    label: 'Stanotte',
    dateLabel: formatLongDate(today),
    status,
    statusWord: nightStatusWord(status),
    durationMin,
    durationText: formatHm(durationMin),
    bed: night ? timeValue(night.bedAt) : missingTime(),
    wake: night ? timeValue(night.wakeAt) : missingTime(),
    rangeText: formatRange(night?.bedAt.value ?? null, night?.wakeAt.value ?? null),
    bar: night ? nightBar(night) : null,
    explanation: explainNight(night, events),
    confirmed,
    canConfirm: hasAny && !confirmed,
    confirmLabel: 'Conferma',
    editLabel: 'Correggi orari',
    confirmedText: 'Registrata. Grazie.',
    undoLabel: 'Annulla',
    energy: scoreValue(night?.energy),
    quality: scoreValue(night?.quality),
    regularity,
    timeline: {
      title: 'La notte, in ordine',
      items: timelineItems,
      emptyText: timelineItems.length === 0 ? TIMELINE_EMPTY_TEXT : null,
    },
    questions,
    exceptions: { chips, addLabel: '+ Aggiungi', note: 'Non conta nel riferimento della regolarità.' },
    comparison: {
      title: 'Rispetto al tuo solito',
      hidden: comparisonHidden,
      hiddenText: comparisonHidden ? hiddenTextOf(baseline) : null,
      rows,
    },
    stats,
  };
}
