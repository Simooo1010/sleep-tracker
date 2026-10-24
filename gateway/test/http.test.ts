import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHandler } from '../src/http/handler.ts';
import { timingSafeEqualStr } from '../src/http/auth.ts';
import { noopLogger } from '../src/log.ts';
import { completion, fakeFetch, goodStats, status, testEnv, testProviders, validInsightsJson } from './helpers.ts';

const SECRET = 'gateway-secret-0123456789abcdef';
const BASE = 'https://gw.test/api/ai';

function req(path: string, init: RequestInit & { token?: string | null } = {}) {
  const { token = SECRET, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token !== null) headers.set('authorization', `Bearer ${token}`);
  if (rest.body) headers.set('content-type', 'application/json');
  return new Request(`${BASE}${path}`, { ...rest, headers });
}

function handler(routes: Parameters<typeof fakeFetch>[0] = {}, extra: Record<string, unknown> = {}) {
  const f = fakeFetch(routes);
  const h = createHandler({ env: { ...testEnv, GATEWAY_SECRET: SECRET }, providers: testProviders(), fetch: f.fetch, logger: noopLogger, ...extra });
  return { h, f };
}

describe('http handler', () => {
  it('rejects missing or wrong bearer with 401', async () => {
    const { h } = handler();
    expect((await h(req('/v1/health', { token: null }))).status).toBe(401);
    expect((await h(req('/v1/health', { token: 'sbagliato' }))).status).toBe(401);
    expect((await h(req('/v1/health', { token: `${SECRET}x` }))).status).toBe(401);
    const ok = await h(req('/v1/health'));
    expect(ok.status).toBe(200);
  });

  it('fails closed when GATEWAY_SECRET is missing or too short', async () => {
    const h = createHandler({ env: { ...testEnv }, providers: testProviders(), logger: noopLogger });
    expect((await h(req('/v1/health'))).status).toBe(500);
    const h2 = createHandler({ env: { GATEWAY_SECRET: 'short' }, logger: noopLogger });
    expect((await h2(req('/v1/health', { token: 'short' }))).status).toBe(500);
  });

  it('constant-time compare works', async () => {
    expect(await timingSafeEqualStr('abc', 'abc')).toBe(true);
    expect(await timingSafeEqualStr('abc', 'abd')).toBe(false);
    expect(await timingSafeEqualStr('abc', 'abcd')).toBe(false);
  });

  it('health shows configured/cooldown status but never secrets', async () => {
    const { h } = handler({ 'https://p1.test/v1': () => status(429, { 'retry-after': '300' }), 'https://p2.test/v1': () => completion('ok') });
    await h(req('/v1/chat/completions', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) }));
    const res = await h(req('/v1/health'));
    const text = await res.text();
    for (const v of [...Object.values(testEnv), SECRET]) expect(text).not.toContain(v);
    const body = JSON.parse(text);
    expect(body.status).toBe('ok');
    expect(body.rulesFallback).toBe(true);
    const p1 = body.providers.find((p: { id: string }) => p.id === 'p1');
    expect(p1).toMatchObject({ configured: true, enabled: true, apiKeyEnv: 'P1_KEY' });
    expect(p1.health.state).toBe('open');
    expect(p1.health.lastErrorKind).toBe('rate_limit');
    expect(p1.health.cooldownRemainingMs).toBeGreaterThan(290_000);
  });

  it('POST /v1/chat/completions (OpenAI-compatible, response_format)', async () => {
    const { h, f } = handler({ 'https://p1.test/v1': () => completion('{"ok":true}', 'm1') });
    const res = await h(
      req('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: 'auto',
          messages: [{ role: 'user', content: 'dimmi ok' }],
          response_format: { type: 'json_schema', json_schema: { name: 'r', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } } },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.content).toBe('{"ok":true}');
    expect(body.x_gateway.provider).toBe('p1');
    expect(f.calls[0]!.body.model).toBe('m1');
  });

  it('chat: validation errors, stream not supported, 503 when all fail', async () => {
    const { h } = handler({ 'https://p1.test/v1': () => status(500), 'https://p2.test/v1': () => status(500), 'https://p3.test/v1': () => status(500) });
    expect((await h(req('/v1/chat/completions', { method: 'POST', body: '{"messages": []}' }))).status).toBe(400);
    expect((await h(req('/v1/chat/completions', { method: 'POST', body: 'non json' }))).status).toBe(400);
    expect((await h(req('/v1/chat/completions', { method: 'POST', body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'x' }] }) }))).status).toBe(400);
    const res = await h(req('/v1/chat/completions', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }) }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('all_providers_failed');
    expect(body.error.attempts).toHaveLength(3);
  });

  it('POST /v1/insights → ai, and rules when providers are down', async () => {
    const { h } = handler({ 'https://p1.test/v1': () => completion(validInsightsJson) });
    const res = await h(req('/v1/insights', { method: 'POST', body: JSON.stringify(goodStats) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ source: 'ai', provider: 'p1' });

    const down = handler({ 'https://p1.test/v1': () => status(500), 'https://p2.test/v1': () => status(500), 'https://p3.test/v1': () => status(500) });
    const r2 = await down.h(req('/v1/insights', { method: 'POST', body: JSON.stringify(goodStats) }));
    expect(r2.status).toBe(200);
    expect(await r2.json()).toMatchObject({ source: 'rules', provider: null });

    const bad = await down.h(req('/v1/insights', { method: 'POST', body: JSON.stringify({ ...goodStats, email: 'a@b.it' }) }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('privacy_violation');
  });

  it('wrong method / unknown path', async () => {
    const { h } = handler();
    expect((await h(req('/v1/health', { method: 'POST', body: '{}' }))).status).toBe(405);
    expect((await h(req('/v1/insights'))).status).toBe(405);
    expect((await h(req('/v1/altro'))).status).toBe(404);
  });

  it('rate limits per client IP', async () => {
    const { h } = handler({}, { rateLimitPerMinute: 3 });
    const mk = () => req('/v1/health', { headers: { 'x-forwarded-for': '1.2.3.4' } });
    for (let i = 0; i < 3; i++) expect((await h(mk())).status).toBe(200);
    const limited = await h(mk());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await h(req('/v1/health', { headers: { 'x-forwarded-for': '5.6.7.8' } }))).status).toBe(200);
  });
});

