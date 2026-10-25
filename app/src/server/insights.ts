/**
 * Insight testuali della pagina Grafici.
 *
 * 1. `buildInsightsPayload` riduce le ultime 30 notti a statistiche aggregate (contratto
 *    `POST /v1/insights` del gateway, docs/AI_GATEWAY.md §6): numeri, quote, orari 'HH:MM' senza data,
 *    slug brevi. Mai date, timestamp, id o nomi (docs/AI_GATEWAY.md §8).
 *    UNICA eccezione, per decisione esplicita dell'utente (piano "imprevisti liberi"): `dayContext`,
 *    al massimo 10 giornate "particolari" con testo breve (≤ 140 caratteri) SANITIZZATO lato app
 *    (`sanitizeDayText`: via email, telefoni, URL, date, UUID), con "giorni fa" invece di date e senza
 *    mai la chiave `note`. Il gateway lo tratta come dato non fidato. Non esiste (ancora) un'impostazione
 *    di consenso dedicata: il contesto viene SEMPRE inviato quando c'è; se verrà aggiunta, basta non
 *    passare `dayContextSource` a `buildInsightsPayload`.
 * 2. `loadInsights` chiama il gateway (solo lato server). Qualsiasi problema (env mancanti, rete,
 *    timeout, 401, 429, 5xx, JSON non valido) → in silenzio `rulesInsights` calcolati in locale.
 *    Il bearer e il corpo della richiesta non vengono mai loggati né restituiti.
 * 3. `rulesInsights` produce insight in italiano, tono calmo, dando del tu, senza linguaggio causale.
 *
 * I calcoli stanno nel dominio (`src/domain`): qui si assemblano soltanto.
 */
import { z } from 'zod';

import { computeBaseline } from '@/domain/baseline';
import { computeCorrelations, OUTCOMES } from '@/domain/correlations';
import { nightDeviation, regularityStats } from '@/domain/deviations';
import { computeDrift } from '@/domain/drift';
import { hasPlaceholderStart } from '@/domain/naps';
import { durationStats, nightDuration, sleepDebt } from '@/domain/sleep-balance';
import { computeSocialJetlag, formatDuration } from '@/domain/social-jetlag';
import { addDays, hasTimes, isWeekendNight, median } from '@/domain/time';
import { DAY_CONTEXT_MAX_DAYS, DAY_CONTEXT_TEXT_MAX } from '@/domain/questions';
import { BASELINE_WINDOW_DAYS, DEFAULT_TARGET_SLEEP_MIN, TOLERANCE_MIN } from '@/domain/types';
import type { EveningCheck, Nap, Night } from '@/domain/types';
import { todayInRome } from '@/lib/clock';
import type { Repo } from '@/server/types';
import { formatAxisClock, formatClockMinutes } from '@/server/views/format';

// ---------------------------------------------------------------------------
// Tipi pubblici
// ---------------------------------------------------------------------------

export interface InsightItem {
  title: string;
  body: string;
}

export interface InsightsResult {
  source: 'ai' | 'rules';
  /** ISO dell'istante di calcolo. */
  updatedAt: string;
  items: InsightItem[];
  /** Notti con dati nella finestra di 30 giorni. */
  nightsUsed: number;
}

/** Corpo di `POST /v1/insights` (schema `insightStatsSchema` del gateway, campi sconosciuti rifiutati). */
export interface GatewayInsightsRequest {
  windowDays: number;
  nights: { inWindow: number; withData: number; confirmed?: number; estimated?: number; exceptions?: number };
  targetSleepMinutes?: number;
  duration?: { nights: number; medianMinutes: number; mean7Minutes?: number; mean30Minutes?: number };
  debt?: { nights: number; minutes: number };
  regularity?: {
    nights: number;
    toleranceMinutes: number;
    bedtimeMedian: string;
    wakeMedian: string;
    bedtimeWithinShare: number;
    wakeWithinShare: number;
    bedtimeMadMinutes?: number;
    wakeMadMinutes?: number;
  };
  drift?: { nights: number; overDays: number; bedtimeShiftMinutes: number; wakeShiftMinutes: number };
  weekdayWeekend?: {
    weekdayNights: number;
    weekendNights: number;
    weekdayMidpoint: string;
    weekendMidpoint: string;
    socialJetLagMinutes: number;
    weekdayMedianDurationMinutes?: number;
    weekendMedianDurationMinutes?: number;
  };
  naps?: { days: number; count: number; medianMinutes?: number };
  correlations?: Array<{ factor: string; target: 'quality' | 'energy' | 'mood' | 'duration'; r: number; n: number }>;
  /** Giornate particolari recenti (più recente per prima, max 10). Assente se non ce ne sono. */
  dayContext?: DayContextEntry[];
}

