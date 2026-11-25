/**
 * View model della pagina /analisi: punteggio composto, scena, notti del periodo, indizi ("perché"),
 * azioni concrete, previsione di energia e copertura. Contratto: ./analysis-types.ts.
 *
 * Regole: numeri solo dai moduli del dominio (nessuna statistica nuova); sotto soglia la sezione
 * resta nascosta con la frase "Servono almeno N notti. Per ora ne hai M."; testi calmi, mai
 * rimproveri, mai causalità ("indizio", "tende a"). Funzione pura: `today` e i dati sono parametri.
 * Periodo = ultime `period` notti fino a `today` incluso (data notte = giorno del risveglio).
 */
import { computeBaseline } from '../../domain/baseline';
import { clockChangeShiftMin } from '../../domain/clock-change';
import {
  CORRELATION_TONE_THRESHOLD,
  computeCorrelations,
  type Correlation,
  type CorrelationOutcome,
} from '../../domain/correlations';
import { REGULARITY_MIN_NIGHTS, nightDeviation } from '../../domain/deviations';
import { computeDrift } from '../../domain/drift';
import { forecastEnergy, type TonightInput } from '../../domain/forecast';
import { napStats } from '../../domain/naps';
import { DEFAULT_FACTORS, DEFAULT_LABELS } from '../../domain/questions';
import { SLEEP_DEBT_WINDOW, durationStats, nightDuration, sleepDebt } from '../../domain/sleep-balance';
import { computeSocialJetlag } from '../../domain/social-jetlag';
import { addDays, bedAxisMinutes, hasTimes, wakeAxisMinutes } from '../../domain/time';
import {
  DEFAULT_TARGET_SLEEP_MIN,
  TOLERANCE_MIN,
  type EveningCheck,
  type Nap,
  type Night,
  type NightStatus,
} from '../../domain/types';
import type {
  ActionView,
  AnalysisPeriod,
  AnalysisView,
  CauseView,
  ForecastView,
  NightPoint,
  NightsView,
  SceneKey,
  SceneView,
  ScorePart,
  ScoreView,
} from './analysis-types';
import { clockChangeRangeNote, coverageMarks, coverageView, hiddenTextOf, nightsByDate, type Tone } from './common';
import {
  DASH,
  WEEKDAYS_SHORT,
  formatAxisClock,
  formatClock,
  formatClockMinutes,
  formatDayMonth,
  formatDecimal,
  formatHm,
  formatLongDate,
  formatMinutes,
  formatSignedDecimal,
  formatSignedMin,
  nightStatusWord,
  weekdayOf,
} from './format';

export interface AnalysisViewInput {
  today: string;
  nights: Night[];
  naps: Nap[];
  eveningChecks: EveningCheck[];
  targetMin?: number;
  period: AnalysisPeriod;
}

/** Pesi delle tre parti del punteggio (ricalcolati sulle parti disponibili). */
export const SCORE_WEIGHTS: Readonly<Record<ScorePart['id'], number>> = { durata: 40, regolarita: 35, debito: 25 };
/** Fasce del punteggio: ≥ 75 sage, 50–74 blue, < 50 peach. */
export const SCORE_SAGE_MIN = 75;
export const SCORE_BLUE_MIN = 50;
/** Parti minime disponibili perché il punteggio sia mostrato. */
export const SCORE_MIN_PARTS = 2;
/** Notti con dati sotto cui la scena è 'pochi-dati'. */
export const SCENE_MIN_NIGHTS = 3;
/** Debito (min, 7 notti) oltre cui la scena è 'debito'. */
export const SCENE_DEBT_MIN = 120;
/** Social jet lag (min) da cui diventa un indizio. */
export const SJL_CAUSE_MIN = 60;
/** Al massimo 3 indizi dalle correlazioni; gli altri indizi (ritmo, sonnellini, cambio d'ora) si aggiungono. */
export const MAX_CORRELATION_CAUSES = 3;
export const MAX_ACTIONS = 3;

export const ANALYSIS_EMPTY_TEXT_PREFIX = 'Nessuna notte registrata';

const IMPACT_LABELS: Record<ActionView['impact'], string> = {
  1: 'Impatto piccolo',
  2: 'Impatto medio',
  3: 'Impatto alto',
};