describe('end-to-end with real local HTTP provider servers (native fetch)', () => {
  let s1: Server;
  let s2: Server;
  let url1 = '';
  let url2 = '';
  const seen: string[] = [];

  beforeAll(async () => {
    const listen = (srv: Server) => new Promise<string>((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`)));
    s1 = createServer((req, res) => {
      seen.push(`s1 ${req.method} ${req.url} ${req.headers.authorization}`);
      res.writeHead(429, { 'retry-after': '60', 'content-type': 'application/json' }).end('{"error":"rate"}');
    });
    s2 = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body) as { model: string };
        seen.push(`s2 ${req.method} ${req.url} ${parsed.model}`);
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ model: parsed.model, choices: [{ message: { role: 'assistant', content: validInsightsJson }, finish_reason: 'stop' }] }),
        );
      });
    });
    url1 = await listen(s1);
    url2 = await listen(s2);
  });

  afterAll(() => {
    s1.close();
    s2.close();
  });

  it('429 on the first server → second server answers, via the HTTP handler', async () => {
    const h = createHandler({
      env: { GATEWAY_SECRET: SECRET, K1: 'local-key-1', K2: 'local-key-2' },
      providers: [
        { id: 'local1', baseUrl: url1, apiKeyEnv: 'K1', model: 'lm1', priority: 1, structuredOutput: 'json_schema' },
        { id: 'local2', baseUrl: url2, apiKeyEnv: 'K2', model: 'lm2', priority: 2, structuredOutput: 'json_object' },
      ],
      logger: noopLogger,
    });
    const res = await h(req('/v1/insights', { method: 'POST', body: JSON.stringify(goodStats) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ source: 'ai', provider: 'local2', model: 'lm2' });
    expect(seen).toEqual(['s1 POST /v1/chat/completions Bearer local-key-1', 's2 POST /v1/chat/completions lm2']);
  });
});