/** Una giornata particolare: "giorni fa" (0 = oggi), slug degli imprevisti e testo breve sanitizzato. */
export interface DayContextEntry {
  daysAgo: number;
  factors: string[];
  text: string;
}

/** Fonti (già lette dal repo) da cui costruire `dayContext`. */
export interface DayContextSource {
  /** Slug degli imprevisti per notte (`Repo.listNightExceptions`), chiave = nightDate. */
  nightExceptions?: Record<string, string[]>;
  /** Etichette degli imprevisti per slug (da `Repo.listExceptionTypes`). */
  exceptionLabels?: Record<string, string>;
}

/** Finestra degli insight: ultimi 30 giorni (la notte di oggi inclusa). */
export const INSIGHTS_WINDOW_DAYS = 30;
/** Timeout della chiamata al gateway. */
export const GATEWAY_TIMEOUT_MS = 6000;
/** Massimo di insight mostrati. */
export const MAX_INSIGHTS = 5;

// Soglie dei dati (come docs/AI_GATEWAY.md §6): sotto soglia la sezione non produce insight.
const MIN_DURATION_NIGHTS = 5;
const MIN_DEBT_NIGHTS = 5;
const MIN_REGULARITY_NIGHTS = 7;
const MIN_DRIFT_NIGHTS = 14;
const MIN_DRIFT_DAYS = 14;
const MIN_WEEKDAY_NIGHTS = 4;
const MIN_WEEKEND_NIGHTS = 2;
const MIN_NAP_DAYS = 7;
const MIN_NAP_COUNT = 3;
const MIN_CORRELATION_NIGHTS = 14;
const MIN_CORRELATION_ABS_R = 0.3;
const LOW_COVERAGE_SHARE = 0.6;
const FACTOR_SLUG_RE = /^[a-z0-9_-]{1,40}$/i;
const MAX_DAY_FACTORS = 5;

// ---------------------------------------------------------------------------
// Payload (solo statistiche aggregate)
// ---------------------------------------------------------------------------

const round = (x: number): number => Math.round(x);
const round2 = (x: number): number => Math.round(x * 100) / 100;

type TimedNight = Night & { bedAt: { value: string }; wakeAt: { value: string } };

function windowNights(nights: Night[], today: string): Night[] {
  const from = addDays(today, -(INSIGHTS_WINDOW_DAYS - 1));
  const byDate = new Map<string, Night>();
  for (const n of nights) {
    if (n.nightDate < from || n.nightDate > today) continue;
    byDate.set(n.nightDate, n);
  }
  return [...byDate.values()].sort((a, b) => a.nightDate.localeCompare(b.nightDate));
}

/** Coefficiente di correlazione (punto-biserial) tra un flag 0/1 e un voto; null se non definito. */
function correlationR(flags: number[], values: number[]): number | null {
  const n = flags.length;
  if (n < 3) return null;
  const mf = flags.reduce((a, b) => a + b, 0) / n;
  const mv = values.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vf = 0;
  let vv = 0;
  for (let i = 0; i < n; i++) {
    const df = (flags[i] as number) - mf;
    const dv = (values[i] as number) - mv;
    cov += df * dv;
    vf += df * df;
    vv += dv * dv;
  }
  if (vf === 0 || vv === 0) return null;
  const r = cov / Math.sqrt(vf * vv);
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null;
}

