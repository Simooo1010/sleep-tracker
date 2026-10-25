/**
 * View model della schermata Grafici: DurationChart (14 notti, obiettivo, debito), Heatmap per
 * giorno della settimana, CorrelationTable, trend mensile, previsione di energia di domani,
 * statistiche e lista dei sonnellini.
 * Spec: docs/design/system/Schermate.md §Grafici, Dati-e-calcoli.md §Durata/§Correlazioni/
 * §Sonnellini/§Previsioni. Funzione pura: `today` e i dati sono parametri.
 */
import { computeBaseline } from '../../domain/baseline';
import {
  CORRELATION_MIN_OCCURRENCES,
  computeCorrelations,
  type CorrelationOutcome,
  type CorrelationTone,
} from '../../domain/correlations';
import { energyLabel, forecastEnergy, weekdayHeatmap, type TonightInput } from '../../domain/forecast';
import { hasPlaceholderStart, napStats } from '../../domain/naps';
import { DEFAULT_FACTORS, DEFAULT_LABELS } from '../../domain/questions';
import {
  durationBand,
  durationStats,
  monthlyTrend,
  nightDuration,
  sleepDebt,
  type DurationBand,
} from '../../domain/sleep-balance';
import { clockChangeShiftMin } from '../../domain/clock-change';
import { addDays } from '../../domain/time';
import { DEFAULT_TARGET_SLEEP_MIN, type EveningCheck, type Nap, type Night, type NightStatus } from '../../domain/types';
import {
  DURATION_SCALE_MIN,
  clamp,
  clockChangeRangeNote,
  coverageMarks,
  coverageView,
  hiddenTextOf,
  nightsByDate,
  round2,
  statusOf,
  tile,
  type CoverageView,
  type StatTileView,
  type Tone,
} from './common';
import {
  DASH,
  WEEKDAYS_ROW,
  formatClock,
  formatDayMonth,
  formatDecimal,
  formatHm,
  formatHmCompact,
  formatMinutes,
  formatClockMinutes,
  formatMonthShort,
  formatShortDate,
  formatSignedDecimal,
  formatSignedMin,
  provenanceWord,
  weekdayOf,
} from './format';

export interface ChartsViewInput {
  today: string;
  nights: Night[];
  naps?: Nap[];
  eveningChecks?: EveningCheck[];
  /** Fattori della tabella (slug); default: i fattori predefiniti. */
  factorSlugs?: string[];
  /** Etichette dei fattori personalizzati. */
  factorLabels?: Record<string, string>;
  targetMin?: number;
  /** Ipotesi per stanotte; default: mediana del letto e durata media delle ultime 7 notti. */
  tonight?: TonightInput;
}

export interface DurationBarView {
  nightDate: string;
  dayLabel: string;
  heightPct: number;
  status: NightStatus;
  durationText: string;
  band: DurationBand | null;
  /** '24 ottobre · 7h 32m' oppure '24 ottobre · mancante'. */
  title: string;
  /** true se in quella notte è cambiata l'ora (la durata è comunque quella reale). */
  clockChange: boolean;
}

export interface ChartChipView {
  key: string;
  text: string;
  tone: Tone;
  hidden: boolean;
}

export interface DurationChartView {
  hidden: boolean;
  bars: DurationBarView[];
  targetPct: number;
  targetText: string;
  chips: ChartChipView[];
  debtHiddenText: string | null;
  /** Frase se nelle notti mostrate è cambiata l'ora, altrimenti null. */
  clockChangeNote: string | null;
  coverage: CoverageView;
}

export interface HeatCellView {
  nightDate: string | null;
  text: string;
  band: DurationBand | null;
  status: NightStatus | null;
}

export interface HeatRowView {
  weekday: number;
  dayLabel: string;
  avgText: string;
  band: DurationBand | null;
  nights: number;
  cells: HeatCellView[];
}

export interface HeatmapView {
  hidden: boolean;
  title: string;
  subtitle: string;
  rows: HeatRowView[];
  legend: string;
}

export interface CorrelationCellView {
  outcome: CorrelationOutcome;
  /** '+0,6', '−0,8' oppure '—'. */
  text: string;
  tone: CorrelationTone;
  hint: string;
}

