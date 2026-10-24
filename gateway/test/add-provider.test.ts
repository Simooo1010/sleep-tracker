import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { noopLogger } from '../src/log.ts';
import { addProvider, parseArgs } from '../src/tools/add-provider.ts';
import { completion, fakeFetch, goodStats, status, validInsightsJson } from './helpers.ts';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = join(ROOT, 'providers.config.json');

async function tempConfig() {
  const dir = await mkdtemp(join(tmpdir(), 'gw-add-'));
  const path = join(dir, 'providers.config.json');
  await copyFile(CONFIG, path);
  return path;
}

const readProviders = async (p: string) => (JSON.parse(await readFile(p, 'utf8')) as { providers: Array<Record<string, unknown>> }).providers;

describe('add-provider', () => {
  it('parses CLI arguments', () => {
    const a = parseArgs(['--id', 'x', '--baseUrl=https://x.test/v1', '--model', 'm', '--env', 'X_KEY', '--header', 'X-Title: app', '--rpm', '10', '--no-test']);
    expect(a).toMatchObject({ id: 'x', baseUrl: 'https://x.test/v1', model: 'm', env: 'X_KEY', headers: { 'X-Title': 'app' }, rpm: 10, test: false, structured: 'auto' });
    expect(() => parseArgs(['--id', 'x'])).toThrow(/--baseUrl, --model, --env/);
    expect(() => parseArgs(['--id', 'x', '--baseUrl', 'https://x', '--model', 'm', '--env', 'X', '--structured', 'boh'])).toThrow(/structured/);
  });

  it('adds the entry, probes with the real call and auto-detects the structured mode', async () => {
    const path = await tempConfig();
    // json_schema unsupported (400) → json_object works.
    const f = fakeFetch({
      'https://nuovo.test/v1': (body) =>
        (body.response_format as { type?: string } | undefined)?.type === 'json_schema' ? status(400) : completion('{"ok":true,"word":"ciao"}', 'nuovo-m'),
    });
    const args = parseArgs(['--id', 'nuovo', '--baseUrl', 'https://nuovo.test/v1', '--model', 'nuovo-m', '--env', 'NUOVO_KEY']);
    const r = await addProvider(args, { configPath: path, env: { NUOVO_KEY: 'k' }, fetch: f.fetch });
    expect(r.probe).toMatchObject({ status: 'ok', structured: 'json_object', model: 'nuovo-m' });

    const providers = await readProviders(path);
    const entry = providers.at(-1)!;
    expect(entry).toMatchObject({ id: 'nuovo', apiKeyEnv: 'NUOVO_KEY', enabled: true, structuredOutput: 'json_object' });
    // Default priority: right after the last enabled provider (openrouter-nemotron = 50).
    expect(entry.priority).toBe(60);
    expect(JSON.stringify(providers)).not.toContain('"k"'); // never writes the key

    // The new provider is used by the gateway straight from the file, no code changes.
    const g = createGateway({
      env: { GROQ_API_KEY: 'g', NUOVO_KEY: 'k' },
      providers,
      fetch: fakeFetch({ 'https://api.groq.com/openai/v1': () => status(503), 'https://nuovo.test/v1': () => completion(validInsightsJson) }).fetch,
      logger: noopLogger,
    });
    expect((await g.insights(goodStats)).provider).toBe('nuovo');
  });

  it('without the env var: entry written, probe skipped, provider ignored by the router', async () => {
    const path = await tempConfig();
    const args = parseArgs(['--id', 'senza-chiave', '--baseUrl', 'https://sk.test/v1', '--model', 'm', '--env', 'SK_KEY', '--priority', '5']);
    const r = await addProvider(args, { configPath: path, env: {} });
    expect(r.probe.status).toBe('skipped_no_env');
    expect(r.entry.structuredOutput).toBe('prompt');
    const g = createGateway({ env: { GROQ_API_KEY: 'g' }, providers: await readProviders(path), logger: noopLogger });
    expect(g.config.providers[0]!.id).toBe('groq-gpt-oss-120b');
    expect(g.config.all.find((p) => p.id === 'senza-chiave')).toMatchObject({ reason: 'missing_env' });
  });

  it('refuses duplicate ids unless --replace; reports failed probes', async () => {
    const path = await tempConfig();
    const dup = parseArgs(['--id', 'groq-gpt-oss-20b', '--baseUrl', 'https://x.test/v1', '--model', 'm', '--env', 'X_KEY', '--no-test']);
    await expect(addProvider(dup, { configPath: path, env: {} })).rejects.toThrow(/--replace/);

    const rep = parseArgs(['--id', 'groq-gpt-oss-20b', '--baseUrl', 'https://x.test/v1', '--model', 'm', '--env', 'X_KEY', '--replace']);
    const f = fakeFetch({ 'https://x.test/v1': () => status(401) });
    const r = await addProvider(rep, { configPath: path, env: { X_KEY: 'bad' }, fetch: f.fetch });
    expect(r.probe).toMatchObject({ status: 'failed', error: 'auth (HTTP 401)' });
    expect(f.calls).toHaveLength(1); // auth failure: no point trying other modes
    const providers = await readProviders(path);
    expect(providers.filter((p) => p.id === 'groq-gpt-oss-20b')).toHaveLength(1);
  });

  it('CLI script works end-to-end (npm run add-provider)', async () => {
    const path = await tempConfig();
    const { stdout } = await run(
      process.execPath,
      ['scripts/add-provider.ts', '--id', 'cli-prov', '--baseUrl', 'https://cli.test/v1', '--model', 'cli/m:free', '--env', 'CLI_KEY', '--config', path],
      { cwd: ROOT, env: { PATH: process.env.PATH ?? '' } },
    );
    expect(stdout).toContain('Voce "cli-prov" scritta');
    expect(stdout).toContain('CLI_KEY non e\' impostata');
    expect((await readProviders(path)).at(-1)).toMatchObject({ id: 'cli-prov', model: 'cli/m:free' });

    await expect(run(process.execPath, ['scripts/add-provider.ts', '--id', 'x'], { cwd: ROOT })).rejects.toMatchObject({ code: 2 });
  });
});