function buildCorrelations(
  nights: Night[],
  checks: EveningCheck[],
): NonNullable<GatewayInsightsRequest['correlations']> {
  const slugs = [...new Set(nights.flatMap((n) => n.factors))].filter((s) => FACTOR_SLUG_RE.test(s));
  if (slugs.length === 0) return [];
  const domain = computeCorrelations(nights, checks, slugs).value;
  if (domain === null) return []; // meno di 14 notti con voti: nessuna correlazione

  const moodByEvening = new Map<string, number | null>();
  for (const c of checks) moodByEvening.set(c.date, c.mood.value);
  const votes = (n: Night, target: 'quality' | 'energy' | 'mood' | 'duration'): number | null => {
    if (target === 'quality') return n.quality.value;
    if (target === 'energy') return n.energy.value;
    if (target === 'mood') return moodByEvening.get(addDays(n.nightDate, -1)) ?? null;
    return nightDuration(n);
  };

  const out: NonNullable<GatewayInsightsRequest['correlations']> = [];
  const targets = [...OUTCOMES, 'duration'] as const;
  for (const factor of slugs) {
    for (const target of targets) {
      // Eleggibilità per i voti: stessa regola del dominio (>= 5 occorrenze e notti senza il fattore).
      if (target !== 'duration') {
        const entry = domain.find((c) => c.factor === factor && c.outcome === target);
        if (!entry || entry.diff === null) continue;
      }
      const flags: number[] = [];
      const values: number[] = [];
      for (const n of nights) {
        const v = votes(n, target);
        if (v === null) continue;
        flags.push(n.factors.includes(factor) ? 1 : 0);
        values.push(v);
      }
      const withN = flags.reduce((a, b) => a + b, 0);
      if (withN < 5 || withN === flags.length) continue;
      const r = correlationR(flags, values);
      if (r === null) continue;
      out.push({ factor, target, r: round2(r), n: flags.length });
    }
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 20);
}

// ---------------------------------------------------------------------------
// Contesto delle giornate particolari (testo libero sanitizzato)
// ---------------------------------------------------------------------------

/**
 * Stesse redazioni di `redactText` del gateway (gateway/src/privacy.ts) più gli URL; qui però si
 * RIMUOVE (niente segnaposto), così nel testo inviato non resta traccia del dato.
 */
const DAY_TEXT_REDACTIONS: RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, // email
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, // UUID
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, // data/timestamp ISO
  /\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/g, // gg/mm/aaaa
  /\b(?:https?:\/\/|www\.)\S+/gi, // URL
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|it|org|net|io|app|dev|eu|me|co|info|ly)\b(?:\/\S*)?/gi, // domini nudi
  /(?<![\w.])(?:\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}|3\d{2}[\s-]?\d{6,7}|0\d{1,3}[\s-]?\d{6,8})(?![\w.])/g, // telefono
];

/**
 * Testo libero → testo da inviare all'AI: toglie email, telefoni, URL, date ISO/gg/mm/aaaa e UUID,
 * rimuove i caratteri di controllo, collassa gli spazi, fa il trim e tronca a `DAY_CONTEXT_TEXT_MAX`
 * caratteri (per code point). Il contenuto resta testo: nessuna interpretazione (anche "ignora le
 * istruzioni" passa come parole qualunque; il gateway lo tratta comunque come dato non fidato).
 * Ritorna '' se non resta nulla.
 */
export function sanitizeDayText(raw: string): string {
  let out = raw;
  for (const re of DAY_TEXT_REDACTIONS) out = out.replace(re, ' ');
  out = out
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(out).slice(0, DAY_CONTEXT_TEXT_MAX).join('').trimEnd();
}

/** Giorni di calendario tra due 'YYYY-MM-DD' (a - b). */
function dayDiff(a: string, b: string): number {
  const t = (d: string): number => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((t(a) - t(b)) / 86_400_000);
}

/**
 * Giornate particolari delle ultime 30 (la giornata è quella che PRECEDE la notte: sera D ↔ notte D+1):
 * descrizione libera del check serale e/o imprevisti della notte. Più recenti per prime, max 10.
 * Voci senza testo dopo la sanitizzazione scartate.
 */