export interface CorrelationRowView {
  factor: string;
  label: string;
  /** '9 notti su 23' oppure '3 notti, ne servono 5'. */
  countText: string;
  enough: boolean;
  cells: CorrelationCellView[];
}

export interface CorrelationTableView {
  hidden: boolean;
  hiddenText: string | null;
  columns: Array<{ outcome: CorrelationOutcome; label: string }>;
  rows: CorrelationRowView[];
  footnote: string;
  coverage: CoverageView;
}

export interface MonthBarView {
  month: string;
  label: string;
  valueText: string;
  heightPct: number;
  current: boolean;
  nights: number;
}

export interface MonthlyTrendView {
  hidden: boolean;
  title: string;
  bars: MonthBarView[];
}

export interface ForecastView {
  hidden: boolean;
  hiddenText: string | null;
  badge: string;
  kicker: string;
  /** 'Energia 4 su 5'. */
  scoreText: string;
  score: number | null;
  /** 1–5: luna da evidenziare. */
  moon: number | null;
  label: string | null;
  explanation: string | null;
  coverage: CoverageView;
}

export interface NapListItemView {
  date: string;
  dateLabel: string;
  rangeText: string;
  durationText: string;
  provenanceWord: string;
}

export interface NapsView {
  hidden: boolean;
  emptyText: string | null;
  tiles: StatTileView[];
  list: NapListItemView[];
}

export interface ChartsView {
  empty: boolean;
  emptyText: string | null;
  title: string;
  duration: DurationChartView;
  heatmap: HeatmapView;
  correlations: CorrelationTableView;
  monthly: MonthlyTrendView;
  forecast: ForecastView;
  naps: NapsView;
}

export const CHARTS_EMPTY_TEXT = 'I grafici compaiono dopo le prime notti registrate. Nessuna fretta.';
const OUTCOME_LABELS: Record<CorrelationOutcome, string> = { quality: 'Qualità', energy: 'Energia', mood: 'Umore' };