const OUTCOME_TEXT: Record<CorrelationOutcome, { short: string; subject: string; high: string; low: string }> = {
  quality: { short: 'qualità', subject: 'la qualità percepita', high: 'più alta', low: 'più bassa' },
  energy: { short: 'energia', subject: "l'energia al mattino", high: 'più alta', low: 'più bassa' },
  mood: { short: 'umore', subject: "l'umore", high: 'più alto', low: 'più basso' },
};

const notti = (n: number): string => (n === 1 ? '1 notte' : `${n} notti`);
const round5 = (x: number): number => Math.round(x / 5) * 5;
const clampInt = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(x)));

/** Stessa frase delle soglie del dominio: 'Servono almeno N notti. Per ora ne hai M.' */
function thresholdSentence(required: number, have: number): string {
  const head = required === 1 ? 'Serve almeno 1 notte.' : `Servono almeno ${required} notti.`;
  return `${head} Per ora ne hai ${have}.`;
}

function factorLabel(slug: string): string {
  return DEFAULT_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function shortDayLabel(date: string): string {
  return `${WEEKDAYS_SHORT[weekdayOf(date)] ?? ''} ${Number(date.slice(8, 10))}`.trim();
}

function scoreBand(value: number): { word: string; tone: Tone } {
  if (value >= SCORE_SAGE_MIN) return { word: 'Buona', tone: 'sage' };
  if (value >= SCORE_BLUE_MIN) return { word: 'Discreta', tone: 'blue' };
  return { word: 'Da sistemare', tone: 'peach' };
}

interface Ranked<T> {
  item: T;
  rel: number;
}

function byRelevance<T>(xs: Ranked<T>[]): T[] {
  return xs
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.rel - a.rel || a.i - b.i)
    .map((x) => x.item);
}