function buildDayContext(checks: EveningCheck[], today: string, source: DayContextSource): DayContextEntry[] {
  const from = addDays(today, -(INSIGHTS_WINDOW_DAYS - 1));
  const byDay = new Map<string, { note: string; slugs: Set<string> }>();
  const slot = (day: string): { note: string; slugs: Set<string> } => {
    let e = byDay.get(day);
    if (!e) {
      e = { note: '', slugs: new Set() };
      byDay.set(day, e);
    }
    return e;
  };

  for (const c of checks) {
    if (c.date < from || c.date > today || typeof c.dayNote !== 'string') continue;
    const note = sanitizeDayText(c.dayNote);
    if (note) slot(c.date).note = note;
  }
  for (const [nightDate, slugs] of Object.entries(source.nightExceptions ?? {})) {
    const day = addDays(nightDate, -1);
    if (day < from || day > today) continue;
    for (const s of slugs) if (typeof s === 'string' && s.length > 0) slot(day).slugs.add(s);
  }

  const labels = source.exceptionLabels ?? {};
  const out: Array<DayContextEntry & { day: string }> = [];
  for (const [day, { note, slugs }] of byDay) {
    const list = [...slugs].sort();
    const labelText = sanitizeDayText(list.map((s) => sanitizeDayText(labels[s] ?? humanFactor(s))).filter(Boolean).join(', '));
    const text = note || labelText;
    if (!text) continue;
    out.push({
      day,
      daysAgo: Math.max(0, dayDiff(today, day)),
      factors: list.filter((s) => FACTOR_SLUG_RE.test(s)).slice(0, MAX_DAY_FACTORS),
      text,
    });
  }
  return out
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, DAY_CONTEXT_MAX_DAYS)
    .map(({ daysAgo, factors, text }) => ({ daysAgo, factors, text }));
}

/**
 * Riduce notti, sonnellini e check serali a statistiche aggregate per il gateway.
 * Funzione pura. Nessuna data, nessun timestamp, nessun id: solo numeri, quote, orari 'HH:MM' e slug.
 * `targetMin` (opzionale) è l'obiettivo di sonno personale in minuti.
 * `dayContextSource` (opzionale): imprevisti per notte + etichette; con le `dayNote` dei check serali
 * produce `dayContext` (sanitizzato, max 10). Senza nulla da dire il campo è omesso.
 */
