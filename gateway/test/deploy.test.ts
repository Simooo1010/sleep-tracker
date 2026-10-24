// Deploy-shaped tests: Vercel entry (rewrite normalization, single instance), opt-in Supabase
// logging, and a REAL end-to-end run of scripts/dev-server.ts as a child process configured only
// via env (GATEWAY_PROVIDERS_JSON) against local fake upstream HTTP servers.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVercelHandler, normalizeGatewayRequest } from '../src/http/vercel.ts';
import { consoleLogger, loggerFromEnv, noopLogger } from '../src/log.ts';
import type { FetchLike } from '../src/types.ts';
import { goodStats, validInsightsJson } from './helpers.ts';

const SECRET = 'deploy-secret-0123456789abcdef';
const auth = { authorization: `Bearer ${SECRET}` };

describe('vercel entry', () => {
  it('maps the rewritten URL (/api/gateway?route=...) to /v1/...', async () => {
    const r = normalizeGatewayRequest(
      new Request('https://gw.test/api/gateway?route=chat/completions&x=1', { method: 'POST', headers: auth, body: '{"a":1}' }),
    );
    expect(new URL(r.url).pathname).toBe('/v1/chat/completions');
    expect(new URL(r.url).searchParams.get('route')).toBeNull();
    expect(new URL(r.url).searchParams.get('x')).toBe('1');
    expect(r.method).toBe('POST');
    expect(r.headers.get('authorization')).toBe(auth.authorization);
    expect(await r.text()).toBe('{"a":1}');
  });

  it('leaves original /v1 URLs untouched and ignores bad route values', () => {
    const orig = new Request('https://gw.test/v1/health?route=insights');
    expect(normalizeGatewayRequest(orig)).toBe(orig);
    for (const bad of ['../etc', 'a b', '']) {
      const r = new Request(`https://gw.test/api/gateway?route=${encodeURIComponent(bad)}`);
      expect(normalizeGatewayRequest(r)).toBe(r);
    }
  });

  it('serves all endpoints from ONE handler instance (shared health state)', async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
      calls++;
      return new Response('{"error":"rate"}', { status: 429, headers: { 'retry-after': '60' } });
    };
    const h = createVercelHandler({
      env: { GATEWAY_SECRET: SECRET, K: 'k' },
      providers: [{ id: 'only', baseUrl: 'https://only.test/v1', apiKeyEnv: 'K', model: 'm', structuredOutput: 'json_object' }],
      fetch,
      logger: noopLogger,
    });
    const ins = await h(new Request('https://gw.test/api/gateway?route=insights', { method: 'POST', headers: auth, body: JSON.stringify(goodStats) }));
    expect(ins.status).toBe(200);
    expect(await ins.json()).toMatchObject({ source: 'rules' });
    const health = await (await h(new Request('https://gw.test/api/gateway?route=health', { headers: auth }))).json();
    expect(health.providers[0].health.state).not.toBe('closed');
    expect(health.providers[0].health.cooldownRemainingMs).toBeGreaterThan(0);
    expect(calls).toBe(1);
  });
});

describe('supabase logging is opt-in', () => {
  it('without SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: console only, no network call', async () => {
    let calls = 0;
    const f: FetchLike = async () => {
      calls++;
      return new Response(null, { status: 201 });
    };
    for (const env of [{}, { SUPABASE_URL: 'https://x.supabase.co' }, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, { SUPABASE_URL: ' ', SUPABASE_SERVICE_ROLE_KEY: ' ' }]) {
      const logger = loggerFromEnv(env, f);
      expect(logger).toBe(consoleLogger);
    }
    expect(loggerFromEnv({ GATEWAY_LOG: 'off', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }, f)).toBe(noopLogger);
    expect(calls).toBe(0);
  });

  it('with both set: inserts metadata into ai_gateway_log', async () => {
    const seen: string[] = [];
    const f: FetchLike = async (input, init) => {
      seen.push(`${String(input)} ${new Headers(init?.headers).get('apikey')}`);
      return new Response(null, { status: 201 });
    };
    const logger = loggerFromEnv({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'srk' }, f);
    const info = console.info;
    console.info = () => {};
    try {
      await logger.log({ request_id: 'r', endpoint: 'chat', provider_id: 'p', model: 'm', attempt: 1, outcome: 'success' });
    } finally {
      console.info = info;
    }
    expect(seen).toEqual(['https://x.supabase.co/rest/v1/ai_gateway_log srk']);
  });
});