export function buildAnalysisView(input: AnalysisViewInput): AnalysisView {
  const { today, period } = input;
  const target =
    typeof input.targetMin === 'number' && Number.isFinite(input.targetMin) && input.targetMin > 0
      ? input.targetMin
      : DEFAULT_TARGET_SLEEP_MIN;
  const nights = input.nights.filter((n) => n.nightDate <= today);
  const naps = input.naps.filter((p) => p.date <= today);
  const checks = input.eveningChecks.filter((c) => c.date < today);
  const byDate = nightsByDate(nights);

  const start = addDays(today, -(period - 1));
  const dates: string[] = [];
  for (let i = period - 1; i >= 0; i--) dates.push(addDays(today, -i));

  const baseline = computeBaseline(nights, today);
  const b = baseline.value;

  // --- Notti del periodo ---
  const points: NightPoint[] = [];
  const durations: number[] = [];
  let usable = 0;
  let regular = 0;
  let checked = 0;
  let outliers = 0;
  for (const date of dates) {
    const n = byDate.get(date);
    const min = n ? nightDuration(n) : null;
    if (min !== null) durations.push(min);
    const bed = n?.bedAt.value ?? null;
    const wake = n?.wakeAt.value ?? null;
    const status: NightStatus = n && (bed !== null || wake !== null) ? n.status : 'mancante';
    const exception = n?.isException ?? false;
    const dev = n && b && status !== 'mancante' ? nightDeviation(n, b) : null;
    const outlier = !exception && dev !== null && (dev.bedOk === false || dev.wakeOk === false);
    if (dev && !exception && (dev.bedOk !== null || dev.wakeOk !== null)) {
      checked++;
      if (outlier) outliers++;
    }
    if (n && b && !exception && status !== 'mancante' && hasTimes(n)) {
      usable++;
      if (nightDeviation(n, b).regular === true) regular++;
    }
    const clockChange = clockChangeShiftMin(date) !== 0;

    let summary: string;
    if (status === 'mancante') {
      summary = `${formatLongDate(date)}: notte mancante.`;
    } else {
      const bits: string[] = [min === null ? 'durata non disponibile' : formatHm(min)];
      if (bed !== null) bits.push(`letto ${formatClock(bed)}`);
      if (wake !== null) bits.push(`sveglia ${formatClock(wake)}`);
      summary = `${formatLongDate(date)}: ${bits.join(', ')}. ${nightStatusWord(status)}.`;
      if (exception) summary += ' Giorno-eccezione, escluso dal riferimento.';
      else if (outlier) summary += " Fuori dall'orario abituale.";
      else if (dev && (dev.bedOk !== null || dev.wakeOk !== null)) summary += " Nell'orario abituale.";
      if (clockChange) summary += " Cambio d'ora: la durata è quella reale.";
    }

    points.push({
      nightDate: date,
      label: shortDayLabel(date),
      durationMin: min,
      bedAxisMin: bed === null ? null : bedAxisMinutes(bed),
      wakeMin: wake === null ? null : wakeAxisMinutes(wake),
      status,
      outlier,
      exception,
      summary,
    });
  }
  const withData = durations.length;
  const avgMin = withData > 0 ? Math.round(durations.reduce((a, x) => a + x, 0) / withData) : null;
  const marks = coverageMarks(byDate, today, period);
  const coverage = coverageView({ used: withData, window: period }, marks);
  const clockNote = clockChangeRangeNote(start, today);
  const clockDates = dates.filter((d) => clockChangeShiftMin(d) !== 0);

  let caption: string;
  if (withData === 0) caption = `Nessuna notte con dati negli ultimi ${period} giorni.`;
  else if (!b) caption = `${notti(withData)} con dati su ${period}. Riferimento degli orari: ${hiddenTextOf(baseline) ?? ''}`.trim();
  else if (checked === 0) caption = `${notti(withData)} con dati su ${period}.`;
  else if (outliers === 0) caption = `Nessuna notte fuori dall'orario abituale su ${checked}.`;
  else caption = `${outliers} ${outliers === 1 ? 'notte' : 'notti'} su ${checked} fuori dall'orario abituale (± ${TOLERANCE_MIN} min).`;
  if (clockNote) caption += " Nel periodo è cambiata l'ora: le durate sono reali.";

  const nightsView: NightsView = {
    hidden: withData === 0,
    hiddenText: withData === 0 ? thresholdSentence(1, 0) : '',
    points,
    targetMin: target,
    avgMin,
    avgLabel: avgMin === null ? `Media ${DASH}` : `Media ${formatHm(avgMin)}`,
    caption,
    coverage,
  };

  // --- Punteggio ---
  const debt = sleepDebt(nights, today, target);
  const debtMin = debt.value;
  const regHiddenText = !b ? (hiddenTextOf(baseline) ?? '') : thresholdSentence(REGULARITY_MIN_NIGHTS, usable);
  const regOk = b !== null && usable >= REGULARITY_MIN_NIGHTS;
  const regPct = regOk ? Math.round((regular / usable) * 100) : null;

  const parts: ScorePart[] = [
    {
      id: 'durata',
      label: 'Durata',
      pct: avgMin === null ? null : clampInt((avgMin / target) * 100, 0, 100),
      note:
        avgMin === null
          ? thresholdSentence(1, 0)
          : `${formatHm(avgMin)} di media su ${notti(withData)}, obiettivo ${formatHm(target)}`,
    },
    {
      id: 'regolarita',
      label: 'Regolarità',
      pct: regPct,
      note: regOk ? `${regular} notti su ${usable} entro ± ${TOLERANCE_MIN} min dagli orari abituali` : regHiddenText,
    },
    {
      id: 'debito',
      label: 'Debito',
      pct: debtMin === null ? null : clampInt((1 - debtMin / target) * 100, 0, 100),
      note:
        debtMin === null
          ? (hiddenTextOf(debt) ?? '')
          : debtMin === 0
            ? `Nessun debito nelle ultime ${SLEEP_DEBT_WINDOW} notti`
            : `${formatHm(debtMin)} sotto l'obiettivo nelle ultime ${SLEEP_DEBT_WINDOW} notti`,
    },
  ];
  const available = parts.filter((p) => p.pct !== null);
  let scoreView: ScoreView;
  if (available.length >= SCORE_MIN_PARTS) {
    const wSum = available.reduce((a, p) => a + SCORE_WEIGHTS[p.id], 0);
    const value = Math.round(available.reduce((a, p) => a + SCORE_WEIGHTS[p.id] * (p.pct as number), 0) / wSum);
    const band = scoreBand(value);
    scoreView = { value, word: band.word, tone: band.tone, hidden: false, hiddenText: '', parts };
  } else {
    const firstHidden = parts.find((p) => p.pct === null && p.id !== 'durata') ?? parts.find((p) => p.pct === null);
    scoreView = {
      value: null,
      word: 'In attesa di dati',
      tone: 'blue',
      hidden: true,
      hiddenText: firstHidden ? firstHidden.note : thresholdSentence(1, 0),
      parts,
    };
  }

  // --- Scena ---
  const drift = computeDrift(nights, today);
  const dv = drift.value;
  const driftMedians = dv ? dv.weeklyMedians.map((w) => w.bedMin).filter((x): x is number => x !== null) : [];
  const driftFirst = driftMedians[0] ?? null;
  const driftLast = driftMedians[driftMedians.length - 1] ?? null;
  const prevDebt = sleepDebt(nights, addDays(today, -1), target).value;
  const lastNight = byDate.get(today);
  const lastMin = lastNight ? nightDuration(lastNight) : null;
  const debtFalling = debtMin !== null && prevDebt !== null && debtMin < prevDebt;
  const lastOnTarget = lastMin !== null && lastMin >= target;

  let sceneKey: SceneKey;
  if (scoreView.hidden || withData < SCENE_MIN_NIGHTS) sceneKey = 'pochi-dati';
  else if (debtMin !== null && debtMin > SCENE_DEBT_MIN) sceneKey = 'debito';
  else if (dv?.exceeds) sceneKey = 'deriva';
  else if (debtMin !== null && debtMin > 0 && (debtFalling || lastOnTarget)) sceneKey = 'recupero';
  else sceneKey = 'regolare';

  const debtText = formatHm(debtMin);
  const driftRange =
    driftFirst !== null && driftLast !== null ? `da ${formatAxisClock(driftFirst)} a ${formatAxisClock(driftLast)}` : '';
  const SCENES: Record<SceneKey, { label: string; headline: string; summary: string }> = {
    'pochi-dati': {
      label: 'Illustrazione: una luna sottile con poche stelle. I dati sono ancora pochi per un quadro completo.',
      headline: 'Ancora pochi dati',
      summary: `Per ora ci sono ${notti(withData)} con dati su ${period}. L'analisi diventa più precisa con qualche notte in più.`,
    },
    debito: {
      label: `Illustrazione: una luna calante dietro una nuvola. Nelle ultime ${SLEEP_DEBT_WINDOW} notti mancano ${debtText} rispetto all'obiettivo.`,
      headline: "Un po' di sonno da recuperare",
      summary: `Nelle ultime ${SLEEP_DEBT_WINDOW} notti mancano ${debtText} rispetto all'obiettivo di ${formatHm(target)}.`,
    },
    deriva: {
      label: `Illustrazione: una luna che scivola lungo il cielo. L'orario di letto si è spostato di ${dv?.badge ?? DASH}.`,
      headline: "L'orario di letto si sta spostando",
      summary: driftRange
        ? `La mediana dell'orario di letto è passata ${driftRange} (${dv?.badge ?? DASH}).`
        : `La mediana dell'orario di letto si è spostata di ${dv?.badge ?? DASH}.`,
    },
    recupero: {
      label: 'Illustrazione: una luna che torna a crescere. Il debito di sonno si sta riducendo.',
      headline: 'Stai recuperando',
      summary: lastOnTarget
        ? `L'ultima notte ha raggiunto l'obiettivo di ${formatHm(target)}. Restano ${debtText} di debito nelle ultime ${SLEEP_DEBT_WINDOW} notti.`
        : `Il debito delle ultime ${SLEEP_DEBT_WINDOW} notti è sceso a ${debtText}.`,
    },
    regolare: {
      label: 'Illustrazione: una luna piena in un cielo calmo. Orari e durata sono stabili.',
      headline: 'Un sonno regolare',
      summary:
        `Nelle ultime ${period} notti hai dormito in media ${formatHm(avgMin)}` +
        (regOk ? `, con ${regular} notti su ${usable} negli orari abituali.` : '.'),
    },
  };
  const scene: SceneView = { key: sceneKey, label: SCENES[sceneKey].label };

  // --- Indizi ---
  const causes: Ranked<CauseView>[] = [];
  const corr = computeCorrelations(nights, checks, [...DEFAULT_FACTORS]);
  if (corr.value) {
    const strong = corr.value
      .filter((c): c is Correlation & { diff: number } => c.diff !== null && c.tone !== 'neutral')
      .map((c, i) => ({ c, i }))
      .sort((x, y) => Math.abs(y.c.diff) - Math.abs(x.c.diff) || x.i - y.i);
    const seen = new Set<string>();
    for (const { c } of strong) {
      if (seen.size >= MAX_CORRELATION_CAUSES) break;
      if (seen.has(c.factor)) continue;
      seen.add(c.factor);
      const o = OUTCOME_TEXT[c.outcome];
      const label = factorLabel(c.factor);
      causes.push({
        rel: Math.abs(c.diff) / CORRELATION_TONE_THRESHOLD,
        item: {
          id: `fattore-${c.factor}-${c.outcome}`,
          title: `${label} e ${o.short}`,
          body: `${c.outcome === 'mood' ? 'Nelle sere' : 'Nelle notti'} con «${label.toLowerCase()}» ${o.subject} tende a essere ${c.diff > 0 ? o.high : o.low}. È un indizio, non una causa.`,
          evidence: `${formatSignedDecimal(c.diff)} su 5 · ${notti(c.withN)} con, ${c.withoutN} senza`,
          tone: c.tone === 'sage' ? 'sage' : 'peach',
        },
      });
    }
  }

  const sjl = computeSocialJetlag(nights, today);
  const sv = sjl.value;
  const sjlAbs = sv ? Math.abs(sv.sjlMin) : 0;
  if (sv && sjlAbs >= SJL_CAUSE_MIN) {
    const later = sv.sjlMin > 0;
    causes.push({
      rel: sjlAbs / SJL_CAUSE_MIN,
      item: {
        id: 'social-jet-lag',
        title: later ? 'Weekend spostato più tardi' : 'Weekend spostato più presto',
        body: `Nel weekend il punto medio del sonno tende a cadere ${formatMinutes(sjlAbs)} più ${later ? 'tardi' : 'presto'} che nei giorni feriali. È un indizio di orari diversi tra settimana e weekend.`,
        evidence: `Punto medio feriali ${formatAxisClock(sv.weekdayMidMin)}, weekend ${formatAxisClock(sv.weekendMidMin)} · social jet lag ${formatSignedMin(sv.sjlMin)} · ${notti(sjl.coverage.used)}`,
        tone: 'peach',
      },
    });
  }

  if (dv?.exceeds) {
    causes.push({
      rel: Math.abs(dv.shiftMin) / TOLERANCE_MIN,
      item: {
        id: 'deriva',
        title: "L'orario di letto si sta spostando",
        body: `Nelle ultime settimane la mediana dell'orario di letto tende a spostarsi più ${dv.shiftMin > 0 ? 'tardi' : 'presto'}, oltre la tolleranza di ± ${TOLERANCE_MIN} min.`,
        evidence: driftRange ? `${dv.badge} · ${driftRange}` : dv.badge,
        tone: 'peach',
      },
    });
  }

  const ns = napStats(naps, nights, today);
  const bedEff = ns.effectOnBedtime.value;
  const enEff = ns.effectOnEnergy.value;
  const bedEffShown = bedEff !== null && Math.abs(bedEff) >= TOLERANCE_MIN;
  const enEffShown = enEff !== null && Math.abs(enEff) >= CORRELATION_TONE_THRESHOLD;
  if (bedEffShown || enEffShown) {
    const body: string[] = [];
    const evidence: string[] = [];
    if (bedEffShown && bedEff !== null) {
      body.push(
        `Dopo i giorni con sonnellino tendi ad andare a letto ${formatMinutes(Math.abs(bedEff))} più ${bedEff > 0 ? 'tardi' : 'presto'}.`,
      );
    }
    if (enEffShown && enEff !== null) {
      body.push(
        `L'energia del giorno dopo tende a essere ${enEff > 0 ? 'più alta' : 'più bassa'} di ${formatDecimal(Math.abs(enEff))} punti.`,
      );
    }
    if (bedEff !== null) evidence.push(`Letto ${formatSignedMin(bedEff)}`);
    if (enEff !== null) evidence.push(`energia ${formatSignedDecimal(enEff)}`);
    evidence.push(notti(ns.effectOnBedtime.coverage.used));
    const tone: Tone = bedEffShown && bedEff !== null && bedEff > 0 ? 'peach' : enEff !== null && enEff > 0 ? 'sage' : 'peach';
    causes.push({
      rel: Math.max(bedEff === null ? 0 : Math.abs(bedEff) / TOLERANCE_MIN, enEff === null ? 0 : Math.abs(enEff) / CORRELATION_TONE_THRESHOLD),
      item: {
        id: 'sonnellini',
        title: 'Sonnellini e sera',
        body: `${body.join(' ')} È un indizio, non una causa.`,
        evidence: evidence.join(' · '),
        tone,
      },
    });
  }

  if (clockNote) {
    causes.push({
      rel: 1,
      item: {
        id: 'cambio-ora',
        title: "Cambio d'ora nel periodo",
        body: clockNote,
        evidence: clockDates
          .map((d) => {
            const s = clockChangeShiftMin(d);
            const h = Math.abs(s) / 60;
            return `${formatDayMonth(d)}: ${s > 0 ? '+' : '−'}${h === 1 ? '1 ora' : `${h} ore`}`;
          })
          .join(' · '),
        tone: 'blue',
      },
    });
  }

  const causeItems = byRelevance(causes);
  const causesView: AnalysisView['causes'] = {
    hidden: causeItems.length === 0,
    hiddenText:
      causeItems.length > 0
        ? ''
        : corr.value === null
          ? (hiddenTextOf(corr) ?? '')
          : 'Nel periodo non emergono indizi marcati: i dati non mostrano schemi evidenti.',
    items: causeItems,
  };

  // --- Azioni ---
  const actions: ActionView[] = [];
  const shortfall = debtMin !== null && debt.coverage.used > 0 ? debtMin / debt.coverage.used : 0;
  const advDebt = Math.min(TOLERANCE_MIN, round5(shortfall));
  const advDrift = dv?.exceeds && dv.shiftMin > 0 ? Math.min(TOLERANCE_MIN, round5(dv.shiftMin / 2)) : 0;
  const advance = Math.max(advDebt, advDrift);
  if (advance >= 5) {
    const why: string[] = [];
    if (advDebt > 0 && debtMin !== null) {
      why.push(
        `Nelle ultime ${SLEEP_DEBT_WINDOW} notti mancano ${formatHm(debtMin)} rispetto all'obiettivo, circa ${formatMinutes(shortfall)} a notte.`,
      );
    }
    if (advDrift > 0 && dv) why.push(`L'orario di letto si è spostato di ${dv.badge}.`);
    if (b) why.push(`Vuol dire andare a letto verso le ${formatAxisClock(b.bedMin - advance)} invece delle ${formatAxisClock(b.bedMin)}.`);
    actions.push({
      id: 'anticipa-letto',
      title: `Anticipa il letto di ${advance} min`,
      why: why.join(' '),
      expected:
        advDebt > 0 && debtMin !== null
          ? `Con la sveglia invariata, in ${SLEEP_DEBT_WINDOW} notti il debito potrebbe scendere di circa ${formatHm(Math.min(debtMin, advance * SLEEP_DEBT_WINDOW))}.`
          : "Potrebbe riportare l'orario di letto vicino a quello di qualche settimana fa.",
      impact: (debtMin !== null && debtMin > SCENE_DEBT_MIN) || dv?.exceeds ? 3 : 2,
      impactLabel: '',
    });
  }

  if (sv && sjlAbs >= SJL_CAUSE_MIN) {
    const step = round5(sjlAbs / 2);
    actions.push({
      id: 'weekend',
      title: `Avvicina gli orari del weekend di ${step} min`,
      why: `Nel weekend il punto medio del sonno cade ${formatMinutes(sjlAbs)} più ${sv.sjlMin > 0 ? 'tardi' : 'presto'} che nei feriali (letto feriali ${formatAxisClock(sv.weekdayBedMin)}, weekend ${formatAxisClock(sv.weekendBedMin)}).`,
      expected: `Lo scarto tra weekend e feriali potrebbe scendere verso ${formatMinutes(sjlAbs - step)}.`,
      impact: sjlAbs >= 2 * SJL_CAUSE_MIN ? 3 : 2,
      impactLabel: '',
    });
  }

  const avgNap = ns.avgMinutes.value;
  if (bedEff !== null && bedEff >= TOLERANCE_MIN && avgNap !== null) {
    const cap = round5(avgNap / 2);
    if (cap >= 5 && cap < avgNap) {
      const napStart = ns.typicalStartMin.value;
      actions.push({
        id: 'sonnellino-breve',
        title: `Sonnellino entro ${cap} min`,
        why:
          `Dopo i giorni con sonnellino tendi ad andare a letto ${formatMinutes(bedEff)} più tardi. I tuoi sonnellini durano in media ${formatMinutes(avgNap)}` +
          (napStart !== null ? ` e iniziano verso le ${formatClockMinutes(napStart)}.` : '.'),
        expected: "Un sonnellino più breve potrebbe avvicinare l'orario di letto a quello abituale.",
        impact: bedEff >= 2 * TOLERANCE_MIN ? 2 : 1,
        impactLabel: '',
      });
    }
  }

  if (b && regOk && regPct !== null && regular < usable) {
    actions.push({
      id: 'sveglia-fissa',
      title: `Sveglia costante alle ${formatClockMinutes(b.wakeMin)}`,
      why: `${usable - regular} notti su ${usable} fuori da ± ${TOLERANCE_MIN} min dagli orari abituali. ${formatClockMinutes(b.wakeMin)} è la tua sveglia mediana delle ultime 2 settimane.`,
      expected: 'Con una sveglia costante la quota di notti regolari potrebbe salire.',
      impact: regPct < SCORE_BLUE_MIN ? 2 : 1,
      impactLabel: '',
    });
  }

  const actionItems: ActionView[] = actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => y.a.impact - x.a.impact || x.i - y.i)
    .slice(0, MAX_ACTIONS)
    .map(({ a }) => ({ ...a, impactLabel: IMPACT_LABELS[a.impact] }));

  // --- Previsione ---
  const tomorrowBase = computeBaseline(nights, addDays(today, 1)).value;
  const tonight: TonightInput = {
    bedAxisMin: tomorrowBase?.bedMin ?? null,
    expectedDurationMin: durationStats(nights, today).avg7.value,
    napToday: naps.some((p) => p.date === today && p.minutes > 0),
  };
  const fc = forecastEnergy(nights, tonight, today, naps);
  const forecast: ForecastView = fc.value
    ? {
        hidden: false,
        hiddenText: '',
        score: fc.value.score,
        label: `Energia di domani: ${fc.value.label} (${formatDecimal(fc.value.score)} su 5)`,
        explanation:
          `Stima su ${notti(fc.value.basedOn)} simili` +
          (tonight.bedAxisMin !== null ? `, con il letto verso le ${formatAxisClock(tonight.bedAxisMin)}` : '') +
          '. È una stima, non una certezza.',
      }
    : {
        hidden: true,
        hiddenText: hiddenTextOf(fc) ?? '',
        score: null,
        label: 'Energia di domani',
        explanation: '',
      };

  const empty = withData === 0;
  const emptyText = empty
    ? `${ANALYSIS_EMPTY_TEXT_PREFIX} negli ultimi ${period} giorni. L'analisi compare dalla prima notte, nessuna fretta.`
    : '';

  return {
    period,
    empty,
    emptyText,
    headline: empty ? 'Analisi del sonno' : SCENES[sceneKey].headline,
    summary: empty ? emptyText : SCENES[sceneKey].summary,
    scene,
    score: scoreView,
    nights: nightsView,
    causes: causesView,
    actions: actionItems,
    forecast,
    coverage,
  };
}
