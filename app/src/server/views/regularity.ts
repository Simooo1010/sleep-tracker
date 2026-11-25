/**
 * View model della schermata Regolarità: riferimento (mediana a 14 giorni), barre delle ultime
 * 14 notti + stanotte con scarti OK/Fuori, cinque StatTile, deriva, feriali contro weekend.
 * Spec: docs/design/system/Schermate.md §Regolarità, Dati-e-calcoli.md §Regolarità,
 * componenti NightBars, DriftChart, StatTile, Coverage.
 * Funzione pura: `today` e i dati sono parametri.
 */
import { computeBaseline } from '../../domain/baseline';
import { nightDeviation, regularityStats } from '../../domain/deviations';
import { computeDrift } from '../../domain/drift';
import { computeSocialJetlag } from '../../domain/social-jetlag';
import { nightDuration } from '../../domain/sleep-balance';
import { addDays } from '../../domain/time';
import { BASELINE_WINDOW_DAYS, TOLERANCE_MIN, type Night, type NightStatus } from '../../domain/types';
import {
  axisPct,
  bedAxisToAxis,
  clockChangeRangeNote,
  coverageMarks,
  coverageView,
  hiddenTextOf,
  nightBar,
  nightsByDate,
  round2,
  statusOf,
  tile,
  wakeMinToAxis,
  type BarView,
  type CoverageView,
  type StatTileView,
} from './common';
import {
  DASH,
  formatAxisClock,
  formatClockMinutes,
  formatDayInitial,
  formatHm,
  formatPlusMinus,
  formatSignedMin,
  formatSignedNumber,
  nightStatusWord,
} from './format';

export interface RegularityViewInput {
  today: string;
  nights: Night[];
}

export type ToleranceState = 'ok' | 'fuori' | 'eccezione' | 'mancante';

export interface RegularityRowView {
  nightDate: string;
  /** 'S 24', oppure 'Oggi' per stanotte. */
  dayLabel: string;
  isToday: boolean;
  status: NightStatus;
  statusWord: string;
  isException: boolean;
  bar: BarView | null;
  durationText: string;
  bedDevText: string;
  wakeDevText: string;
  /** '+8 / −12' (letto / sveglia) oppure '—'. */
  devText: string;
  tolerance: ToleranceState;
  /** 'OK', 'Fuori', 'Eccezione', '—'. */
  toleranceWord: string;
}

export interface ToleranceBandsView {
  bedLeftPct: number;
  bedWidthPct: number;
  bedMedianPct: number;
  bedMedianText: string;
  wakeLeftPct: number;
  wakeWidthPct: number;
  wakeMedianPct: number;
  wakeMedianText: string;
}

export interface AxisTickView {
  label: string;
  pct: number;
}

export interface DriftBarView {
  label: string;
  valueText: string;
  heightPct: number;
  current: boolean;
  nights: number;
}

export interface DriftView {
  hidden: boolean;
  hiddenText: string | null;
  badge: string | null;
  exceeds: boolean;
  bars: DriftBarView[];
  text: string | null;
  coverage: CoverageView;
}

export interface WeekCompareRowView {
  key: 'bed' | 'wake' | 'midpoint';
  label: string;
  weekdayText: string;
  weekendText: string;
  deltaText: string;
  weekdayPct: number;
  weekendPct: number;
}

export interface WeekWeekendView {
  hidden: boolean;
  hiddenText: string | null;
  title: string;
  rows: WeekCompareRowView[];
  sjlText: string | null;
  note: string;
  coverage: CoverageView;
}

export interface RegularityView {
  empty: boolean;
  emptyText: string | null;
  title: string;
  headline: {
    hidden: boolean;
    hiddenText: string | null;
    /** '9 su 12'. */
    big: string;
    sub: string;
    excludedText: string | null;
    driftChip: string | null;
    coverage: CoverageView;
  };
  baseline: {
    hidden: boolean;
    hiddenText: string | null;
    bedText: string;
    wakeText: string;
    coverage: CoverageView;
  };
  rows: RegularityRowView[];
  /** Frase se nelle notti mostrate è cambiata l'ora, altrimenti null. */
  clockChangeNote: string | null;
  bands: ToleranceBandsView | null;
  ticks: AxisTickView[];
  legend: string;
  tiles: StatTileView[];
  drift: DriftView;
  weekWeekend: WeekWeekendView;
}

export const REGULARITY_EMPTY_TEXT = 'Ancora nessuna notte con orari. Le barre compaiono dalla prima notte registrata.';

const TICKS: AxisTickView[] = [
  ['21', 0],
  ['00', 180],
  ['03', 360],
  ['06', 540],
  ['09', 720],
].map(([label, x]) => ({ label: label as string, pct: axisPct(x as number) }));

const DRIFT_LABELS = ['5 sett. fa', '4', '3', '2', '1', 'Ora'];

function eccezioni(n: number): string {
  return n === 1 ? '1 eccezione esclusa' : `${n} eccezioni escluse`;
}

