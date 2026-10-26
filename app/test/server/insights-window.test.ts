import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  INSIGHTS_WINDOW_DAYS,
  buildInsightsPayload,
  loadInsights,
  normalizeWindow,
  type GatewayInsightsRequest,
  type InsightsResult,
  type InsightsWindow,
} from '../../src/server/insights';
import { MemoryRepo } from '../../src/server/memory-repo';
import { DEMO_NOW, buildDemoSeed } from '../../src/server/seed';
import { todayInRome } from '../../src/lib/clock';

const NOW = new Date(DEMO_NOW);
const TODAY = todayInRome(NOW);
const SECRET = 'bearer-finestra-0987654321-segreto';
const ENV = { GATEWAY_URL: 'https://gateway.example.test', GATEWAY_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;
const WINDOWS: readonly InsightsWindow[] = [7, 14, 30];

// Copia dello schema `insightStatsSchema` del gateway (gateway/src/insights/schema.ts): campi sconosciuti rifiutati.
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const nonNegInt = z.number().int().min(0).max(10_000);
const minutes = z.number().min(-1440).max(100_000);
const share = z.number().min(0).max(1);
const gatewaySchema = z.strictObject({
  windowDays: z.number().int().min(1).max(366),
  nights: z.strictObject({
    inWindow: nonNegInt,
    withData: nonNegInt,
    confirmed: nonNegInt.optional(),
    estimated: nonNegInt.optional(),
    exceptions: nonNegInt.optional(),
  }),
  targetSleepMinutes: z.number().int().min(240).max(720).optional(),
  duration: z
    .strictObject({ nights: nonNegInt, medianMinutes: minutes, mean7Minutes: minutes.optional(), mean30Minutes: minutes.optional() })
    .optional(),
  debt: z.strictObject({ nights: nonNegInt, minutes }).optional(),
  regularity: z
    .strictObject({
      nights: nonNegInt,
      toleranceMinutes: z.number().int().min(5).max(120),
      bedtimeMedian: hhmm,
      wakeMedian: hhmm,
      bedtimeWithinShare: share,
      wakeWithinShare: share,
      bedtimeMadMinutes: minutes.optional(),
      wakeMadMinutes: minutes.optional(),
    })
    .optional(),
  drift: z
    .strictObject({
      nights: nonNegInt,
      overDays: z.number().int().min(1).max(366),
      bedtimeShiftMinutes: minutes,
      wakeShiftMinutes: minutes,
    })
    .optional(),
  weekdayWeekend: z
    .strictObject({
      weekdayNights: nonNegInt,
      weekendNights: nonNegInt,
      weekdayMidpoint: hhmm,
      weekendMidpoint: hhmm,
      socialJetLagMinutes: z.number().min(0).max(1440),
      weekdayMedianDurationMinutes: minutes.optional(),
      weekendMedianDurationMinutes: minutes.optional(),
    })
    .optional(),
  naps: z.strictObject({ days: nonNegInt, count: nonNegInt, medianMinutes: minutes.optional() }).optional(),
  correlations: z
    .array(
      z.strictObject({
        factor: z.string().regex(/^[a-z0-9_-]{1,40}$/i),
        target: z.enum(['quality', 'energy', 'mood', 'duration']),
        r: z.number().min(-1).max(1),
        n: nonNegInt,
      }),
    )
    .max(20)
    .optional(),
  // Contratto del gateway: max 10 voci, text <= 140, giorni relativi (nessuna data).
  dayContext: z
    .array(
      z.strictObject({
        daysAgo: z.number().int().min(0).max(366),
        factors: z.array(z.string().regex(/^[a-z0-9_-]{1,40}$/i)).max(10),
        text: z.string().min(1).max(140),
      }),
    )
    .max(10)
    .optional(),
});

const GOOD_BODY = {
  summary: 'ok',
  insights: [{ category: 'regularity', severity: 'info', title: 'Dal gateway', body: 'Testo del gateway per te.', confidence: 'medium' }],
  source: 'ai',
  provider: 'x',
  model: 'y',
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const demoRepo = (): MemoryRepo => new MemoryRepo(buildDemoSeed(DEMO_NOW));

type FetchCall = [string, RequestInit];
const bodyOf = (fn: ReturnType<typeof vi.fn>): GatewayInsightsRequest =>
  JSON.parse(String((fn.mock.calls[0] as unknown as FetchCall)[1].body)) as GatewayInsightsRequest;

/** Niente date ISO, timestamp, id o note: solo numeri, quote, 'HH:MM' e slug. */
function assertNoIdentifiers(payload: unknown): void {
  const json = JSON.stringify(payload);
  expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(json).not.toMatch(/T\d{2}:\d{2}/);
  expect(json).not.toMatch(/\b\d{10,}\b/);
  expect(json).not.toMatch(/"(id|date|nightDate|note|notes|bedAt|wakeAt|createdAt|updatedAt)"/i);
}

function assertValid(r: InsightsResult, windowDays: InsightsWindow, source?: 'ai' | 'rules'): void {
  if (source) expect(r.source).toBe(source);
  expect(r.items.length).toBeGreaterThanOrEqual(1);
  expect(r.items.length).toBeLessThanOrEqual(5);
  expect(r.nightsUsed).toBeGreaterThanOrEqual(0);
  expect(r.nightsUsed).toBeLessThanOrEqual(windowDays);
  expect(r.windowDays).toBe(windowDays);
  for (const i of r.items) expect(`${i.title} ${i.body}`).not.toMatch(/NaN|undefined|Infinity|\[object/);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeWindow', () => {
  it('accetta 7/14/30, tutto il resto torna a 30', () => {
    expect(normalizeWindow(7)).toBe(7);
    expect(normalizeWindow(14)).toBe(14);
    expect(normalizeWindow(30)).toBe(30);
    for (const bad of [0, 1, 15, 31, -7, Number.NaN, '7', null, undefined]) expect(normalizeWindow(bad)).toBe(30);
  });
});

describe('buildInsightsPayload con finestra', () => {
  const seed = buildDemoSeed(DEMO_NOW);
  const nights = seed.nights ?? [];
  const naps = seed.naps ?? [];
  const checks = seed.checks ?? [];

  it('default invariato: senza finestra è identico a 30 giorni', () => {
    const def = buildInsightsPayload(nights, naps, checks, TODAY);
    expect(def).toEqual(buildInsightsPayload(nights, naps, checks, TODAY, undefined, 30));
    expect(def.windowDays).toBe(INSIGHTS_WINDOW_DAYS);
    expect(def.nights.inWindow).toBe(30);
  });

  it.each(WINDOWS)('finestra %i: valida per lo schema del gateway, senza identificativi', (w) => {
    const p = buildInsightsPayload(nights, naps, checks, TODAY, undefined, w);
    expect(gatewaySchema.safeParse(p).success).toBe(true);
    expect(p.windowDays).toBe(w);
    expect(p.nights.inWindow).toBe(w);
    expect(p.nights.withData).toBeLessThanOrEqual(w);
    if (p.duration) expect(p.duration.nights).toBeLessThanOrEqual(w);
    if (p.naps) expect(p.naps.days).toBeLessThanOrEqual(w + 1);
    if (w !== 30) expect(p.duration?.mean30Minutes).toBeUndefined();
    assertNoIdentifiers(p);
  });

  it('finestre corte: meno sezioni (le soglie minime restano)', () => {
    const p7 = buildInsightsPayload(nights, naps, checks, TODAY, undefined, 7);
    const p30 = buildInsightsPayload(nights, naps, checks, TODAY, undefined, 30);
    expect(p7.drift).toBeUndefined(); // servono almeno 14 notti
    expect(p7.correlations).toBeUndefined(); // servono almeno 14 notti con voti
    expect(Object.keys(p7).length).toBeLessThanOrEqual(Object.keys(p30).length);
  });
});

describe('loadInsights con finestra', () => {
  it('senza finestra: chiede 30 giorni al repo e al gateway (come prima)', async () => {
    const repo = demoRepo();
    const spy = vi.spyOn(repo, 'listNights');
    const fetchFn = vi.fn(async () => jsonResponse(GOOD_BODY));
    const r = await loadInsights(repo, NOW, { fetch: fetchFn as unknown as typeof fetch, env: ENV });
    assertValid(r, 30, 'ai');
    expect(bodyOf(fetchFn).windowDays).toBe(30);
    const [from, to] = spy.mock.calls[0] as [string, string];
    expect(to).toBe(TODAY);
    expect(Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)).toBe(29);
  });

  it.each(WINDOWS)('finestra %i: repo letto su %i giorni, payload conforme e senza date', async (w) => {
    const repo = demoRepo();
    const spy = vi.spyOn(repo, 'listNights');
    const fetchFn = vi.fn(async () => jsonResponse(GOOD_BODY));
    const r = await loadInsights(repo, NOW, { fetch: fetchFn as unknown as typeof fetch, env: ENV }, w);
    assertValid(r, w, 'ai');
    const [from, to] = spy.mock.calls[0] as [string, string];
    expect(Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)).toBe(w - 1);
    const body = bodyOf(fetchFn);
    expect(body.windowDays).toBe(w);
    expect(gatewaySchema.safeParse(body).success).toBe(true);
    assertNoIdentifiers(body);
  });

  it.each(WINDOWS)('finestra %i senza env: regole, nessuna chiamata', async (w) => {
    const fetchFn = vi.fn();
    const r = await loadInsights(demoRepo(), NOW, { fetch: fetchFn as unknown as typeof fetch, env: {} as NodeJS.ProcessEnv }, w);
    assertValid(r, w, 'rules');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  const failures: Array<[string, () => Promise<Response>]> = [
    ['gateway giù (rete)', async () => Promise.reject(new TypeError(`fetch failed ${SECRET}`))],
    ['timeout', async () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))],
    ['risposta malformata', async () => jsonResponse({ insights: 'non un array' })],
    ['JSON non valido', async () => new Response('<html>', { status: 200, headers: { 'content-type': 'application/json' } })],
    ['401', async () => jsonResponse({ error: 'unauthorized' }, 401)],
    ['500', async () => jsonResponse({ error: 'boom' }, 500)],
  ];

  for (const w of WINDOWS) {
    it.each(failures)(`finestra ${w}, %s: fallback a regole, niente bearer né corpo nei log`, async (_name, impl) => {
      const spies = (['error', 'warn', 'log', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
      const fetchFn = vi.fn(impl);
      const r = await loadInsights(demoRepo(), NOW, { fetch: fetchFn as unknown as typeof fetch, env: ENV }, w);
      assertValid(r, w, 'rules');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      const init = (fetchFn.mock.calls[0] as unknown as FetchCall)[1];
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.stringify(r)).not.toContain(SECRET);
      const sentBody = String(init.body);
      for (const s of spies) {
        for (const call of s.mock.calls) {
          const text = call.map((a) => (a instanceof Error ? `${a.message} ${a.stack ?? ''}` : String(a))).join(' ');
          expect(text).not.toContain(SECRET);
          expect(text).not.toContain(sentBody);
        }
      }
    });
  }
});
