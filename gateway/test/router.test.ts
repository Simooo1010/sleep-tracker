import { describe, expect, it } from 'vitest';
import { createGateway, AllProvidersFailedError } from '../src/gateway.ts';
import { noopLogger, type GatewayLogEvent } from '../src/log.ts';
import { clock, completion, fakeFetch, goodStats, status, testEnv, testProviders, validInsightsJson } from './helpers.ts';

const P1 = 'https://p1.test/v1';
const P2 = 'https://p2.test/v1';
const P3 = 'https://p3.test/v1';
const user = [{ role: 'user' as const, content: 'ciao' }];

function gw(routes: Parameters<typeof fakeFetch>[0], extra: Record<string, unknown> = {}) {
  const f = fakeFetch(routes);
  const g = createGateway({ env: testEnv, providers: testProviders(), fetch: f.fetch, logger: noopLogger, ...extra });
  return { g, f };
}

describe('router', () => {
  it('uses the first provider when it succeeds', async () => {
    const { g, f } = gw({ [P1]: () => completion('risposta', 'm1'), [P2]: () => completion('no') });
    const res = await g.chat({ messages: user });
    expect(res.choices[0]!.message.content).toBe('risposta');
    expect(res.x_gateway.provider).toBe('p1');
    expect(res.x_gateway.source).toBe('ai');
    expect(f.callsTo(P2)).toHaveLength(0);
    expect(f.calls[0]!.url).toBe('https://p1.test/v1/chat/completions');
    expect(f.calls[0]!.headers.authorization).toBe(`Bearer ${testEnv.P1_KEY}`);
    expect(res.usage?.total_tokens).toBe(15);
  });

  it('429 with Retry-After → fallback, then cooldown honours Retry-After', async () => {
    const clk = clock();
    const { g, f } = gw(
      { [P1]: (_b, n) => (n === 1 ? status(429, { 'retry-after': '120' }) : completion('p1 tornato')), [P2]: () => completion('da p2') },
      { health: { now: clk.now } },
    );
    const r1 = await g.chat({ messages: user });
    expect(r1.x_gateway.provider).toBe('p2');
    expect(r1.x_gateway.attempts[0]).toMatchObject({ provider: 'p1', outcome: 'error', errorKind: 'rate_limit', httpStatus: 429 });

    // Within Retry-After: p1 is skipped without being called.
    clk.advance(60_000);
    const r2 = await g.chat({ messages: user });
    expect(r2.x_gateway.provider).toBe('p2');
    expect(r2.x_gateway.attempts[0]).toMatchObject({ provider: 'p1', outcome: 'skipped', reason: 'cooldown' });
    expect(f.callsTo(P1)).toHaveLength(1);

    const h = await g.health();
    const p1 = h.providers.find((p) => p.id === 'p1')!;
    expect(p1.health?.state).toBe('open');
    expect(p1.health?.cooldownRemainingMs).toBe(60_000);

    // After Retry-After: p1 is tried again.
    clk.advance(61_000);
    const r3 = await g.chat({ messages: user });
    expect(r3.x_gateway.provider).toBe('p1');
  });

  it('timeout → fallback', async () => {
    const { g } = gw({ [P1]: () => 'hang', [P2]: () => completion('ok p2') });
    const res = await g.chat({ messages: user });
    expect(res.x_gateway.provider).toBe('p2');
    expect(res.x_gateway.attempts[0]).toMatchObject({ provider: 'p1', errorKind: 'timeout' });
  });

  it('5xx → fallback', async () => {
    const { g } = gw({ [P1]: () => status(503), [P2]: () => completion('ok p2') });
    const res = await g.chat({ messages: user });
    expect(res.x_gateway.provider).toBe('p2');
    expect(res.x_gateway.attempts[0]).toMatchObject({ errorKind: 'server_error', httpStatus: 503 });
  });

  it('network error → fallback', async () => {
    const { g } = gw({ [P1]: () => 'network_error', [P2]: () => completion('ok p2') });
    const res = await g.chat({ messages: user });
    expect(res.x_gateway.attempts[0]).toMatchObject({ errorKind: 'network' });
    expect(res.x_gateway.provider).toBe('p2');
  });

  it('401 → fallback and long cooldown (1h)', async () => {
    const clk = clock();
    const { g, f } = gw({ [P1]: () => status(401), [P2]: () => completion('ok p2') }, { health: { now: clk.now } });
    const res = await g.chat({ messages: user });
    expect(res.x_gateway.attempts[0]).toMatchObject({ errorKind: 'auth', httpStatus: 401 });
    clk.advance(30 * 60_000);
    await g.chat({ messages: user });
    expect(f.callsTo(P1)).toHaveLength(1);
  });

  it('invalid JSON → one corrective retry on same provider → next provider', async () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    const { g, f } = gw({ [P1]: () => completion('non è json'), [P2]: () => completion('{"ok": true}') });
    const res = await g.chat({
      messages: user,
      response_format: { type: 'json_schema', json_schema: { name: 'r', schema, strict: true } },
    });
    expect(f.callsTo(P1)).toHaveLength(2);
    // The retry carries the correction message.
    const retryMsgs = f.callsTo(P1)[1]!.body.messages as Array<{ role: string; content: string }>;
    expect(retryMsgs.at(-1)!.content).toMatch(/non e' valida/);
    expect(res.x_gateway.provider).toBe('p2');
    expect(JSON.parse(res.choices[0]!.message.content)).toEqual({ ok: true });
    expect(res.x_gateway.attempts[0]).toMatchObject({ provider: 'p1', errorKind: 'invalid_output' });
  });

  it('invalid JSON fixed by the corrective retry stays on the same provider', async () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
    const { g, f } = gw({ [P1]: (_b, n) => completion(n === 1 ? '{"ok": "sì"}' : '```json\n{"ok": false}\n```') });
    const res = await g.chat({ messages: user, response_format: { type: 'json_schema', json_schema: { name: 'r', schema } } });
    expect(res.x_gateway.provider).toBe('p1');
    expect(f.callsTo(P1)).toHaveLength(2);
    expect(res.choices[0]!.message.content).toBe('{"ok":false}');
  });

  it('requests structured output according to each provider capability', async () => {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    const { g, f } = gw({ [P1]: () => status(500), [P2]: () => status(500), [P3]: () => completion('{"ok":true}') });
    await g.chat({ messages: user, response_format: { type: 'json_schema', json_schema: { name: 'r', schema } } });
    const rf = (u: string) => f.callsTo(u)[0]!.body.response_format as { type: string } | undefined;
    expect(rf(P1)?.type).toBe('json_schema');
    expect(rf(P2)?.type).toBe('json_object');
    expect(rf(P3)).toBeUndefined();
    const p3msgs = f.callsTo(P3)[0]!.body.messages as Array<{ content: string }>;
    expect(p3msgs.at(-1)!.content).toContain('JSON Schema');
  });

  it('all providers down → chat 503, insights → rules', async () => {
    const { g } = gw({ [P1]: () => status(500), [P2]: () => status(429), [P3]: () => 'network_error' });
    await expect(g.chat({ messages: user })).rejects.toBeInstanceOf(AllProvidersFailedError);
    const ins = await g.insights(goodStats);
    expect(ins.source).toBe('rules');
    expect(ins.provider).toBeNull();
    expect(ins.insights.length).toBeGreaterThan(0);
  });

  it('insights from AI carry source/provider/model', async () => {
    const { g } = gw({ [P1]: () => completion(validInsightsJson, 'm1-real') });
    const ins = await g.insights(goodStats);
    expect(ins).toMatchObject({ source: 'ai', provider: 'p1', model: 'm1-real' });
    expect(ins.coverage).toMatchObject({ nightsWithData: 13, nightsInWindow: 14 });
  });

  it('provider without env var is skipped silently', async () => {
    const f = fakeFetch({ [P1]: () => completion('x'), [P2]: () => completion('da p2') });
    const g = createGateway({ env: { P2_KEY: 'k2-xxxxxxxxxxxx' }, providers: testProviders(), fetch: f.fetch, logger: noopLogger });
    const res = await g.chat({ messages: user });
    expect(res.x_gateway.provider).toBe('p2');
    expect(res.x_gateway.attempts.map((a) => a.provider)).toEqual(['p2']);
    expect(f.callsTo(P1)).toHaveLength(0);
    expect(g.config.warnings).toEqual([]);
    expect(g.config.all.find((p) => p.id === 'p1')).toMatchObject({ configured: false, reason: 'missing_env' });
  });

  it('works with the default config and ONLY GROQ_API_KEY set (Groq 120b → 20b → rules)', async () => {
    const GROQ = 'https://api.groq.com/openai/v1';
    const f = fakeFetch({
      [GROQ]: (body) => (body.model === 'openai/gpt-oss-120b' ? status(429, { 'retry-after': '5' }) : completion(validInsightsJson, String(body.model))),
    });
    const g = createGateway({ env: { GROQ_API_KEY: 'gsk_test_only' }, fetch: f.fetch, logger: noopLogger });
    expect(g.config.providers.map((p) => p.id)).toEqual(['groq-gpt-oss-120b', 'groq-gpt-oss-20b']);
    const ins = await g.insights(goodStats);
    expect(ins).toMatchObject({ source: 'ai', provider: 'groq-gpt-oss-20b', model: 'openai/gpt-oss-20b' });
    expect(f.calls.every((c) => c.url.startsWith(GROQ))).toBe(true);
    expect(f.calls[0]!.body.reasoning_effort).toBe('low');

    const down = createGateway({ env: { GROQ_API_KEY: 'gsk_test_only' }, fetch: fakeFetch({ [GROQ]: () => status(503) }).fetch, logger: noopLogger });
    const r = await down.insights(goodStats);
    expect(r.source).toBe('rules');
    expect(r.x_gateway.attempts.map((a) => a.provider)).toEqual(['groq-gpt-oss-120b', 'groq-gpt-oss-20b']);
  });

  it('no provider configured at all → rules without network calls', async () => {
    const f = fakeFetch({});
    const g = createGateway({ env: {}, fetch: f.fetch, logger: noopLogger });
    const r = await g.insights(goodStats);
    expect(r.source).toBe('rules');
    expect(f.calls).toHaveLength(0);
    expect((await g.health()).status).toBe('rules_only');
  });

  it('pins a provider with model=<id>', async () => {
    const { g, f } = gw({ [P1]: () => completion('p1'), [P2]: () => completion('p2') });
    const res = await g.chat({ model: 'p2', messages: user });
    expect(res.x_gateway.provider).toBe('p2');
    expect(f.callsTo(P1)).toHaveLength(0);
    await expect(g.chat({ model: 'sconosciuto', messages: user })).rejects.toMatchObject({ status: 400 });
  });

  it('logs only metadata, never prompt content', async () => {
    const events: GatewayLogEvent[] = [];
    const f = fakeFetch({ [P1]: () => status(500), [P2]: () => completion('risposta segreta') });
    const g = createGateway({ env: testEnv, providers: testProviders(), fetch: f.fetch, logger: { log: (e) => void events.push(e) } });
    await g.chat({ messages: [{ role: 'user', content: 'contenuto sanitario riservato' }] });
    const dump = JSON.stringify(events);
    expect(dump).not.toContain('contenuto sanitario');
    expect(dump).not.toContain('risposta segreta');
    expect(events.map((e) => e.outcome)).toEqual(['error', 'success']);
    expect(events[1]).toMatchObject({ provider_id: 'p2', total_tokens: 15 });
    expect(typeof events[1]!.latency_ms).toBe('number');
  });

  it('a logger that throws does not break the request', async () => {
    const f = fakeFetch({ [P1]: () => completion('ok') });
    const g = createGateway({ env: testEnv, providers: testProviders(), fetch: f.fetch, logger: { log: () => { throw new Error('db down'); } } });
    await expect(g.chat({ messages: user })).resolves.toBeTruthy();
  });
});