describe('real dev server (child process) + fake upstream HTTP providers via GATEWAY_PROVIDERS_JSON', () => {
  let up429: Server;
  let upOk: Server;
  let child: ChildProcess;
  let base = '';
  const upstreamLog: string[] = [];

  const listen = (srv: Server) =>
    new Promise<string>((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`)));

  beforeAll(async () => {
    up429 = createServer((req, res) => {
      upstreamLog.push(`429 ${req.method} ${req.url}`);
      req.resume();
      res.writeHead(429, { 'retry-after': '60', 'content-type': 'application/json' }).end('{"error":"rate"}');
    });
    upOk = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const { model } = JSON.parse(body) as { model: string };
        upstreamLog.push(`ok ${req.method} ${req.url} ${model} ${req.headers.authorization}`);
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ model, choices: [{ message: { role: 'assistant', content: validInsightsJson }, finish_reason: 'stop' }] }),
        );
      });
    });
    const [u1, u2] = await Promise.all([listen(up429), listen(upOk)]);

    const providers = {
      mode: 'replace',
      providers: [
        { id: 'fake-429', baseUrl: u1, apiKeyEnv: 'FAKE_KEY_1', model: 'm429', priority: 1, structuredOutput: 'json_schema' },
        { id: 'fake-ok', baseUrl: u2, apiKeyEnv: 'FAKE_KEY_2', model: 'mok', priority: 2, structuredOutput: 'json_object' },
      ],
    };
    const script = fileURLToPath(new URL('../scripts/dev-server.ts', import.meta.url));
    child = spawn(process.execPath, [script], {
      env: {
        PATH: process.env.PATH ?? '',
        PORT: '0',
        GATEWAY_SECRET: SECRET,
        GATEWAY_LOG: 'off',
        FAKE_KEY_1: 'fake-key-1',
        FAKE_KEY_2: 'fake-key-2',
        GATEWAY_PROVIDERS_JSON: JSON.stringify(providers),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise<string>((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`dev server did not start: ${out}`)), 10_000);
      const onData = (c: Buffer) => {
        out += c.toString();
        const m = /listening on (http:\/\/\S+)/.exec(out);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]!);
        }
      };
      child.stdout!.on('data', onData);
      child.stderr!.on('data', onData);
      child.once('exit', (code) => reject(new Error(`dev server exited (${code}): ${out}`)));
    });
  });

  afterAll(() => {
    child?.kill('SIGTERM');
    up429?.close();
    upOk?.close();
  });

  it('health: 401 without bearer, 200 with bearer and no secrets', async () => {
    expect((await fetch(`${base}/v1/health`)).status).toBe(401);
    const res = await fetch(`${base}/v1/health`, { headers: auth });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('fake-key-');
    expect(JSON.parse(text).providers.map((p: { id: string }) => p.id)).toEqual(['fake-429', 'fake-ok']);
  });

  it('chat completions: 429 upstream → fallback to the second provider', async () => {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'ciao' }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('chat.completion');
    expect(body.x_gateway).toMatchObject({ provider: 'fake-ok', model: 'mok', source: 'ai' });
    expect(body.x_gateway.attempts[0]).toMatchObject({ provider: 'fake-429', outcome: 'error' });
    expect(upstreamLog).toEqual(['429 POST /v1/chat/completions', 'ok POST /v1/chat/completions mok Bearer fake-key-2']);
  });

  it('insights: the 429 provider is now in cooldown (same instance) and is skipped', async () => {
    const res = await fetch(`${base}/v1/insights`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(goodStats),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ source: 'ai', provider: 'fake-ok' });
    expect(body.x_gateway.attempts[0]).toMatchObject({ provider: 'fake-429', outcome: 'skipped', reason: 'cooldown' });
    expect(upstreamLog.filter((l) => l.startsWith('429'))).toHaveLength(1);
  });

  it('rewritten form /api/gateway?route=health works too', async () => {
    const res = await fetch(`${base}/api/gateway?route=health`, { headers: auth });
    expect(res.status).toBe(200);
    expect((await res.json()).providers[0].health.state).not.toBe('closed');
  });
});
