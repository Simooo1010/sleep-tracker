import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { addDays } from '../../src/domain/time';
import type { Night } from '../../src/domain/types';
import {
  GATEWAY_TIMEOUT_MS,
  LOW_DATA_TITLE,
  buildInsightsPayload,
  loadInsights,
  rulesInsights,
  type GatewayInsightsRequest,
  type InsightsResult,
} from '../../src/server/insights';
import { MemoryRepo } from '../../src/server/memory-repo';
import { DEMO_NOW, buildDemoSeed } from '../../src/server/seed';
import { TODAY, buildDataset, hm, makeNight } from './views/fixtures';

const NOW = new Date(DEMO_NOW); // 24 ott 2026, 08:30 a Roma
const NOW_ISO = NOW.toISOString();
const SECRET = 'segretissimo-bearer-1234567890';
const ENV = { GATEWAY_URL: 'https://gateway.example.test', GATEWAY_SECRET: SECRET } as unknown as NodeJS.ProcessEnv;

// Copia dello schema del gateway (gateway/src/insights/schema.ts): il payload deve rispettarlo ESATTAMENTE.
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
});

const GOOD_BODY = {
  summary: 'ok',
  insights: [
    { category: 'regularity', severity: 'info', title: 'Dal gateway', body: 'Testo scritto dal gateway per te.', confidence: 'medium' },
    { category: 'debt', severity: 'positive', title: 'Secondo', body: 'Altro testo del gateway per te.', confidence: 'high' },
  ],
  source: 'ai',
  provider: 'x',
  model: 'y',
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const demoRepo = (): MemoryRepo => new MemoryRepo(buildDemoSeed(DEMO_NOW));

function assertValidResult(r: InsightsResult, source?: 'ai' | 'rules'): void {
  expect(['ai', 'rules']).toContain(r.source);
  if (source) expect(r.source).toBe(source);
  expect(Number.isNaN(Date.parse(r.updatedAt))).toBe(false);
  expect(r.items.length).toBeGreaterThanOrEqual(1);
  expect(r.items.length).toBeLessThanOrEqual(5);
  for (const i of r.items) {
    expect(i.title.length).toBeGreaterThan(0);
    expect(i.body.length).toBeGreaterThan(0);
    expect(`${i.title} ${i.body}`).not.toMatch(/NaN|undefined|Infinity|\[object/);
  }
  expect(r.nightsUsed).toBeGreaterThanOrEqual(0);
  expect(r.nightsUsed).toBeLessThanOrEqual(30);
}

/** 30 notti fino a TODAY con letto che slitta di `perNight` minuti a notte (deriva) e durata ~7h30. */
function driftingNights(perNight: number, days = 30): Night[] {
  const out: Night[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(TODAY, -(days - 1 - i));
    const bed = (hm('23:00') + Math.round(i * perNight)) % 1440;
    const wake = (bed + 450) % 1440;
    const f = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    out.push(makeNight(date, f(bed), f(wake), { quality: 4, energy: 4 }));
  }
  return out;
}

describe('buildInsightsPayload', () => {
  const ds = buildDataset();
  const payload = buildInsightsPayload(ds.nights, ds.naps, ds.checks, TODAY);

  it('rispetta ESATTAMENTE lo schema del gateway (campi strict, orari HH:MM)', () => {
    const parsed = gatewaySchema.safeParse(JSON.parse(JSON.stringify(payload)));
    expect(parsed.error?.issues).toBeUndefined();
    expect(parsed.success).toBe(true);
  });

  it('contiene le sezioni attese sul dataset da 30 notti', () => {
    expect(payload.windowDays).toBe(30);
    expect(payload.nights.inWindow).toBe(30);
    expect(payload.nights.withData).toBe(27); // 30 − 2 buchi − 1 mancante
    expect(payload.nights.exceptions).toBe(1);
    expect(payload.targetSleepMinutes).toBe(450);
    expect(payload.duration?.nights).toBeGreaterThan(20);
    expect(payload.debt?.minutes).toBeGreaterThanOrEqual(0);
    expect(payload.regularity?.toleranceMinutes).toBe(30);
    expect(payload.regularity?.bedtimeMedian).toMatch(/^\d{2}:\d{2}$/);
    expect(payload.weekdayWeekend?.weekendNights).toBeGreaterThanOrEqual(2);
    expect(payload.naps?.count).toBeGreaterThan(3);
    expect(payload.correlations?.length).toBeGreaterThan(0);
  });

  it('PRIVACY: nessuna data ISO, nessun timestamp, nessun id o nota nel JSON', () => {
    const noisy = ds.nights.map((n, i) => (i === 3 ? { ...n, note: 'dormito male a casa di Mario' } : n)) as Night[];
    const json = JSON.stringify(buildInsightsPayload(noisy, ds.naps, ds.checks, TODAY));
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(json).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(json).not.toMatch(/T\d{2}:\d{2}/);
    expect(json).not.toMatch(/\d{4}-\d{2}/);
    expect(json).not.toMatch(/Mario|note|nightDate|startAt|bedAt|wakeAt|idempotency|token|@/i);
    // Ogni stringa del payload è un orario HH:MM, un target o uno slug breve.
    const strings: string[] = [];
    JSON.parse(json, (_k, v) => {
      if (typeof v === 'string') strings.push(v);
      return v;
    });
    for (const s of strings) expect(s).toMatch(/^(\d{2}:\d{2}|[a-z0-9_-]{1,40})$/i);
  });

  it('fattori con testo libero o troppo lunghi non vengono inviati', () => {
    const nights = ds.nights.map((n, i) => ({
      ...n,
      factors: [...n.factors, ...(i % 2 === 0 ? ['Ho bevuto un caffè da Mario', 'a'.repeat(60)] : [])],
    }));
    const p = buildInsightsPayload(nights, ds.naps, ds.checks, TODAY);
    expect(p.correlations?.every((c) => /^[a-z0-9_-]{1,40}$/i.test(c.factor))).toBe(true);
    expect(gatewaySchema.safeParse(JSON.parse(JSON.stringify(p))).success).toBe(true);
  });

  it('ignora notti fuori finestra e usa l’obiettivo passato', () => {
    const old = makeNight('2026-08-01', '23:00', '07:00');
    const p = buildInsightsPayload([...ds.nights, old], ds.naps, ds.checks, TODAY, 480);
    expect(p.nights.withData).toBe(27);
    expect(p.targetSleepMinutes).toBe(480);
  });

  it('senza dati: payload minimo valido, nessuna sezione', () => {
    const p = buildInsightsPayload([], [], [], TODAY);
    expect(p).toEqual({ windowDays: 30, nights: { inWindow: 30, withData: 0, confirmed: 0, estimated: 0, exceptions: 0 }, targetSleepMinutes: 450 });
    expect(gatewaySchema.safeParse(p).success).toBe(true);
  });

  it('il payload della deriva ha overDays coerente e passa lo schema', () => {
    const p = buildInsightsPayload(driftingNights(2), [], [], TODAY);
    expect(p.drift).toBeDefined();
    expect(p.drift?.overDays).toBeGreaterThanOrEqual(14);
    expect(p.drift?.bedtimeShiftMinutes).toBeGreaterThan(30);
    expect(gatewaySchema.safeParse(p).success).toBe(true);
  });
});

describe('rulesInsights', () => {
  it('con deriva > 30 min: "Il tuo orario sta scivolando."', () => {
    const p = buildInsightsPayload(driftingNights(2), [], [], TODAY);
    const r = rulesInsights(p, NOW_ISO);
    assertValidResult(r, 'rules');
    expect(r.items.map((i) => i.title)).toContain('Il tuo orario sta scivolando.');
    expect(r.items.map((i) => i.title)).not.toContain('Il tuo orario è stabile.');
    expect(r.updatedAt).toBe(NOW_ISO);
  });

  it('senza deriva: "Il tuo orario è stabile."', () => {
    const r = rulesInsights(buildInsightsPayload(driftingNights(0), [], [], TODAY), NOW_ISO);
    assertValidResult(r, 'rules');
    const titles = r.items.map((i) => i.title);
    expect(titles).toContain('Il tuo orario è stabile.');
    expect(titles).not.toContain('Il tuo orario sta scivolando.');
  });

  it('debito < 120 min: "Un debito piccolo, facile da chiudere."', () => {
    const base = buildInsightsPayload(driftingNights(0), [], [], TODAY);
    const r = rulesInsights({ ...base, debt: { nights: 7, minutes: 60 } }, NOW_ISO);
    expect(r.items.map((i) => i.title)).toContain('Un debito piccolo, facile da chiudere.');
    const big = rulesInsights({ ...base, debt: { nights: 7, minutes: 300 } }, NOW_ISO);
    expect(big.items.map((i) => i.title)).not.toContain('Un debito piccolo, facile da chiudere.');
    expect(big.items.map((i) => i.title)).toContain('Un debito da recuperare con calma.');
  });

  it('dataset realistico: 3–5 insight in italiano, senza linguaggio causale', () => {
    const ds = buildDataset();
    const r = rulesInsights(buildInsightsPayload(ds.nights, ds.naps, ds.checks, TODAY), NOW_ISO);
    assertValidResult(r, 'rules');
    expect(r.items.length).toBeGreaterThanOrEqual(3);
    expect(r.nightsUsed).toBe(27);
    const text = r.items.map((i) => `${i.title} ${i.body}`).join(' ');
    expect(text).not.toMatch(/caus|perché|a causa|colpa|devi\b/i);
    expect(r.items.some((i) => /regolar|orari|orario/i.test(i.title))).toBe(true);
  });

  it('indizio da correlazione: "si lega a", mai "causa"', () => {
    const base = buildInsightsPayload(driftingNights(0), [], [], TODAY);
    const r = rulesInsights({ ...base, correlations: [{ factor: 'schermo-a-letto', target: 'quality', r: -0.42, n: 18 }] }, NOW_ISO);
    const hint = r.items.find((i) => i.title === 'Un indizio da tenere d’occhio.');
    expect(hint?.body).toContain('si lega a');
    expect(hint?.body).toContain('«schermo a letto»');
    expect(hint?.body).toContain('−0,42');
    expect(hint?.body).not.toMatch(/caus/i);
    // sotto soglia di notti o di |r|: nessun indizio
    const weak = rulesInsights({ ...base, correlations: [{ factor: 'sport', target: 'mood', r: 0.2, n: 30 }, { factor: 'alcol', target: 'mood', r: 0.6, n: 9 }] }, NOW_ISO);
    expect(weak.items.map((i) => i.title)).not.toContain('Un indizio da tenere d’occhio.');
  });

  it('pochi dati: un solo item "Servono ancora alcune notti…"', () => {
    const few = driftingNights(0).slice(-3);
    const r = rulesInsights(buildInsightsPayload(few, [], [], TODAY), NOW_ISO);
    assertValidResult(r, 'rules');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.title).toBe(LOW_DATA_TITLE);
    expect(r.nightsUsed).toBe(3);
    const none = rulesInsights(buildInsightsPayload([], [], [], TODAY), NOW_ISO);
    expect(none.items).toHaveLength(1);
    expect(none.items[0]?.title).toBe(LOW_DATA_TITLE);
    expect(none.nightsUsed).toBe(0);
  });

  it('copertura bassa dichiarata: aggiunge un item di copertura', () => {
    const sparse = driftingNights(0).filter((_n, i) => i % 3 === 0); // 10 notti su 30
    const p = buildInsightsPayload(sparse, [], [], TODAY);
    expect(p.nights.withData).toBe(10);
    const r = rulesInsights(p, NOW_ISO);
    assertValidResult(r, 'rules');
    expect(r.items.some((i) => /^Dati su 10 notti su 30/.test(i.title))).toBe(true);
  });

  it('con il dataset demo: risultato valido e pulito', () => {
    const seed = buildDemoSeed(DEMO_NOW);
    const p = buildInsightsPayload(seed.nights ?? [], seed.naps ?? [], seed.checks ?? [], TODAY);
    expect(gatewaySchema.safeParse(JSON.parse(JSON.stringify(p))).success).toBe(true);
    assertValidResult(rulesInsights(p, NOW_ISO), 'rules');
  });
});

describe('loadInsights', () => {
  it('env mancanti: regole, fetch mai chiamato', async () => {
    const fetchFn = vi.fn();
    for (const env of [{}, { GATEWAY_URL: ENV.GATEWAY_URL }, { GATEWAY_SECRET: SECRET }, { GATEWAY_URL: '', GATEWAY_SECRET: '' }]) {
      const r = await loadInsights(demoRepo(), NOW, { fetch: fetchFn as unknown as typeof fetch, env: env as NodeJS.ProcessEnv });
      assertValidResult(r, 'rules');
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('gateway ok: usa i testi del gateway e la provenienza dichiarata', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(GOOD_BODY));
    const r = await loadInsights(demoRepo(), NOW, { fetch: fetchFn as unknown as typeof fetch, env: ENV });
    assertValidResult(r, 'ai');
    expect(r.items).toEqual([
      { title: 'Dal gateway', body: 'Testo scritto dal gateway per te.' },
      { title: 'Secondo', body: 'Altro testo del gateway per te.' },
    ]);
    expect(r.updatedAt).toBe(NOW_ISO);
    expect(r.nightsUsed).toBeGreaterThan(20);

    // Richiesta: URL, metodo, intestazioni, timeout, corpo conforme e senza date.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gateway.example.test/v1/insights');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(headers['content-type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(GATEWAY_TIMEOUT_MS).toBe(6000);
    const body = String(init.body);
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(gatewaySchema.safeParse(JSON.parse(body)).success).toBe(true);
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  it('gateway che risponde con regole proprie: source "rules" come dichiarato', async () => {
    const fetchFn = async () => jsonResponse({ ...GOOD_BODY, source: 'rules', provider: null, model: null });
    const r = await loadInsights(demoRepo(), NOW, { fetch: fetchFn as unknown as typeof fetch, env: ENV });
    assertValidResult(r, 'rules');
    expect(r.items[0]?.title).toBe('Dal gateway');
  });

  it('URL con slash finale: nessun doppio slash', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(GOOD_BODY));
    await loadInsights(demoRepo(), NOW, {
      fetch: fetchFn as unknown as typeof fetch,
      env: { GATEWAY_URL: 'https://gateway.example.test/', GATEWAY_SECRET: SECRET } as unknown as NodeJS.ProcessEnv,
    });
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('https://gateway.example.test/v1/insights');
  });

  const failures: Array<[string, () => Promise<Response>]> = [
    ['401', async () => jsonResponse({ error: 'unauthorized' }, 401)],
    ['429', async () => jsonResponse({ error: 'rate_limited' }, 429)],
    ['500', async () => jsonResponse({ error: 'boom' }, 500)],
    ['503', async () => jsonResponse({ error: 'all_providers_failed' }, 503)],
    ['timeout (AbortError)', async () => Promise.reject(new DOMException('The operation was aborted', 'AbortError'))],
    ['timeout (TimeoutError)', async () => Promise.reject(new DOMException('signal timed out', 'TimeoutError'))],
    ['rete giù', async () => Promise.reject(new TypeError('fetch failed'))],
    ['JSON rotto', async () => new Response('{non json', { status: 200 })],
    ['corpo vuoto', async () => new Response('', { status: 200 })],
    ['forma inattesa', async () => jsonResponse({ hello: 'world' })],
    ['insights vuoti', async () => jsonResponse({ ...GOOD_BODY, insights: [] })],
    ['source sconosciuta', async () => jsonResponse({ ...GOOD_BODY, source: 'magia' })],
    ['titolo non stringa', async () => jsonResponse({ ...GOOD_BODY, insights: [{ title: 5, body: 'x' }] })],
  ];

  it.each(failures)('%s: ripiega in silenzio sulle regole locali', async (_name, impl) => {
    const spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log'), vi.spyOn(console, 'info')];
    try {
      const r = await loadInsights(demoRepo(), NOW, { fetch: vi.fn(impl) as unknown as typeof fetch, env: ENV });
      assertValidResult(r, 'rules');
      expect(r.items.map((i) => i.title)).not.toContain('Dal gateway');
      expect(JSON.stringify(r)).not.toContain(SECRET);
      for (const s of spies) expect(s).not.toHaveBeenCalled();
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it('un fetch che lancia in modo sincrono non propaga l’errore', async () => {
    const fetchFn = (() => {
      throw new Error(`boom ${SECRET}`);
    }) as unknown as typeof fetch;
    const r = await loadInsights(demoRepo(), NOW, { fetch: fetchFn, env: ENV });
    assertValidResult(r, 'rules');
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  it('URL del gateway non valido: regole, nessuna chiamata', async () => {
    const fetchFn = vi.fn();
    const r = await loadInsights(demoRepo(), NOW, {
      fetch: fetchFn as unknown as typeof fetch,
      env: { GATEWAY_URL: 'non un url', GATEWAY_SECRET: SECRET } as unknown as NodeJS.ProcessEnv,
    });
    assertValidResult(r, 'rules');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('repo vuoto: un solo item di pochi dati, anche con gateway che fallisce', async () => {
    const r = await loadInsights(new MemoryRepo(), NOW, { fetch: (async () => jsonResponse({}, 500)) as unknown as typeof fetch, env: ENV });
    assertValidResult(r, 'rules');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.title).toBe(LOW_DATA_TITLE);
    expect(r.nightsUsed).toBe(0);
  });

  it('legge solo gli ultimi 30 giorni dal repo e usa l’obiettivo delle impostazioni', async () => {
    const seed = buildDemoSeed(DEMO_NOW);
    const repo = new MemoryRepo({ ...seed, settings: { target_sleep_minutes: 480 } });
    const fetchFn = vi.fn(async () => jsonResponse(GOOD_BODY));
    await loadInsights(repo, NOW, { fetch: fetchFn as unknown as typeof fetch, env: ENV });
    const body = JSON.parse(String(((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1]).body)) as GatewayInsightsRequest;
    expect(body.targetSleepMinutes).toBe(480);
    expect(body.windowDays).toBe(30);
    expect(body.nights.withData).toBeLessThanOrEqual(30);
  });

  it('senza env passate usa process.env (qui vuoto per il gateway)', async () => {
    const saved = { url: process.env.GATEWAY_URL, secret: process.env.GATEWAY_SECRET };
    delete process.env.GATEWAY_URL;
    delete process.env.GATEWAY_SECRET;
    try {
      const fetchFn = vi.fn();
      const r = await loadInsights(demoRepo(), NOW, { fetch: fetchFn as unknown as typeof fetch });
      assertValidResult(r, 'rules');
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      if (saved.url !== undefined) process.env.GATEWAY_URL = saved.url;
      if (saved.secret !== undefined) process.env.GATEWAY_SECRET = saved.secret;
    }
  });
});