export function buildInsightsPayload(
  nights: Night[],
  naps: Nap[],
  checks: EveningCheck[],
  today: string,
  targetMin: number = DEFAULT_TARGET_SLEEP_MIN,
  dayContextSource: DayContextSource = {},
): GatewayInsightsRequest {
  const inWindow = windowNights(nights, today);
  const target = Math.max(240, Math.min(720, round(Number.isFinite(targetMin) ? targetMin : DEFAULT_TARGET_SLEEP_MIN)));
  const withData = inWindow.filter((n) => n.status !== 'mancante' && hasTimes(n));

  const payload: GatewayInsightsRequest = {
    windowDays: INSIGHTS_WINDOW_DAYS,
    nights: {
      inWindow: INSIGHTS_WINDOW_DAYS,
      withData: withData.length,
      confirmed: withData.filter((n) => n.status === 'confermata').length,
      estimated: withData.filter((n) => n.status === 'stimata').length,
      exceptions: inWindow.filter((n) => n.isException).length,
    },
    targetSleepMinutes: target,
  };

  // Durata.
  const durations = withData.map(nightDuration).filter((d): d is number => d !== null);
  const med = median(durations);
  if (med !== null) {
    const stats = durationStats(inWindow, today);
    payload.duration = {
      nights: durations.length,
      medianMinutes: round(med),
      ...(stats.avg7.value !== null ? { mean7Minutes: stats.avg7.value } : {}),
      ...(stats.avgMonth.value !== null ? { mean30Minutes: stats.avgMonth.value } : {}),
    };
  }

  // Debito (ultimi 7 giorni).
  const debt = sleepDebt(inWindow, today, target);
  if (debt.value !== null) payload.debt = { nights: debt.coverage.used, minutes: round(debt.value) };

  // Regolarità (mediana a 14 giorni, tolleranza standard).
  const baseline = computeBaseline(inWindow, today).value;
  if (baseline !== null) {
    const stats = regularityStats(inWindow, baseline, today);
    if (stats.withinTolerance.value !== null) {
      const from = addDays(today, -(BASELINE_WINDOW_DAYS - 1));
      const usable = inWindow.filter(
        (n): n is TimedNight => n.nightDate >= from && !n.isException && n.status !== 'mancante' && hasTimes(n),
      );
      const devs = usable.map((n) => nightDeviation(n, baseline));
      const share = (pick: (d: (typeof devs)[number]) => boolean | null): number =>
        devs.length === 0 ? 0 : round2(devs.filter((d) => pick(d) === true).length / devs.length);
      const mad = (pick: (d: (typeof devs)[number]) => number | null): number | null => {
        const m = median(devs.map(pick).filter((x): x is number => x !== null).map(Math.abs));
        return m === null ? null : round(m);
      };
      const bedMad = mad((d) => d.bedDev);
      const wakeMad = mad((d) => d.wakeDev);
      payload.regularity = {
        nights: stats.withinTolerance.coverage.used,
        toleranceMinutes: TOLERANCE_MIN,
        bedtimeMedian: formatAxisClock(baseline.bedMin),
        wakeMedian: formatClockMinutes(baseline.wakeMin),
        bedtimeWithinShare: share((d) => d.bedOk),
        wakeWithinShare: share((d) => d.wakeOk),
        ...(bedMad !== null ? { bedtimeMadMinutes: bedMad } : {}),
        ...(wakeMad !== null ? { wakeMadMinutes: wakeMad } : {}),
      };
    }
  }

  // Deriva: letto dal dominio; sveglia con lo stesso calcolo applicato all'orario di risveglio
  // (la deriva è una differenza di mediane, quindi indipendente dall'origine dell'asse).
  const bedDriftStat = computeDrift(inWindow, today);
  const bedDrift = bedDriftStat.value;
  if (bedDrift !== null) {
    const asWake = inWindow.map((n): Night => ({ ...n, bedAt: n.wakeAt }));
    const wakeDrift = computeDrift(asWake, today);
    if (wakeDrift.value !== null) {
      payload.drift = {
        nights: bedDriftStat.coverage.used,
        overDays: Math.max(1, bedDrift.weeks * 7),
        bedtimeShiftMinutes: bedDrift.shiftMin,
        wakeShiftMinutes: wakeDrift.value.shiftMin,
      };
    }
  }

  // Feriali contro weekend (notti di venerdì e sabato = weekend).
  const sjl = computeSocialJetlag(inWindow, today);
  if (sjl.value !== null) {
    const from = addDays(today, -27);
    const wd: number[] = [];
    const we: number[] = [];
    for (const n of inWindow) {
      if (n.nightDate < from || n.isException || !hasTimes(n)) continue;
      const d = nightDuration(n);
      (isWeekendNight(n.nightDate) ? we : wd).push(d ?? Number.NaN);
    }
    const nums = (xs: number[]): number[] => xs.filter((x) => Number.isFinite(x));
    const wdMed = median(nums(wd));
    const weMed = median(nums(we));
    payload.weekdayWeekend = {
      weekdayNights: wd.length,
      weekendNights: we.length,
      weekdayMidpoint: formatAxisClock(sjl.value.weekdayMidMin),
      weekendMidpoint: formatAxisClock(sjl.value.weekendMidMin),
      socialJetLagMinutes: round(Math.abs(sjl.value.sjlMin)),
      ...(wdMed !== null ? { weekdayMedianDurationMinutes: round(wdMed) } : {}),
      ...(weMed !== null ? { weekendMedianDurationMinutes: round(weMed) } : {}),
    };
  }

  // Sonnellini (finestra di 30 giorni; i segnaposto del check serale non raddoppiano un sonnellino reale).
  const from = addDays(today, -(INSIGHTS_WINDOW_DAYS - 1));
  const napsIn = naps.filter(
    (p) => p.date >= from && p.date <= today && p.provenance !== 'mancante' && Number.isFinite(p.minutes) && p.minutes > 0,
  );
  const realDays = new Set(napsIn.filter((p) => !hasPlaceholderStart(p)).map((p) => p.date));
  const cleanNaps = napsIn.filter((p) => !(hasPlaceholderStart(p) && realDays.has(p.date)));
  const observed = new Set<string>(cleanNaps.map((p) => p.date));
  for (const n of inWindow) {
    if (n.status === 'mancante') continue;
    observed.add(n.nightDate);
    const prev = addDays(n.nightDate, -1);
    if (prev >= from) observed.add(prev);
  }
  if (observed.size > 0) {
    const napMed = median(cleanNaps.map((p) => p.minutes));
    payload.naps = {
      days: observed.size,
      count: cleanNaps.length,
      ...(napMed !== null ? { medianMinutes: round(napMed) } : {}),
    };
  }

  // Correlazioni (indizi, mai cause).
  const correlations = buildCorrelations(withData, checks);
  if (correlations.length > 0) payload.correlations = correlations;

  // Giornate particolari (testo libero sanitizzato): omesso se non c'è nulla.
  const dayContext = buildDayContext(checks, today, dayContextSource);
  if (dayContext.length > 0) payload.dayContext = dayContext;

  return payload;
}