export function buildRegularityView(input: RegularityViewInput): RegularityView {
  const { today, nights } = input;
  const byDate = nightsByDate(nights);
  const baseline = computeBaseline(nights, today);
  const b = baseline.value;

  // Righe: 14 notti prima di stanotte, poi "Oggi".
  const rows: RegularityRowView[] = [];
  for (let i = BASELINE_WINDOW_DAYS; i >= 0; i--) {
    const date = addDays(today, -i);
    const n = byDate.get(date);
    const status = statusOf(n);
    const dev = n && b ? nightDeviation(n, b) : null;
    let tolerance: ToleranceState = 'mancante';
    if (n?.isException) tolerance = 'eccezione';
    else if (dev && dev.regular !== null) tolerance = dev.regular ? 'ok' : 'fuori';
    const words: Record<ToleranceState, string> = { ok: 'OK', fuori: 'Fuori', eccezione: 'Eccezione', mancante: DASH };
    const bedDev = dev?.bedDev ?? null;
    const wakeDev = dev?.wakeDev ?? null;
    rows.push({
      nightDate: date,
      dayLabel: i === 0 ? 'Oggi' : formatDayInitial(date),
      isToday: i === 0,
      status,
      statusWord: nightStatusWord(status),
      isException: n?.isException ?? false,
      bar: n ? nightBar(n) : null,
      durationText: formatHm(n ? nightDuration(n) : null),
      bedDevText: formatSignedMin(bedDev),
      wakeDevText: formatSignedMin(wakeDev),
      devText: bedDev === null && wakeDev === null ? DASH : `${formatSignedNumber(bedDev)} / ${formatSignedNumber(wakeDev)}`,
      tolerance,
      toleranceWord: words[tolerance],
    });
  }

  const bands: ToleranceBandsView | null = b
    ? (() => {
        const bedPos = bedAxisToAxis(b.bedMin);
        const wakePos = wakeMinToAxis(b.wakeMin);
        const bedLeft = axisPct(bedPos - TOLERANCE_MIN);
        const wakeLeft = axisPct(wakePos - TOLERANCE_MIN);
        return {
          bedLeftPct: bedLeft,
          bedWidthPct: round2(axisPct(bedPos + TOLERANCE_MIN) - bedLeft),
          bedMedianPct: axisPct(bedPos),
          bedMedianText: formatAxisClock(b.bedMin),
          wakeLeftPct: wakeLeft,
          wakeWidthPct: round2(axisPct(wakePos + TOLERANCE_MIN) - wakeLeft),
          wakeMedianPct: axisPct(wakePos),
          wakeMedianText: formatClockMinutes(b.wakeMin),
        };
      })()
    : null;

  // Statistiche (finestra di 14 notti che termina stanotte).
  const marks = coverageMarks(byDate, today, BASELINE_WINDOW_DAYS);
  const reg = b ? regularityStats(nights, b, today) : null;
  const regCoverage = coverageView(reg ? reg.withinTolerance.coverage : baseline.coverage, marks);
  const regHidden = reg ? hiddenTextOf(reg.withinTolerance) : hiddenTextOf(baseline);
  const sjl = computeSocialJetlag(nights, today);
  const sjlHidden = hiddenTextOf(sjl);

  const tiles: StatTileView[] = [
    tile({
      key: 'stdBed',
      label: 'Scarto letto',
      tone: 'blue',
      note: 'Deviazione standard, 14 notti',
      value: reg && reg.stdBed.value !== null ? formatPlusMinus(reg.stdBed.value) : null,
      hiddenText: regHidden,
      coverage: regCoverage,
    }),
    tile({
      key: 'stdWake',
      label: 'Scarto sveglia',
      tone: 'blue',
      note: 'Deviazione standard, 14 notti',
      value: reg && reg.stdWake.value !== null ? formatPlusMinus(reg.stdWake.value) : null,
      hiddenText: regHidden,
      coverage: regCoverage,
    }),
    tile({
      key: 'withinTolerance',
      label: 'Nella tolleranza',
      tone: 'sage',
      note: `Letto e sveglia entro ± ${TOLERANCE_MIN} min`,
      value: reg && reg.withinTolerance.value ? `${reg.withinTolerance.value.count} su ${reg.withinTolerance.value.of}` : null,
      hiddenText: regHidden,
      coverage: regCoverage,
    }),
    tile({
      key: 'midpoint',
      label: 'Punto medio',
      tone: 'blue',
      note: 'Metà del sonno',
      value: reg && reg.midpoint.value !== null ? formatAxisClock(reg.midpoint.value) : null,
      hiddenText: regHidden,
      coverage: regCoverage,
    }),
    tile({
      key: 'socialJetlag',
      label: 'Social jet lag',
      tone: 'peach',
      note: 'Weekend rispetto ai feriali',
      value: sjl.value ? formatSignedMin(sjl.value.sjlMin) : null,
      hiddenText: sjlHidden,
      coverage: coverageView(sjl.coverage),
    }),
  ];

  // Deriva.
  const drift = computeDrift(nights, today);
  let driftView: DriftView;
  if (drift.value) {
    const weeks = drift.value.weeklyMedians;
    const valid = weeks.map((w) => w.bedMin).filter((x): x is number => x !== null);
    const lo = Math.min(...valid);
    const hi = Math.max(...valid);
    const first = valid[0] as number;
    const last = valid[valid.length - 1] as number;
    const exceeds = drift.value.exceeds;
    const text =
      drift.value.shiftMin === 0
        ? `La mediana del tuo orario di letto è rimasta alle ${formatAxisClock(last)}.`
        : `La mediana del tuo orario di letto si è spostata da ${formatAxisClock(first)} a ${formatAxisClock(last)}.` +
          (exceeds ? ` È oltre la tolleranza di ± ${TOLERANCE_MIN} min.` : '');
    driftView = {
      hidden: false,
      hiddenText: null,
      badge: drift.value.badge,
      exceeds,
      bars: weeks.map((w, i) => ({
        label: DRIFT_LABELS[i] ?? '',
        valueText: formatAxisClock(w.bedMin),
        heightPct: w.bedMin === null ? 0 : hi === lo ? 60 : round2(20 + ((w.bedMin - lo) / (hi - lo)) * 80),
        current: i === weeks.length - 1,
        nights: w.n,
      })),
      text,
      coverage: coverageView(drift.coverage),
    };
  } else {
    driftView = {
      hidden: true,
      hiddenText: hiddenTextOf(drift),
      badge: null,
      exceeds: false,
      bars: [],
      text: null,
      coverage: coverageView(drift.coverage),
    };
  }

  // Feriali contro weekend.
  const wkRows: WeekCompareRowView[] = sjl.value
    ? [
        {
          key: 'bed',
          label: 'Letto',
          weekdayText: formatAxisClock(sjl.value.weekdayBedMin),
          weekendText: formatAxisClock(sjl.value.weekendBedMin),
          deltaText: formatSignedMin(sjl.value.weekendBedMin - sjl.value.weekdayBedMin),
          weekdayPct: axisPct(bedAxisToAxis(sjl.value.weekdayBedMin)),
          weekendPct: axisPct(bedAxisToAxis(sjl.value.weekendBedMin)),
        },
        {
          key: 'wake',
          label: 'Sveglia',
          weekdayText: formatClockMinutes(sjl.value.weekdayWakeMin),
          weekendText: formatClockMinutes(sjl.value.weekendWakeMin),
          deltaText: formatSignedMin(sjl.value.weekendWakeMin - sjl.value.weekdayWakeMin),
          weekdayPct: axisPct(wakeMinToAxis(sjl.value.weekdayWakeMin)),
          weekendPct: axisPct(wakeMinToAxis(sjl.value.weekendWakeMin)),
        },
        {
          key: 'midpoint',
          label: 'Punto medio',
          weekdayText: formatAxisClock(sjl.value.weekdayMidMin),
          weekendText: formatAxisClock(sjl.value.weekendMidMin),
          deltaText: formatSignedMin(sjl.value.sjlMin),
          weekdayPct: axisPct(bedAxisToAxis(sjl.value.weekdayMidMin)),
          weekendPct: axisPct(bedAxisToAxis(sjl.value.weekendMidMin)),
        },
      ]
    : [];

  let exceptionsInWindow = 0;
  for (let i = 0; i < BASELINE_WINDOW_DAYS; i++) {
    if (byDate.get(addDays(today, -i))?.isException) exceptionsInWindow++;
  }
  const tol = reg?.withinTolerance.value ?? null;
  const empty = rows.every((r) => r.bar === null);

  return {
    empty,
    emptyText: empty ? REGULARITY_EMPTY_TEXT : null,
    title: 'Regolarità',
    headline: {
      hidden: tol === null,
      hiddenText: tol === null ? regHidden : null,
      big: tol ? `${tol.count} su ${tol.of}` : DASH,
      sub: `notti con letto e sveglia entro ± ${TOLERANCE_MIN} minuti dalla tua mediana.`,
      excludedText: exceptionsInWindow > 0 ? eccezioni(exceptionsInWindow) : null,
      driftChip: driftView.badge ? `Deriva ${driftView.badge}` : null,
      coverage: regCoverage,
    },
    baseline: {
      hidden: b === null,
      hiddenText: hiddenTextOf(baseline),
      bedText: b ? formatAxisClock(b.bedMin) : DASH,
      wakeText: b ? formatClockMinutes(b.wakeMin) : DASH,
      coverage: coverageView(baseline.coverage, coverageMarks(byDate, addDays(today, -1), BASELINE_WINDOW_DAYS)),
    },
    rows,
    clockChangeNote: clockChangeRangeNote(addDays(today, -BASELINE_WINDOW_DAYS), today),
    bands,
    ticks: TICKS,
    legend: 'Fascia salvia = mediana ± 30 min · Barra piena = confermata · Tratteggio = stimata · Punti = mancante',
    tiles,
    drift: driftView,
    weekWeekend: {
      hidden: sjl.value === null,
      hiddenText: sjlHidden,
      title: 'Feriali e weekend',
      rows: wkRows,
      sjlText: sjl.value ? `Social jet lag ${formatSignedMin(sjl.value.sjlMin)}` : null,
      note: 'Weekend = notti di venerdì e sabato.',
      coverage: coverageView(sjl.coverage),
    },
  };
}
