/**
 * Dataset demo DETERMINISTICO di 60 giorni per sviluppo ed E2E (`APP_SEED=demo` con `APP_DATA_MODE=memory`).
 * Mai in produzione: lo carica solo `repo-factory.ts` nel ramo memoria, fuori da NODE_ENV=production.
 *
 * Funzione pura: nessun Date.now(), nessun Math.random(). L'unica fonte di "caso" è un PRNG mulberry32
 * con seme fisso, consumato sempre nello stesso ordine: stesso `nowIso` → stesso oggetto, bit per bit.
 *
 * Profilo (Europe/Rome): letto mediano ~23:45 (±25 min), sveglia ~07:20 (±20); notti di sabato e domenica
 * (nightDate) letto ~00:40 e sveglia ~09:00; deriva lenta del letto di +35 min nelle ultime 5 settimane.
 * Le notti con orari si costruiscono con `localToIso`, quindi attraversano l'ora legale senza offset fissi.
 *
 * Eccezioni: `MemoryRepoSeed` NON accetta le eccezioni per notte (si impostano solo con `setNightExceptions`).
 * Qui le tre notti-eccezione hanno `isException: true` e lo slug (malattia, viaggio, festa) in `factors`, come
 * si aspettano i view model; `demoNightExceptions` ricava la mappa data → slug da passare a `setNightExceptions`.
 */
import { localToIso } from '../domain/estimate';
import { addDays, durationMinutes, isWeekendNight, localParts } from '../domain/time';
import type { EveningCheck, Nap, Night, Provenance, Score, SignalType, Tracked } from '../domain/types';
import type { MemoryRepoSeed } from './memory-repo';
import type { StoredEvent } from './types';

/** Istante di riferimento del dataset: sabato 24 ottobre 2026, 08:30 a Roma. */
export const DEMO_NOW = '2026-10-24T08:30:00+02:00';
export const DEMO_SEED_VALUE = 20261024;
export const DEMO_DAYS = 60;
/** Slug delle notti-eccezione del dataset. */
export const DEMO_EXCEPTION_SLUGS: readonly string[] = ['malattia', 'viaggio', 'festa'];

const TARGET_MIN = 450;
const CHECK_COUNT = 45;
const NAP_COUNT = 14;
/** Le ultime 10 notti (indici 50–59) hanno anche gli eventi grezzi. */
const EVENT_FROM_IDX = DEMO_DAYS - 10;

// Indici notte: 0 = oggi−59, 59 = oggi.
const MISSING_IDX: readonly number[] = [4, 17, 29, 38, 47, 55];
const ESTIMATED_OLD_IDX: readonly number[] = [6, 12, 21, 26, 34, 41, 46];
/** Notti stimate con il solo segnale app_open (sveglia = primo uso del telefono, letto dai giorni simili). */
const APP_OPEN_ONLY_IDX: readonly number[] = [51, 54];
const EXCEPTION_IDX: Readonly<Record<number, string>> = { 13: 'malattia', 31: 'viaggio', 44: 'festa' };
/** Sonnellini forzati nelle ultime due settimane (con provenienza automatica per averne gli eventi). */
const FORCED_NAP_IDX: readonly number[] = [52, 57];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const score = (x: number): Score => clamp(Math.round(x), 1, 5) as Score;
/** Da [0,1) a [−amp, +amp). */
const spread = (x: number, amp: number): number => (x * 2 - 1) * amp;
const round5 = (m: number): number => Math.round(m / 5) * 5;
const tracked = <T>(value: T | null, provenance: Provenance): Tracked<T> =>
  value === null ? { value: null, provenance: 'mancante' } : { value, provenance };

/** Estrazioni di una notte, SEMPRE nello stesso ordine (le proprietà si valutano in sequenza). */
interface Draws {
  bed: number;
  wake: number;
  screen: number;
  sport: number;
  stress: number;
  dinner: number;
  alcohol: number;
  quality: number;
  energy: number;
  tired: number;
  mood: number;
  napStart: number;
  napMin: number;
  evtA: number;
  evtB: number;
  checkNap: number;
}

function draw(rng: () => number): Draws {
  return {
    bed: rng(),
    wake: rng(),
    screen: rng(),
    sport: rng(),
    stress: rng(),
    dinner: rng(),
    alcohol: rng(),
    quality: rng(),
    energy: rng(),
    tired: rng(),
    mood: rng(),
    napStart: rng(),
    napMin: rng(),
    evtA: rng(),
    evtB: rng(),
    checkNap: rng(),
  };
}