// ---------------------------------------------------------------------------
// Insight a regole (locali)
// ---------------------------------------------------------------------------

const MINUS = '−';
const pct = (share: number): string => `${Math.round(share * 100)}%`;
const itNumber = (x: number, digits: number): string => x.toFixed(digits).replace('.', ',').replace('-', MINUS);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const humanFactor = (slug: string): string => slug.replace(/[-_]+/g, ' ');

const TARGET_PHRASE = {
  quality: { noun: 'una qualità percepita', feminine: true },
  energy: { noun: "un'energia al mattino", feminine: true },
  mood: { noun: 'un umore serale', feminine: false },
  duration: { noun: 'una durata del sonno', feminine: true },
} as const;

export const LOW_DATA_TITLE = 'Servono ancora alcune notti per darti indizi affidabili.';

function lowDataResult(payload: GatewayInsightsRequest, nowIso: string): InsightsResult {
  const { withData, inWindow } = payload.nights;
  const body =
    withData === 0
      ? 'Non ho ancora notti con gli orari. Appena ne avrai qualcuna, comparirà il primo indizio. Nessuna fretta.'
      : `Per ora ho dati su ${plural(withData, 'notte', 'notti')} su ${inWindow}. Con qualche notte in più compariranno indizi più solidi. Nessuna fretta.`;
  return { source: 'rules', updatedAt: nowIso, items: [{ title: LOW_DATA_TITLE, body }], nightsUsed: withData };
}

/**
 * Insight a regole dal solo payload aggregato. Funzione pura.
 * Con dati insufficienti restituisce un solo item ("Servono ancora alcune notti…").
 */
