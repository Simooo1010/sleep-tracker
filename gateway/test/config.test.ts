import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultProviderEntries, loadConfig } from '../src/config.ts';
import { createGateway } from '../src/gateway.ts';
import { noopLogger } from '../src/log.ts';
import { completion, fakeFetch, goodStats, status, validInsightsJson } from './helpers.ts';

const CONFIG_PATH = fileURLToPath(new URL('../providers.config.json', import.meta.url));

describe('config', () => {
  it('default config: initial chain order, excluded providers disabled with a note', () => {
    const all = loadConfig({ env: {} }).all;
    expect(all.map((p) => p.id)).toEqual([
      'groq-gpt-oss-120b',
      'groq-gpt-oss-20b',
      'mistral-small',
      'openrouter-gemma-4-31b',
      'openrouter-nemotron-3-super',
      'gemini-flash',
      'cerebras',
      'github-models',
    ]);
    for (const id of ['mistral-small', 'gemini-flash', 'cerebras', 'github-models']) {
      const p = all.find((x) => x.id === id)!;
      expect(p.enabled).toBe(false);
      expect(p.note).toBeTruthy();
    }
    expect(loadConfig({ env: {} }).warnings).toEqual([]);
  });

  it('enabled + env set = usable; sorted by priority', () => {
    const cfg = loadConfig({ env: { GROQ_API_KEY: 'g', OPENROUTER_API_KEY: 'o', MISTRAL_API_KEY: 'm' } });
    expect(cfg.providers.map((p) => p.id)).toEqual([
      'groq-gpt-oss-120b',
      'groq-gpt-oss-20b',
      'openrouter-gemma-4-31b',
      'openrouter-nemotron-3-super',
    ]);
  });

  it('NEW PROVIDER VIA CONFIG ONLY: append an entry to a copy of providers.config.json, no code changes', async () => {
    // Simulates the user editing the JSON file: copy it, add one entry, load it.
    const dir = await mkdtemp(join(tmpdir(), 'gw-cfg-'));
    const file = JSON.parse(await readFile(CONFIG_PATH, 'utf8')) as { providers: unknown[] };
    file.providers.push({
      id: 'nuovo-provider',
      label: 'Nuovo provider di prova',
      baseUrl: 'https://api.nuovo.test/v1',
      apiKeyEnv: 'NUOVO_API_KEY',
      model: 'nuovo/modello-free',
      enabled: true,
      priority: 15, // between Groq 120b and 20b
      structuredOutput: 'json_object',
      timeoutMs: 5000,
    });
    const copy = join(dir, 'providers.config.json');
    await writeFile(copy, JSON.stringify(file, null, 2));
    const entries = (JSON.parse(await readFile(copy, 'utf8')) as { providers: unknown[] }).providers;

    const f = fakeFetch({
      'https://api.groq.com/openai/v1': () => status(429),
      'https://api.nuovo.test/v1': () => completion(validInsightsJson, 'nuovo/modello-free'),
    });
    const g = createGateway({
      env: { GROQ_API_KEY: 'g', NUOVO_API_KEY: 'n-key' },
      providers: entries,
      fetch: f.fetch,
      logger: noopLogger,
    });
    expect(g.config.providers.map((p) => p.id)).toEqual(['groq-gpt-oss-120b', 'nuovo-provider', 'groq-gpt-oss-20b']);
    const ins = await g.insights(goodStats);
    expect(ins).toMatchObject({ source: 'ai', provider: 'nuovo-provider' });
    const call = f.callsTo('https://api.nuovo.test/v1')[0]!;
    expect(call.headers.authorization).toBe('Bearer n-key');
    expect((call.body.response_format as { type: string }).type).toBe('json_object');
  });

  it('GATEWAY_PROVIDERS_JSON (array) merges by id and appends new providers', async () => {
    const override = JSON.stringify([
      { id: 'groq-gpt-oss-120b', model: 'openai/gpt-oss-120b-v2' },
      { id: 'extra', baseUrl: 'https://extra.test/v1', apiKeyEnv: 'EXTRA_KEY', model: 'x', priority: 5 },
    ]);
    const cfg = loadConfig({ env: { GROQ_API_KEY: 'g', EXTRA_KEY: 'e', GATEWAY_PROVIDERS_JSON: override } });
    expect(cfg.providers.map((p) => p.id)).toEqual(['extra', 'groq-gpt-oss-120b', 'groq-gpt-oss-20b']);
    expect(cfg.providers[1]!.model).toBe('openai/gpt-oss-120b-v2');
    expect(cfg.providers[1]!.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(cfg.providers[0]!.structuredOutput).toBe('prompt'); // safe default
  });

  it('GATEWAY_PROVIDERS_JSON can enable a disabled provider (e.g. Mistral) without code', () => {
    const override = JSON.stringify([{ id: 'mistral-small', enabled: true }]);
    const cfg = loadConfig({ env: { MISTRAL_API_KEY: 'm', GATEWAY_PROVIDERS_JSON: override } });
    expect(cfg.providers.map((p) => p.id)).toEqual(['mistral-small']);
  });

  it('GATEWAY_PROVIDERS_JSON replace mode', async () => {
    const override = JSON.stringify({
      mode: 'replace',
      providers: [{ id: 'solo', baseUrl: 'https://solo.test/v1', apiKeyEnv: 'SOLO_KEY', model: 's', supportsJsonSchema: true }],
    });
    const env = { GROQ_API_KEY: 'g', SOLO_KEY: 's', GATEWAY_PROVIDERS_JSON: override };
    const cfg = loadConfig({ env });
    expect(cfg.providers.map((p) => p.id)).toEqual(['solo']);
    expect(cfg.providers[0]!.structuredOutput).toBe('json_schema');

    const f = fakeFetch({ 'https://solo.test/v1': () => completion('ciao') });
    const g = createGateway({ env, fetch: f.fetch, logger: noopLogger });
    expect((await g.chat({ messages: [{ role: 'user', content: 'x' }] })).x_gateway.provider).toBe('solo');
  });

  it('invalid override or invalid entries become warnings, never crashes', () => {
    const bad = loadConfig({ env: { GROQ_API_KEY: 'g', GATEWAY_PROVIDERS_JSON: '{not json' } });
    expect(bad.providers.length).toBe(2);
    expect(bad.warnings[0]).toMatch(/non e' JSON valido/);

    const invalid = loadConfig({
      env: { K: 'k' },
      entries: [{ id: 'senza-url', apiKeyEnv: 'K', model: 'm' }, { id: 'ok', baseUrl: 'https://ok.test', apiKeyEnv: 'K', model: 'm' }],
    });
    expect(invalid.providers.map((p) => p.id)).toEqual(['ok']);
    expect(invalid.warnings[0]).toMatch(/senza-url/);
  });

  it('default entries are exported and unchanged by loading', () => {
    const before = JSON.stringify(defaultProviderEntries);
    loadConfig({ env: { GATEWAY_PROVIDERS_JSON: JSON.stringify([{ id: 'groq-gpt-oss-120b', model: 'changed' }]) } });
    expect(JSON.stringify(defaultProviderEntries)).toBe(before);
  });
});