interface Plan {
  idx: number;
  date: string;
  /** Minuti dalla mezzanotte locale del giorno PRIMA di `date` (>1440 = dopo mezzanotte). */
  bedMin: number;
  /** Minuti dalla mezzanotte locale di `date`. */
  wakeMin: number;
  /** Fattori della sera precedente (mai gli slug-eccezione). */
  factors: string[];
  exception: string | null;
  d: Draws;
}

function planNight(idx: number, date: string, rng: () => number): Plan {
  const d = draw(rng);
  const weekend = isWeekendNight(date);
  const screen = d.screen < 0.35;
  const sport = d.sport < 0.25;
  const stress = d.stress < 0.2;
  const dinner = d.dinner < 0.15;
  const alcohol = d.alcohol < 0.08;
  const factors = [
    ...(screen ? ['schermo-a-letto'] : []),
    ...(sport ? ['sport'] : []),
    ...(stress ? ['giornata-stressante'] : []),
    ...(dinner ? ['cena-tardi'] : []),
    ...(alcohol ? ['alcol'] : []),
  ];

  // Deriva lenta: +35 min lungo le ultime 5 settimane (da idx 25 a 59).
  const drift = idx >= 25 ? (35 * (idx - 25)) / (DEMO_DAYS - 1 - 25) : 0;
  const baseBed = weekend ? 1440 + 40 : 1440 - 15;
  const baseWake = weekend ? 9 * 60 : 7 * 60 + 20;
  let bedMin = baseBed + drift + spread(d.bed, 25) + (screen ? 10 : 0) + (dinner ? 8 : 0) + (alcohol ? 12 : 0);
  let wakeMin = baseWake + spread(d.wake, 20);

  // Durata (orologio a muro) tra 5 e 10 ore.
  bedMin = Math.round(bedMin);
  wakeMin = Math.round(wakeMin);
  const wall = wakeMin - bedMin + 1440;
  if (wall < 300) wakeMin = bedMin - 1440 + 300;
  if (wall > 600) bedMin = wakeMin + 1440 - 600;

  const exception = EXCEPTION_IDX[idx] ?? null;
  if (exception === 'malattia') {
    bedMin = 22 * 60 + 45;
    wakeMin = 9 * 60 + 15;
  } else if (exception === 'viaggio') {
    bedMin = 1440 + 90;
    wakeMin = 6 * 60 + 50;
  } else if (exception === 'festa') {
    bedMin = 1440 + 190;
    wakeMin = 10 * 60 + 40;
  }
  return { idx, date, bedMin, wakeMin, factors, exception, d };
}

const has = (p: Plan, f: string): number => (p.factors.includes(f) ? 1 : 0);

/** Qualità ed energia plausibili: dormire vicino al target e sport aiutano; schermo, alcol e stress no. */
function scoresFor(p: Plan, durMin: number): { quality: Score; energy: Score } {
  if (p.exception === 'malattia') return { quality: 2, energy: 1 };
  if (p.exception === 'viaggio' || p.exception === 'festa') return { quality: 2, energy: 2 };
  const dd = clamp((durMin - TARGET_MIN) / 60, -1.5, 1.5);
  const q =
    3.2 +
    0.6 * has(p, 'sport') -
    0.8 * has(p, 'schermo-a-letto') -
    0.6 * has(p, 'alcol') -
    0.4 * has(p, 'giornata-stressante') -
    0.3 * has(p, 'cena-tardi') +
    0.5 * dd +
    spread(p.d.quality, 0.7);
  const e = 3.0 + 0.7 * dd + 0.35 * (q - 3) - 0.3 * has(p, 'giornata-stressante') + spread(p.d.energy, 0.7);
  return { quality: score(q), energy: score(e) };
}

const minutesAfter = (iso: string, minutes: number): string => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