export function rulesInsights(payload: GatewayInsightsRequest, nowIso: string): InsightsResult {
  const { withData, inWindow } = payload.nights;
  const target = payload.targetSleepMinutes ?? DEFAULT_TARGET_SLEEP_MIN;
  const items: InsightItem[] = [];

  // Deriva degli orari.
  const dr = payload.drift;
  if (dr && dr.nights >= MIN_DRIFT_NIGHTS && dr.overDays >= MIN_DRIFT_DAYS) {
    const weeks = Math.max(1, Math.round(dr.overDays / 7));
    const weeksText = plural(weeks, 'settimana', 'settimane');
    const bedMain = Math.abs(dr.bedtimeShiftMinutes) >= Math.abs(dr.wakeShiftMinutes);
    const shift = bedMain ? dr.bedtimeShiftMinutes : dr.wakeShiftMinutes;
    if (Math.abs(shift) > TOLERANCE_MIN) {
      const what = bedMain ? 'dell’ora in cui vai a letto' : 'dell’ora in cui ti svegli';
      items.push({
        title: 'Il tuo orario sta scivolando.',
        body: `In ${weeksText} la mediana ${what} si è spostata di circa ${Math.abs(Math.round(shift))} min ${shift > 0 ? 'più tardi' : 'più presto'}. Se ti va, puoi riavvicinarla poco alla volta, di pochi minuti a sera.`,
      });
    } else if (Math.abs(dr.bedtimeShiftMinutes) < 15 && Math.abs(dr.wakeShiftMinutes) < 15) {
      items.push({
        title: 'Il tuo orario è stabile.',
        body: `In ${weeksText} la mediana di letto e di sveglia si è mossa di meno di 15 min.`,
      });
    }
  }

  // Debito di sonno (ultimi 7 giorni).
  if (payload.debt && payload.debt.nights >= MIN_DEBT_NIGHTS) {
    const minutes = Math.max(0, payload.debt.minutes);
    if (minutes >= 120) {
      items.push({
        title: 'Un debito da recuperare con calma.',
        body: `Negli ultimi 7 giorni mancano circa ${formatDuration(minutes)} rispetto al tuo obiettivo di ${formatDuration(target)} a notte. Recuperare un po’ per sera di solito è più gentile di una sola notte lunga.`,
      });
    } else if (minutes > 15) {
      items.push({
        title: 'Un debito piccolo, facile da chiudere.',
        body: `Negli ultimi 7 giorni mancano circa ${formatDuration(minutes)} rispetto al tuo obiettivo di ${formatDuration(target)} a notte. Bastano pochi minuti in più per qualche sera.`,
      });
    } else {
      items.push({
        title: 'Nessun debito di sonno.',
        body: `Negli ultimi 7 giorni hai dormito in linea con il tuo obiettivo di ${formatDuration(target)} a notte.`,
      });
    }
  }

  // Regolarità.
  const rg = payload.regularity;
  if (rg && rg.nights >= MIN_REGULARITY_NIGHTS) {
    const worst = Math.min(rg.bedtimeWithinShare, rg.wakeWithinShare);
    const title = worst >= 0.8 ? 'I tuoi orari sono regolari.' : worst < 0.5 ? 'I tuoi orari variano parecchio.' : 'I tuoi orari sono abbastanza regolari.';
    items.push({
      title,
      body: `Su ${rg.nights} notti, sei rimasto entro ±${rg.toleranceMinutes} min dalle ${rg.bedtimeMedian} nel ${pct(rg.bedtimeWithinShare)} delle sere e dalle ${rg.wakeMedian} nel ${pct(rg.wakeWithinShare)} dei risvegli.`,
    });
  }

  // Social jet lag.
  const ww = payload.weekdayWeekend;
  if (ww && ww.weekdayNights >= MIN_WEEKDAY_NIGHTS && ww.weekendNights >= MIN_WEEKEND_NIGHTS) {
    const lag = ww.socialJetLagMinutes;
    const mids = `Il punto medio del tuo sonno è alle ${ww.weekdayMidpoint} nei feriali e alle ${ww.weekendMidpoint} nel weekend`;
    if (lag >= 60) {
      items.push({ title: 'Il weekend sposta il tuo ritmo.', body: `${mids}: circa ${formatDuration(lag)} di scarto.` });
    } else if (lag >= 30) {
      items.push({ title: 'Un piccolo scarto nel weekend.', body: `${mids}: circa ${formatDuration(lag)} di scarto.` });
    } else {
      items.push({ title: 'Feriali e weekend sono allineati.', body: `${mids}: lo scarto è sotto i 30 min.` });
    }
  }

  // Indizi (correlazioni): mai cause.
  const cors = (payload.correlations ?? []).filter((c) => c.n >= MIN_CORRELATION_NIGHTS && Math.abs(c.r) >= MIN_CORRELATION_ABS_R);
  const top = [...cors].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  if (top) {
    const t = TARGET_PHRASE[top.target];
    const level = top.r > 0 ? (t.feminine ? 'più alta' : 'più alto') : t.feminine ? 'più bassa' : 'più basso';
    items.push({
      title: 'Un indizio da tenere d’occhio.',
      body: `«${humanFactor(top.factor)}» si lega a ${t.noun} ${level} (r = ${itNumber(top.r, 2)}, ${top.n} notti). È solo un indizio, non una spiegazione.`,
    });
  }

  // Durata.
  if (payload.duration && payload.duration.nights >= MIN_DURATION_NIGHTS) {
    const med = payload.duration.medianMinutes;
    if (med < target - 15) {
      items.push({
        title: 'Dormi un po’ meno del tuo obiettivo.',
        body: `La durata mediana è ${formatDuration(med)}, circa ${formatDuration(target - med)} sotto il tuo obiettivo di ${formatDuration(target)}.`,
      });
    } else {
      items.push({
        title: 'La durata è in linea con il tuo obiettivo.',
        body: `La durata mediana è ${formatDuration(med)}, il tuo obiettivo è ${formatDuration(target)}.`,
      });
    }
  }

  // Sonnellini.
  const np = payload.naps;
  if (np && np.days >= MIN_NAP_DAYS && np.count >= MIN_NAP_COUNT) {
    items.push({
      title: `${plural(np.count, 'sonnellino', 'sonnellini')} in ${np.days} giorni.`,
      body: `${np.medianMinutes !== undefined ? `Durano in mediana ${formatDuration(np.medianMinutes)}. ` : ''}Contano nel tuo sonno delle 24 ore.`,
    });
  }

  // Giornate particolari recenti: riconoscimento prudente, senza cause e senza ripetere il testo.
  const dc = payload.dayContext;
  if (dc && dc.length > 0 && items.length > 0) {
    const excluded = payload.nights.exceptions ?? 0;
    items.splice(Math.min(2, items.length), 0, {
      title: 'Hai segnalato giornate particolari.',
      body: `Nelle ultime notti hai segnalato ${plural(dc.length, 'giornata particolare', 'giornate particolari')}. ${
        excluded > 0
          ? 'Le notti segnate come imprevisto restano visibili, ma i loro valori sono esclusi dal riferimento. '
          : ''
      }Per ora le tengo come contesto, senza dedurne cause.`,
    });
  }

  // Copertura dichiarata, se bassa.
  const share = inWindow > 0 ? withData / inWindow : 0;
  if (items.length > 0 && items.length < MAX_INSIGHTS && share < LOW_COVERAGE_SHARE) {
    items.push({
      title: `Dati su ${withData} notti su ${inWindow}.`,
      body: `La copertura è del ${pct(share)}: questi indizi sono indicativi e si affineranno con qualche notte in più.`,
    });
  }

  if (withData < MIN_DURATION_NIGHTS || items.length === 0) return lowDataResult(payload, nowIso);
  return { source: 'rules', updatedAt: nowIso, items: items.slice(0, MAX_INSIGHTS), nightsUsed: withData };
}