function factorLabel(slug: string, extra: Record<string, string> | undefined): string {
  return extra?.[slug] ?? DEFAULT_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function buildChartsView(input: ChartsViewInput): ChartsView {
  const { today, nights } = input;
  const naps = input.naps ?? [];
  const checks = input.eveningChecks ?? [];
  const target = input.targetMin ?? DEFAULT_TARGET_SLEEP_MIN;
  const byDate = nightsByDate(nights);

  // --- DurationChart ---
  const bars: DurationBarView[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = addDays(today, -i);
    const n = byDate.get(date);
    const min = n ? nightDuration(n) : null;
    const status = min === null ? 'mancante' : statusOf(n);
    bars.push({
      nightDate: date,
      dayLabel: String(Number(date.slice(8, 10))),
      heightPct: min === null ? 10 : round2(clamp((min / DURATION_SCALE_MIN) * 100, 8, 100)),
      status,
      durationText: formatHm(min),
      band: min === null ? null : durationBand(min),
      title: `${formatDayMonth(date)} · ${min === null ? 'mancante' : formatHm(min)}${clockChangeShiftMin(date) === 0 ? '' : " · cambio d'ora"}`,
      clockChange: clockChangeShiftMin(date) !== 0,
    });
  }
  const ds = durationStats(nights, today);
  const debt = sleepDebt(nights, today, target);
  const chips: ChartChipView[] = [
    { key: 'avg7', text: `Media 7 notti ${formatHm(ds.avg7.value)}`, tone: 'blue', hidden: ds.avg7.value === null },
    {
      key: 'avgMonth',
      text: `Media del mese ${formatHm(ds.avgMonth.value)}`,
      tone: 'blue',
      hidden: ds.avgMonth.value === null,
    },
    { key: 'debt', text: `Debito accumulato ${formatHm(debt.value)}`, tone: 'peach', hidden: debt.value === null },
    { key: 'target', text: `Obiettivo ${formatHm(target)}`, tone: 'sage', hidden: false },
  ];
  const durationHidden = bars.every((x) => x.band === null);

  // --- Heatmap (ultime 4 settimane) ---
  const heat = weekdayHeatmap(nights, today, 4);
  const perWeekday: HeatCellView[][] = Array.from({ length: 7 }, () => []);
  for (let i = 27; i >= 0; i--) {
    const date = addDays(today, -i);
    const n = byDate.get(date);
    const min = n ? nightDuration(n) : null;
    perWeekday[weekdayOf(date)]?.push({
      nightDate: date,
      text: min === null ? DASH : formatHmCompact(min),
      band: min === null ? null : durationBand(min),
      status: min === null ? 'mancante' : statusOf(n),
    });
  }
  const heatRows: HeatRowView[] = heat.map((c) => ({
    weekday: c.weekday,
    dayLabel: WEEKDAYS_ROW[c.weekday] ?? '',
    avgText: formatHmCompact(c.avgMin),
    band: c.band,
    nights: c.n,
    cells: perWeekday[c.weekday] ?? [],
  }));

  // --- Correlazioni ---
  const slugs = input.factorSlugs ?? [...DEFAULT_FACTORS];
  const corr = computeCorrelations(nights, checks, slugs);
  const corrRows: CorrelationRowView[] = [];
  if (corr.value) {
    for (const slug of new Set(slugs)) {
      const items = corr.value.filter((c) => c.factor === slug);
      const withN = Math.max(0, ...items.map((c) => c.withN));
      const enough = withN >= CORRELATION_MIN_OCCURRENCES;
      corrRows.push({
        factor: slug,
        label: factorLabel(slug, input.factorLabels),
        countText: enough
          ? `${withN} notti su ${corr.coverage.used}`
          : `${withN} ${withN === 1 ? 'notte' : 'notti'}, ne servono ${CORRELATION_MIN_OCCURRENCES}`,
        enough,
        cells: items.map((c) => ({
          outcome: c.outcome,
          text: c.diff === null ? DASH : formatSignedDecimal(c.diff),
          tone: c.tone,
          hint: c.hint,
        })),
      });
    }
  }

  // --- Trend mensile ---
  const trend = monthlyTrend(nights, today, 6);
  const vals = trend.map((t) => t.avgMin).filter((x): x is number => x !== null);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 0;
  const monthBars: MonthBarView[] = trend.map((t, i) => ({
    month: t.month,
    label: formatMonthShort(t.month),
    valueText: formatHmCompact(t.avgMin),
    heightPct: t.avgMin === null ? 0 : hi === lo ? 60 : round2(20 + ((t.avgMin - lo) / (hi - lo)) * 80),
    current: i === trend.length - 1,
    nights: t.n,
  }));

  // --- Previsione ---
  const baseline = computeBaseline(nights, addDays(today, 1));
  const tonight: TonightInput = input.tonight ?? {
    bedAxisMin: baseline.value?.bedMin ?? null,
    expectedDurationMin: ds.avg7.value,
    napToday: naps.some((p) => p.date === today && p.minutes > 0),
  };
  const fc = forecastEnergy(nights, tonight, today, naps);
  const forecast: ForecastView = fc.value
    ? {
        hidden: false,
        hiddenText: null,
        badge: 'Previsione',
        kicker: 'Domani mattina',
        scoreText: `Energia ${Math.round(fc.value.score)} su 5`,
        score: fc.value.score,
        moon: clamp(Math.round(fc.value.score), 1, 5),
        label: energyLabel(fc.value.score),
        explanation: `Nei tuoi giorni simili l'energia è stata in media ${formatDecimal(fc.value.score)} su 5 (${fc.value.label}). Stima su ${fc.value.basedOn} ${fc.value.basedOn === 1 ? 'notte' : 'notti'}.`,
        coverage: coverageView(fc.coverage),
      }
    : {
        hidden: true,
        hiddenText: hiddenTextOf(fc),
        badge: 'Previsione',
        kicker: 'Domani mattina',
        scoreText: `Energia ${DASH}`,
        score: null,
        moon: null,
        label: null,
        explanation: null,
        coverage: coverageView(fc.coverage),
      };

  // --- Sonnellini ---
  const ns = napStats(naps, nights, today);
  const freq = ns.frequency.value;
  const napTiles: StatTileView[] = [
    tile({
      key: 'frequency',
      label: 'Frequenza',
      tone: 'yellow',
      note: 'Giorni con sonnellino',
      value: freq ? `${freq.days} su ${freq.of}` : null,
      hiddenText: hiddenTextOf(ns.frequency),
      coverage: coverageView(ns.frequency.coverage, [], 'giorni'),
    }),
    tile({
      key: 'avgMinutes',
      label: 'Durata media',
      tone: 'yellow',
      note: 'Per sonnellino',
      value: ns.avgMinutes.value === null ? null : formatMinutes(ns.avgMinutes.value),
      hiddenText: hiddenTextOf(ns.avgMinutes),
      coverage: coverageView(ns.avgMinutes.coverage, [], 'giorni'),
    }),
    tile({
      key: 'typicalStart',
      label: 'Orario tipico',
      tone: 'blue',
      note: 'Inizio tipico',
      value: ns.typicalStartMin.value === null ? null : formatClockMinutes(ns.typicalStartMin.value),
      hiddenText: hiddenTextOf(ns.typicalStartMin),
      coverage: coverageView(ns.typicalStartMin.coverage, [], 'giorni'),
    }),
    tile({
      key: 'effectOnBedtime',
      label: 'Effetto sul letto',
      tone: 'peach',
      note:
        ns.effectOnEnergy.value === null
          ? 'Energia del giorno dopo: dati insufficienti'
          : `Energia ${formatSignedDecimal(ns.effectOnEnergy.value)} il giorno dopo`,
      value: ns.effectOnBedtime.value === null ? null : formatSignedMin(ns.effectOnBedtime.value),
      hiddenText: hiddenTextOf(ns.effectOnBedtime),
      coverage: coverageView(ns.effectOnBedtime.coverage),
    }),
  ];
  const windowStart = addDays(today, -13);
  const napList: NapListItemView[] = naps
    .filter((p) => p.date >= windowStart && p.date <= today && p.minutes > 0 && !Number.isNaN(Date.parse(p.startAt)))
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
    .slice(0, 5)
    .map((p) => {
      const placeholder = hasPlaceholderStart(p);
      const start = Date.parse(p.startAt);
      const endIso = new Date(start + p.minutes * 60000).toISOString();
      return {
        date: p.date,
        dateLabel: formatShortDate(p.date),
        rangeText: placeholder ? 'Orario non noto' : `${formatClock(p.startAt)}–${formatClock(endIso)}`,
        durationText: formatMinutes(p.minutes),
        provenanceWord: provenanceWord(p.provenance),
      };
    });

  const empty = durationHidden && vals.length === 0;

  return {
    empty,
    emptyText: empty ? CHARTS_EMPTY_TEXT : null,
    title: 'Grafici',
    duration: {
      hidden: durationHidden,
      bars,
      targetPct: round2((target / DURATION_SCALE_MIN) * 100),
      targetText: `Linea tratteggiata = obiettivo ${formatHm(target)}`,
      chips,
      debtHiddenText: hiddenTextOf(debt),
      clockChangeNote: clockChangeRangeNote(addDays(today, -13), today),
      coverage: coverageView(
        { used: bars.filter((x) => x.band !== null).length, window: 14 },
        coverageMarks(byDate, today, 14),
      ),
    },
    heatmap: {
      hidden: heat.every((c) => c.n === 0),
      title: 'Giorni della settimana',
      subtitle: 'Ultime 4 settimane',
      rows: heatRows,
      legend: 'Verde 8h+ · Azzurro 7–8h · Pesca meno di 7h · Tratteggio = stimata · Punti = mancante',
    },
    correlations: {
      hidden: corr.value === null,
      hiddenText: hiddenTextOf(corr),
      columns: (['quality', 'energy', 'mood'] as const).map((o) => ({ outcome: o, label: OUTCOME_LABELS[o] })),
      rows: corrRows,
      footnote: 'Sono indizi, non cause.',
      coverage: coverageView(corr.coverage),
    },
    monthly: { hidden: vals.length === 0, title: 'Trend mensile', bars: monthBars },
    forecast,
    naps: {
      hidden: napList.length === 0 && freq === null,
      emptyText: napList.length === 0 ? 'Nessun sonnellino negli ultimi 14 giorni.' : null,
      tiles: napTiles,
      list: napList,
    },
  };
}
