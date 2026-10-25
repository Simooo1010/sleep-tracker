/**
 * View model della schermata Sera (check serale): passi del wizard (stanchezza, umore, fattori,
 * sonnellino di oggi) e riepilogo con `Vado a dormire`. Su PC gli stessi passi sono una sola scheda.
 * Spec: docs/design/system/Schermate.md §Sera, componenti WizardStep, MoonRating, Chip, ExceptionChips.
 * Funzione pura: `today` e i dati sono parametri. Nessuna risposta è obbligatoria.
 */
import { DEFAULT_EXCEPTIONS, DEFAULT_FACTORS, DEFAULT_LABELS, orderExceptionChips, type ChipType } from '../../domain/questions';
import { clockChangeShiftMin, clockChangeText } from '../../domain/clock-change';
import type { EveningCheck, Nap } from '../../domain/types';
import { DASH, formatClockMinutes, formatLongDate, formatMinutes, formatScore } from './format';
import { NAP_CHOICES } from './night';

export interface EveningViewInput {
  today: string;
  /** Check già salvato stasera (o bozza precompilata), null se assente. */
  check?: EveningCheck | null;
  /** Sonnellini registrati oggi dai comandi rapidi. */
  naps?: Nap[];
  exceptionTypes?: ChipType[];
  /** Eccezioni attive per stasera (slug). */
  activeExceptions?: string[];
  factorSlugs?: string[];
  factorLabels?: Record<string, string>;
  /** Orario della sveglia impostata, minuti dalla mezzanotte (es. 435 = 07:15), se noto. */
  alarmMin?: number | null;
  /** Notte che sta per iniziare ('YYYY-MM-DD' del risveglio): serve per avvisare del cambio d'ora. */
  tonightNightDate?: string;
}

export type EveningStepKey = 'tiredness' | 'mood' | 'factors' | 'nap';

export interface EveningOptionView {
  value: string;
  label: string;
  selected: boolean;
}

export interface EveningStepView {
  key: EveningStepKey;
  step: number;
  total: number;
  /** 'Check serale · domanda 2 di 4'. */
  kicker: string;
  question: string;
  control: 'moons' | 'chips' | 'multi-chips' | 'nap-chips';
  options: EveningOptionView[];
  /** Solo per il passo fattori: eccezioni a un tocco. */
  exceptions: EveningOptionView[];
  note: string | null;
  /** Avanzamento: true per i segmenti pieni. */
  progress: boolean[];
  primaryLabel: string;
  backLabel: string | null;
  isLast: boolean;
}

export interface EveningSummaryRowView {
  key: EveningStepKey;
  label: string;
  value: string;
}

export interface EveningView {
  empty: boolean;
  emptyText: string | null;
  date: string;
  dateLabel: string;
  /** Titolo della scheda su PC. */
  title: string;
  kicker: string;
  saved: boolean;
  /** Avviso se stanotte cambia l'ora, altrimenti null. */
  clockChangeNotice: string | null;
  steps: EveningStepView[];
  summary: {
    title: string;
    rows: EveningSummaryRowView[];
    sendLabel: string;
    savedText: string;
  };
}

export const MOODS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Pesante' },
  { value: 2, label: 'Così così' },
  { value: 3, label: 'Neutro' },
  { value: 4, label: 'Leggero' },
  { value: 5, label: 'Sereno' },
];

export const EVENING_EMPTY_TEXT = 'Nessun check per stasera. Bastano pochi tocchi, e ogni domanda si può saltare.';