// ---------------------------------------------------------------------------
// Chiamata al gateway
// ---------------------------------------------------------------------------

const gatewayResponseSchema = z.object({
  source: z.enum(['ai', 'rules']),
  insights: z
    .array(z.object({ title: z.string().trim().min(1), body: z.string().trim().min(1) }))
    .min(1),
});

/** Chiede gli insight al gateway; null per QUALSIASI problema (mai un errore, mai log di bearer o corpo). */
async function fetchGatewayInsights(
  payload: GatewayInsightsRequest,
  nowIso: string,
  fetchImpl: typeof fetch,
  baseUrl: string,
  secret: string,
): Promise<InsightsResult | null> {
  try {
    const url = `${new URL(baseUrl).toString().replace(/\/+$/, '')}/v1/insights`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const parsed = gatewayResponseSchema.safeParse(await res.json());
    if (!parsed.success) return null;
    return {
      source: parsed.data.source,
      updatedAt: nowIso,
      items: parsed.data.insights.slice(0, MAX_INSIGHTS).map((i) => ({ title: i.title, body: i.body })),
      nightsUsed: payload.nights.withData,
    };
  } catch {
    return null;
  }
}

/**
 * Insight della pagina Grafici: AI via gateway se configurato e raggiungibile, altrimenti regole locali.
 * Risponde sempre con un risultato valido (gli errori del repo, se ci sono, si propagano al chiamante).
 */
export async function loadInsights(
  repo: Repo,
  now: Date,
  deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<InsightsResult> {
  const env = deps.env ?? process.env;
  const today = todayInRome(now);
  const from = addDays(today, -(INSIGHTS_WINDOW_DAYS - 1));

  const [nights, naps, checks, target, nightExceptions, exceptionTypes] = await Promise.all([
    repo.listNights(from, today),
    repo.listNaps(from, today),
    // Un giorno in più: l'umore di una notte è quello della sera prima.
    repo.listEveningChecks(addDays(from, -1), today),
    repo.getSetting<number>('target_sleep_minutes'),
    repo.listNightExceptions(from, addDays(today, 1)),
    repo.listExceptionTypes(),
  ]);

  const payload = buildInsightsPayload(
    nights,
    naps,
    checks,
    today,
    typeof target === 'number' && Number.isFinite(target) && target > 0 ? target : DEFAULT_TARGET_SLEEP_MIN,
    { nightExceptions, exceptionLabels: Object.fromEntries(exceptionTypes.map((t) => [t.slug, t.label])) },
  );
  const nowIso = now.toISOString();

  const baseUrl = env.GATEWAY_URL?.trim();
  const secret = env.GATEWAY_SECRET?.trim();
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (baseUrl && secret && typeof fetchImpl === 'function') {
    const remote = await fetchGatewayInsights(payload, nowIso, fetchImpl, baseUrl, secret);
    if (remote) return remote;
  }
  return rulesInsights(payload, nowIso);
}
