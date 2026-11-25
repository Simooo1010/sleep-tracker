/**
 * View model della schermata «Modifica notte» (`/storico/[date]`, docs/NIGHT_EDIT.md).
 * Funzione pura: `today` e i dati sono parametri. Nessun campo è obbligatorio.
 */
import {
  DEFAULT_EXCEPTIONS,
  DEFAULT_FACTORS,
  DEFAULT_LABELS,
  orderExceptionChips,
  type ChipType,
} from '../../domain/questions';
import { nightDuration } from '../../domain/sleep-balance';
import { addDays, bedAxisMinutes, localParts, median, wakeAxisMinutes } from '../../domain/time';
import type { EveningCheck, Nap, Night } from '../../domain/types';
import type { NightEditOption, NightEditView } from '../night-edit-contract';
import {
  DASH,
  MONTHS_LONG,
  WEEKDAYS_LONG,
  formatAxisClock,
  formatClockMinutes,
  formatDayMonth,
  formatHm,
  formatLongDate,
  formatMinutes,
  nightStatusWord,
  provenanceWord,
  weekdayOf,
} from './format';

export interface NightEditViewInput {
  /** Data del risveglio 'YYYY-MM-DD'. */
  date: string;
  today: string;
  night: Night | null;
  /** Notti recenti (per la mediana dei suggeriti). */
  nights: Night[];
  naps: Nap[];
  /** Check della sera prima (data = date − 1). */
  eveningCheck: EveningCheck | null;
  exceptionTypes: ChipType[];
  /** Slug degli imprevisti della notte (da `listNightExceptions`); vuoto = vecchio schema. */
  activeExceptions: string[];
  factorLabels?: Record<string, string>;
}

export const SUGGEST_MIN_NIGHTS = 3;
export const DEFAULT_SUGGESTED_BED = '23:30';
export const DEFAULT_SUGGESTED_WAKE = '07:30';
const MIN_YEAR = 2000;

function labelOf(slug: string, extra: Record<string, string> | undefined): string {
  return extra?.[slug] ?? DEFAULT_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function clockOf(iso: string | null): string | null {
  if (iso === null || Number.isNaN(Date.parse(iso))) return null;
  return formatClockMinutes(localParts(iso).minutes);
}

/** 'Sera di venerdì 23 ottobre' per la sera che precede la notte `date`. */
function eveningLabelOf(date: string): string {
  const prev = addDays(date, -1);
  const d = Number(prev.slice(8, 10));
  const m = MONTHS_LONG[Number(prev.slice(5, 7)) - 1] ?? '';
  return `Sera di ${WEEKDAYS_LONG[weekdayOf(prev)] ?? ''} ${d} ${m}`.replace(/\s+/g, ' ').trim();
}

function suggested(nights: Night[], date: string): { bed: string; wake: string } {
  const withTimes = nights.filter(
    (n) => n.nightDate !== date && n.bedAt.value !== null && n.wakeAt.value !== null,
  );
  if (withTimes.length < SUGGEST_MIN_NIGHTS) return { bed: DEFAULT_SUGGESTED_BED, wake: DEFAULT_SUGGESTED_WAKE };
  const bed = median(withTimes.map((n) => bedAxisMinutes(n.bedAt.value as string)));
  const wake = median(withTimes.map((n) => wakeAxisMinutes(n.wakeAt.value as string)));
  return {
    bed: bed === null ? DEFAULT_SUGGESTED_BED : formatAxisClock(bed),
    wake: wake === null ? DEFAULT_SUGGESTED_WAKE : formatClockMinutes(wake),
  };
}

export function buildNightEditView(input: NightEditViewInput): NightEditView {
  const { date, today, night, eveningCheck } = input;
  const hasAnyTime = !!night && (night.bedAt.value !== null || night.wakeAt.value !== null);
  const status = night && hasAnyTime ? night.status : 'mancante';
  const sug = suggested(input.nights, date);

  // Imprevisti: stessa regola di views/night.ts (vecchio schema se l'elenco è vuoto).
  const stored = input.activeExceptions;
  const activeSet = new Set(stored.length > 0 ? stored : night && night.isException ? night.factors : []);
  const ordered = orderExceptionChips(input.exceptionTypes, DEFAULT_EXCEPTIONS);
  const known = new Set(ordered.map((c) => c.slug));
  for (const slug of activeSet) {
    if (known.has(slug)) continue;
    known.add(slug);
    ordered.push({ slug, label: labelOf(slug, input.factorLabels), uses: 0 });
  }
  const exceptions: NightEditOption[] = ordered.map((c) => ({
    slug: c.slug,
    label: c.label,
    selected: activeSet.has(c.slug),
  }));

  // Fattori della sera: predefiniti + personalizzati già selezionati.
  const selectedFactors = new Set(eveningCheck?.factors ?? []);
  const factorSlugs = [...DEFAULT_FACTORS];
  for (const slug of selectedFactors) if (!factorSlugs.includes(slug)) factorSlugs.push(slug);
  const factors: NightEditOption[] = factorSlugs.map((slug) => ({
    slug,
    label: labelOf(slug, input.factorLabels),
    selected: selectedFactors.has(slug),
  }));

  const napMin = input.naps
    .filter((p) => p.date === date && p.minutes > 0 && p.provenance !== 'mancante')
    .reduce((a, p) => a + p.minutes, 0);

  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const bedIso = night?.bedAt.value ?? null;
  const wakeIso = night?.wakeAt.value ?? null;

  return {
    date,
    title: `Notte del ${formatDayMonth(date)}`,
    dateLabel: formatLongDate(date),
    eveningLabel: eveningLabelOf(date),
    status,
    statusWord: nightStatusWord(status),
    bedTime: clockOf(bedIso),
    wakeTime: clockOf(wakeIso),
    bedProvenanceWord: provenanceWord(bedIso === null || !night ? 'mancante' : night.bedAt.provenance),
    wakeProvenanceWord: provenanceWord(wakeIso === null || !night ? 'mancante' : night.wakeAt.provenance),
    durationText: night ? formatHm(nightDuration(night)) : DASH,
    suggestedBedTime: sug.bed,
    suggestedWakeTime: sug.wake,
    quality: night?.quality.value ?? null,
    energy: night?.energy.value ?? null,
    exceptions,
    factors,
    tiredness: eveningCheck?.tiredness.value ?? null,
    mood: eveningCheck?.mood.value ?? null,
    dayNote: eveningCheck?.dayNote ?? '',
    napText: napMin > 0 ? `Sonnellino ${formatMinutes(napMin)}` : null,
    prevDate: Number(prev.slice(0, 4)) < MIN_YEAR ? null : prev,
    nextDate: next <= today ? next : null,
    backHref: `/storico?m=${date.slice(0, 7)}&d=${date}`,
  };
}
