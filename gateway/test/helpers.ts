import type { FetchLike } from '../src/types.ts';

export interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export type FakeReply = Response | 'hang' | 'network_error';
export type FakeHandler = (body: Record<string, unknown>, callNo: number) => FakeReply | Promise<FakeReply>;

/** Fake fetch routing by URL prefix (provider baseUrl). Records every call. */
export function fakeFetch(routes: Record<string, FakeHandler>) {
  const calls: RecordedCall[] = [];
  const counts = new Map<string, number>();
  const fetch: FetchLike = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const prefix = Object.keys(routes).find((p) => url.startsWith(p));
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url, headers, body });
    if (!prefix) throw new TypeError('fetch failed');
    const n = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, n);
    const reply = await routes[prefix]!(body, n);
    if (reply === 'network_error') throw new TypeError('fetch failed');
    if (reply === 'hang') {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    }
    return reply;
  };
  return { fetch, calls, callsTo: (prefix: string) => calls.filter((c) => c.url.startsWith(prefix)) };
}

export function completion(content: string, model = 'fake-model', usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }): Response {
  return new Response(
    JSON.stringify({
      id: 'x',
      object: 'chat.completion',
      model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export function status(code: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { message: 'fake error' } }), { status: code, headers });
}

export const validInsightsJson = JSON.stringify({
  summary: 'Sonno abbastanza regolare, durata un po\' bassa.',
  insights: [
    {
      category: 'duration',
      severity: 'attention',
      title: 'Durata sotto il riferimento',
      body: 'La durata mediana è di circa 6 h 40 min, sotto le 7 h.',
      confidence: 'medium',
    },
  ],
});

/** Three fake OpenAI-compatible providers. */
export function testProviders(overrides: Array<Record<string, unknown>> = []) {
  const base = [
    { id: 'p1', baseUrl: 'https://p1.test/v1', apiKeyEnv: 'P1_KEY', model: 'm1', priority: 10, structuredOutput: 'json_schema', timeoutMs: 200 },
    { id: 'p2', baseUrl: 'https://p2.test/v1', apiKeyEnv: 'P2_KEY', model: 'm2', priority: 20, structuredOutput: 'json_object', timeoutMs: 200 },
    { id: 'p3', baseUrl: 'https://p3.test/v1', apiKeyEnv: 'P3_KEY', model: 'm3', priority: 30, structuredOutput: 'prompt', timeoutMs: 200 },
  ];
  return base.map((b) => ({ ...b, ...(overrides.find((o) => o.id === b.id) ?? {}) }));
}

export const testEnv = { P1_KEY: 'secret-key-p1-AAAA', P2_KEY: 'secret-key-p2-BBBB', P3_KEY: 'secret-key-p3-CCCC' };

export const goodStats = {
  windowDays: 14,
  nights: { inWindow: 14, withData: 13 },
  duration: { nights: 13, medianMinutes: 400 },
  debt: { nights: 13, minutes: 240 },
  regularity: {
    nights: 13,
    toleranceMinutes: 30,
    bedtimeMedian: '23:40',
    wakeMedian: '07:00',
    bedtimeWithinShare: 0.85,
    wakeWithinShare: 0.9,
  },
};

/** Controllable clock. */
export function clock(start = Date.parse('2026-10-24T10:00:00Z')) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}