export function buildDemoSeed(nowIso: string): MemoryRepoSeed {
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(nowMs)) throw new Error(`nowIso non valido: ${nowIso}`);
  const { date: today, minutes: nowMin } = localParts(nowIso);
  const dateOf = (idx: number): string => addDays(today, idx - (DEMO_DAYS - 1));

  const rng = mulberry32(DEMO_SEED_VALUE);
  const plans: Plan[] = [];
  for (let idx = 0; idx < DEMO_DAYS; idx++) plans.push(planNight(idx, dateOf(idx), rng));

  const events: StoredEvent[] = [];
  const addEvent = (type: SignalType, ts: string, source: StoredEvent['source'], key: string): void => {
    events.push({ type, ts, source, idempotencyKey: key });
  };
  /** Sere con un evento evening_check: devono avere anche il check salvato. */
  const forcedChecks = new Set<number>();

  const nights: Night[] = plans.map((p): Night => {
    const prev = addDays(p.date, -1);
    const bedIso = localToIso(prev, p.bedMin);
    const wakeIso = localToIso(p.date, p.wakeMin);
    const base = { nightDate: p.date, isException: p.exception !== null };

    if (p.idx === DEMO_DAYS - 1) {
      // Stanotte: letto da bedtime_candidate (Riposo), risveglio da wake automatico; voti ancora da dare.
      const bedRel = p.bedMin - 1440;
      const wakeMin = Math.max(bedRel + 240, Math.min(p.wakeMin, nowMin - 75));
      const wake = localToIso(p.date, wakeMin);
      addEvent('evening_check', minutesAfter(bedIso, -(6 + Math.floor(p.d.evtA * 10))), 'comandi', `demo-evening_check-${p.date}`);
      addEvent('bedtime_candidate', bedIso, 'comandi', `demo-bedtime_candidate-${p.date}`);
      addEvent('wake', wake, 'comandi', `demo-wake-${p.date}`);
      const appOpenMin = Math.max(wakeMin, Math.min(wakeMin + 55, nowMin - 5));
      addEvent('app_open', localToIso(p.date, appOpenMin), 'app', `demo-app_open-${p.date}`);
      forcedChecks.add(p.idx);
      return {
        ...base,
        bedAt: tracked(bedIso, 'automatico'),
        wakeAt: tracked(wake, 'automatico'),
        status: 'stimata',
        quality: tracked<Score>(null, 'mancante'),
        energy: tracked<Score>(null, 'mancante'),
        factors: [...p.factors],
      };
    }

    if (MISSING_IDX.includes(p.idx)) {
      return {
        ...base,
        bedAt: tracked<string>(null, 'mancante'),
        wakeAt: tracked<string>(null, 'mancante'),
        status: 'mancante',
        quality: tracked<Score>(null, 'mancante'),
        energy: tracked<Score>(null, 'mancante'),
        factors: [],
      };
    }

    if (APP_OPEN_ONLY_IDX.includes(p.idx)) {
      // Nessun altro segnale: la sveglia è il primo uso del telefono, il letto viene dai giorni simili.
      const wakeMin = p.wakeMin + 25 + Math.floor(p.d.evtA * 30);
      const appOpen = localToIso(p.date, wakeMin);
      addEvent('app_open', appOpen, 'app', `demo-app_open-${p.date}`);
      return {
        ...base,
        bedAt: tracked(localToIso(prev, round5(p.bedMin)), 'stimato'),
        wakeAt: tracked(appOpen, 'stimato'),
        status: 'stimata',
        quality: tracked<Score>(null, 'mancante'),
        energy: tracked<Score>(null, 'mancante'),
        factors: [...p.factors],
      };
    }

    const estimatedPos = ESTIMATED_OLD_IDX.indexOf(p.idx);
    if (estimatedPos >= 0) {
      // Variante A: letto stimato + sveglia automatica; variante B: entrambi stimati.
      const wakeEstimated = estimatedPos % 2 === 1;
      return {
        ...base,
        bedAt: tracked(localToIso(prev, round5(p.bedMin)), 'stimato'),
        wakeAt: wakeEstimated ? tracked(localToIso(p.date, round5(p.wakeMin)), 'stimato') : tracked(wakeIso, 'automatico'),
        status: 'stimata',
        quality: tracked<Score>(null, 'mancante'),
        energy: tracked<Score>(null, 'mancante'),
        factors: [...p.factors],
      };
    }

    // Notte confermata (anche le tre eccezioni).
    const { quality, energy } = scoresFor(p, durationMinutes(bedIso, wakeIso));
    if (p.idx >= EVENT_FROM_IDX) {
      addEvent('evening_check', minutesAfter(bedIso, -(6 + Math.floor(p.d.evtA * 10))), 'comandi', `demo-evening_check-${p.date}`);
      addEvent('bedtime_candidate', bedIso, 'comandi', `demo-bedtime_candidate-${p.date}`);
      addEvent('wake', wakeIso, 'comandi', `demo-wake-${p.date}`);
      addEvent('app_open', minutesAfter(wakeIso, 60 + Math.floor(p.d.evtB * 50)), 'app', `demo-app_open-${p.date}`);
      forcedChecks.add(p.idx);
    }
    return {
      ...base,
      bedAt: tracked(bedIso, 'confermato'),
      wakeAt: tracked(wakeIso, 'confermato'),
      status: 'confermata',
      quality: tracked(quality, 'confermato'),
      energy: tracked(energy, 'confermato'),
      factors: p.exception ? [...p.factors, p.exception] : [...p.factors],
    };
  });

  // Sonnellini pomeridiani: 12 sparsi nei primi 45 giorni + 2 nelle ultime due settimane.
  const napDays = [...shuffled(Array.from({ length: 45 }, (_, i) => i), rng).slice(0, NAP_COUNT - FORCED_NAP_IDX.length), ...FORCED_NAP_IDX];
  napDays.sort((a, b) => a - b);
  const naps: Nap[] = napDays.map((idx, k): Nap => {
    const p = plans[idx] as Plan;
    const startMin = round5(13 * 60 + Math.floor(p.d.napStart * 210));
    const minutes = 15 + 5 * Math.floor(p.d.napMin * 7);
    const provenance: Provenance = FORCED_NAP_IDX.includes(idx) ? 'automatico' : k % 3 === 0 ? 'confermato' : 'automatico';
    return { date: p.date, startAt: localToIso(p.date, startMin), minutes, provenance };
  });
  for (const nap of naps) {
    // Gli eventi grezzi esistono solo per le ultime 10 notti.
    if (nap.provenance !== 'automatico' || nap.date < dateOf(EVENT_FROM_IDX)) continue;
    addEvent('nap_start', nap.startAt, 'comandi', `demo-nap_start-${nap.startAt}`);
    addEvent('nap_end', minutesAfter(nap.startAt, nap.minutes), 'comandi', `demo-nap_end-${nap.startAt}`);
  }
  const napByDate = new Map(naps.map((n) => [n.date, n]));

  // Check serali: 45 sere (nessuna per le notti mancanti); le sere con evento evening_check ci sono sempre.
  const pool = plans.filter((p) => p.idx < EVENT_FROM_IDX && !MISSING_IDX.includes(p.idx)).map((p) => p.idx);
  const extra = shuffled(pool, rng).slice(0, CHECK_COUNT - forcedChecks.size);
  const checkIdx = new Set<number>([...forcedChecks, ...extra]);
  const checks: EveningCheck[] = plans
    .filter((p) => checkIdx.has(p.idx))
    .map((p): EveningCheck => {
      const eveningDate = addDays(p.date, -1);
      const nap = napByDate.get(eveningDate);
      const napMinutesToday: Tracked<number> = nap
        ? tracked(nap.minutes, 'confermato')
        : p.d.checkNap < 0.7
          ? tracked(0, 'confermato')
          : tracked<number>(null, 'mancante');
      return {
        date: eveningDate,
        tiredness: tracked(score(2.8 + 0.6 * has(p, 'giornata-stressante') + 0.4 * has(p, 'sport') + spread(p.d.tired, 0.9)), 'confermato'),
        mood: tracked(score(3.5 - 0.9 * has(p, 'giornata-stressante') - 0.2 * has(p, 'alcol') + spread(p.d.mood, 0.9)), 'confermato'),
        factors: [...p.factors],
        napMinutesToday,
      };
    });

  const stored = events
    .filter((e) => Date.parse(e.ts) <= nowMs)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || a.idempotencyKey.localeCompare(b.idempotencyKey));

  return {
    events: stored,
    nights,
    checks,
    naps,
    settings: { target_sleep_minutes: TARGET_MIN, timezone: 'Europe/Rome' },
  };
}

/** Eccezioni per notte (data → slug) da impostare con `MemoryRepo.setNightExceptions` (il seed non le accetta). */
export function demoNightExceptions(nights: Night[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const n of nights) {
    if (!n.isException) continue;
    const slugs = n.factors.filter((f) => DEMO_EXCEPTION_SLUGS.includes(f));
    if (slugs.length > 0) out[n.nightDate] = slugs;
  }
  return out;
}