function labelOf(slug: string, extra: Record<string, string> | undefined): string {
  return extra?.[slug] ?? DEFAULT_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function buildEveningView(input: EveningViewInput): EveningView {
  const { today } = input;
  const check = input.check ?? null;
  const factorSlugs = input.factorSlugs ?? [...DEFAULT_FACTORS];
  const active = new Set(input.activeExceptions ?? []);
  const selectedFactors = new Set(check?.factors ?? []);
  const tired = check?.tiredness.value ?? null;
  const mood = check?.mood.value ?? null;

  const napsToday = (input.naps ?? []).filter((p) => p.date === today && p.minutes > 0 && p.provenance !== 'mancante');
  const recordedNapMin = napsToday.reduce((a, p) => a + p.minutes, 0);
  const checkNap = check?.napMinutesToday.value ?? null;
  const napMin = checkNap ?? (recordedNapMin > 0 ? recordedNapMin : null);
  const napChoice =
    napMin === null
      ? null
      : NAP_CHOICES.reduce((best, c) => (Math.abs(c.minutes - napMin) < Math.abs(best.minutes - napMin) ? c : best));

  const total = 4;
  const mk = (
    key: EveningStepKey,
    step: number,
    question: string,
    control: EveningStepView['control'],
    options: EveningOptionView[],
    extra: { exceptions?: EveningOptionView[]; note?: string | null } = {},
  ): EveningStepView => ({
    key,
    step,
    total,
    kicker: `Check serale · domanda ${step} di ${total}`,
    question,
    control,
    options,
    exceptions: extra.exceptions ?? [],
    note: extra.note ?? null,
    progress: Array.from({ length: total }, (_, i) => i < step),
    primaryLabel: step === total ? 'Vado a dormire' : 'Avanti',
    backLabel: step === 1 ? null : 'Indietro',
    isLast: step === total,
  });

  const exceptionChips = orderExceptionChips(input.exceptionTypes ?? [], DEFAULT_EXCEPTIONS).map((c) => ({
    value: c.slug,
    label: c.label,
    selected: active.has(c.slug),
  }));

  const steps: EveningStepView[] = [
    mk(
      'tiredness',
      1,
      'Quanto sei stanco?',
      'moons',
      [1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: `Stanchezza ${v} di 5`, selected: tired === v })),
    ),
    mk(
      'mood',
      2,
      "Com'è il tuo umore?",
      'chips',
      MOODS.map((m) => ({ value: String(m.value), label: m.label, selected: mood === m.value })),
    ),
    mk(
      'factors',
      3,
      'Cosa è successo oggi?',
      'multi-chips',
      factorSlugs.map((s) => ({ value: s, label: labelOf(s, input.factorLabels), selected: selectedFactors.has(s) })),
      { exceptions: exceptionChips, note: 'Le eccezioni non contano nel riferimento della regolarità.' },
    ),
    mk(
      'nap',
      4,
      'Hai fatto un sonnellino?',
      'nap-chips',
      NAP_CHOICES.map((c) => ({ value: String(c.minutes), label: c.label, selected: napChoice?.minutes === c.minutes })),
      {
        note:
          recordedNapMin > 0
            ? `Registrato dal comando rapido: ${formatMinutes(recordedNapMin)}.`
            : 'Se hai usato il comando rapido, il sonnellino è già registrato.',
      },
    ),
  ];

  const factorsText = [...selectedFactors].map((s) => labelOf(s, input.factorLabels));
  const exceptionsText = exceptionChips.filter((c) => c.selected).map((c) => c.label);
  const factorsValue = [...factorsText, ...exceptionsText].join(', ');
  const rows: EveningSummaryRowView[] = [
    { key: 'tiredness', label: 'Stanchezza', value: formatScore(tired) },
    { key: 'mood', label: 'Umore', value: MOODS.find((m) => m.value === mood)?.label ?? DASH },
    { key: 'factors', label: 'Fattori', value: factorsValue || (check ? 'Nessuno' : DASH) },
    {
      key: 'nap',
      label: 'Sonnellino',
      value: napMin === null ? DASH : napMin === 0 ? 'Nessuno' : formatMinutes(napMin),
    },
  ];

  const alarm = input.alarmMin;
  const savedText =
    typeof alarm === 'number' && Number.isFinite(alarm)
      ? `Buonanotte. Check salvato. Riposo è attivo e la sveglia delle ${formatClockMinutes(alarm)} è impostata.`
      : 'Buonanotte. Check salvato. Riposo è attivo e la sveglia è impostata.';

  return {
    empty: check === null,
    emptyText: check === null ? EVENING_EMPTY_TEXT : null,
    date: today,
    dateLabel: formatLongDate(today),
    title: 'Come stai stasera?',
    kicker: 'Check serale',
    saved: check !== null,
    clockChangeNotice:
      input.tonightNightDate === undefined ? null : clockChangeText(clockChangeShiftMin(input.tonightNightDate), 'stasera'),
    steps,
    summary: { title: 'Riepilogo', rows, sendLabel: 'Vado a dormire', savedText },
  };
}
