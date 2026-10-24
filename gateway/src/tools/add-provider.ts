// Core of `npm run add-provider`: appends a provider entry to providers.config.json
// and (if its env var is set) verifies it with a real test call, auto-detecting
// the best structured-output mode (json_schema → json_object → prompt).
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { providerConfigSchema, structuredOutputModes, type StructuredOutputMode } from '../config.ts';
import { createGateway } from '../gateway.ts';
import { noopLogger } from '../log.ts';
import type { Env, FetchLike } from '../types.ts';

export interface AddProviderArgs {
  id: string;
  baseUrl: string;
  model: string;
  env: string;
  label?: string;
  priority?: number;
  structured: StructuredOutputMode | 'auto';
  timeoutMs?: number;
  rpm?: number;
  rpd?: number;
  headers: Record<string, string>;
  disabled: boolean;
  replace: boolean;
  test: boolean;
  config?: string;
}

export const USAGE = `Uso:
  npm run add-provider -- --id <id> --baseUrl <url> --model <modello> --env <NOME_ENV> [opzioni]

Opzioni:
  --label <testo>          nome leggibile
  --priority <n>           ordine (piu' basso = prima); default: dopo l'ultimo provider attivo
  --structured <modo>      auto | json_schema | json_object | prompt (default auto)
  --timeout <ms>           timeout richiesta (default 20000)
  --rpm <n> --rpd <n>      limiti locali opzionali
  --header "Nome: valore"  header extra (ripetibile)
  --disabled               aggiunge la voce disattivata
  --replace                sostituisce una voce con lo stesso id
  --no-test                non esegue la chiamata di prova
  --config <path>          file di config (default providers.config.json)`;

export function parseArgs(argv: string[]): AddProviderArgs {
  const map = new Map<string, string[]>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (!a.startsWith('--')) throw new Error(`argomento non riconosciuto: ${a}`);
    const [rawKey, inline] = a.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    if (['disabled', 'replace', 'no-test', 'help'].includes(rawKey)) {
      flags.add(rawKey);
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`manca il valore per --${rawKey}`);
    map.set(rawKey, [...(map.get(rawKey) ?? []), value]);
  }
  if (flags.has('help')) throw new Error(USAGE);
  const one = (k: string) => map.get(k)?.at(-1);
  const num = (k: string) => (one(k) !== undefined ? Number(one(k)) : undefined);
  const required = ['id', 'baseUrl', 'model', 'env'].filter((k) => !one(k));
  if (required.length) throw new Error(`parametri mancanti: ${required.map((k) => `--${k}`).join(', ')}\n\n${USAGE}`);
  const structured = (one('structured') ?? 'auto') as AddProviderArgs['structured'];
  if (structured !== 'auto' && !structuredOutputModes.includes(structured)) {
    throw new Error(`--structured non valido: ${structured}`);
  }
  const headers: Record<string, string> = {};
  for (const h of map.get('header') ?? []) {
    const idx = h.indexOf(':');
    if (idx <= 0) throw new Error(`--header non valido (atteso "Nome: valore"): ${h}`);
    headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
  }
  const out: AddProviderArgs = {
    id: one('id')!,
    baseUrl: one('baseUrl')!,
    model: one('model')!,
    env: one('env')!,
    structured,
    headers,
    disabled: flags.has('disabled'),
    replace: flags.has('replace'),
    test: !flags.has('no-test'),
  };
  const label = one('label');
  if (label) out.label = label;
  const config = one('config');
  if (config) out.config = config;
  const priority = num('priority');
  if (priority !== undefined) out.priority = priority;
  const timeoutMs = num('timeout');
  if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
  const rpm = num('rpm');
  if (rpm !== undefined) out.rpm = rpm;
  const rpd = num('rpd');
  if (rpd !== undefined) out.rpd = rpd;
  return out;
}

type RawEntry = Record<string, unknown>;

export function buildEntry(args: AddProviderArgs, existing: RawEntry[], structured: StructuredOutputMode): RawEntry {
  const enabledPriorities = existing
    .filter((e) => e.enabled !== false && typeof e.priority === 'number')
    .map((e) => e.priority as number);
  const priority = args.priority ?? (enabledPriorities.length ? Math.max(...enabledPriorities) + 10 : 10);
  const entry: RawEntry = {
    id: args.id,
    label: args.label ?? args.id,
    baseUrl: args.baseUrl,
    apiKeyEnv: args.env,
    model: args.model,
    enabled: !args.disabled,
    priority,
    structuredOutput: structured,
    timeoutMs: args.timeoutMs ?? 20000,
  };
  if (args.rpm !== undefined || args.rpd !== undefined) {
    entry.limits = { ...(args.rpm !== undefined ? { rpm: args.rpm } : {}), ...(args.rpd !== undefined ? { rpd: args.rpd } : {}) };
  }
  if (Object.keys(args.headers).length) entry.extraHeaders = args.headers;
  const check = providerConfigSchema.safeParse(entry);
  if (!check.success) {
    throw new Error(`voce non valida: ${check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return entry;
}

export interface ProbeResult {
  status: 'ok' | 'failed' | 'skipped_no_env' | 'skipped_by_flag';
  structured?: StructuredOutputMode;
  latencyMs?: number;
  model?: string;
  error?: string;
}

const probeSchema = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, word: { type: 'string' } },
  required: ['ok', 'word'],
  additionalProperties: false,
} as const;

/** One real call through the gateway with only this provider. Tries modes in order until one validates. */
export async function probeProvider(entry: RawEntry, env: Env, modes: StructuredOutputMode[], fetchImpl?: FetchLike): Promise<ProbeResult> {
  let lastError = 'nessun tentativo';
  for (const mode of modes) {
    const gw = createGateway({
      env: { ...env, GATEWAY_PROVIDERS_JSON: undefined },
      providers: [{ ...entry, enabled: true, structuredOutput: mode }],
      logger: noopLogger,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
    const t0 = Date.now();
    try {
      const res = await gw.chat({
        messages: [{ role: 'user', content: 'Test di connessione. Rispondi con ok=true e word="ciao".' }],
        max_tokens: 300,
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: { name: 'probe', schema: { ...probeSchema }, strict: true } },
      });
      return { status: 'ok', structured: mode, latencyMs: Date.now() - t0, model: res.model };
    } catch (err) {
      const attempts = (err as { attempts?: Array<{ errorKind?: string; httpStatus?: number }> }).attempts ?? [];
      const a = attempts.at(-1);
      lastError = a ? `${a.errorKind ?? 'errore'}${a.httpStatus ? ` (HTTP ${a.httpStatus})` : ''}` : (err as Error).message;
      // Only a request/format problem justifies trying a less demanding mode.
      if (a && !['bad_request', 'invalid_output', 'invalid_response'].includes(a.errorKind ?? '')) break;
    }
  }
  return { status: 'failed', error: lastError };
}

export interface AddProviderResult {
  entry: RawEntry;
  probe: ProbeResult;
  configPath: string;
}

const configFileSchema = z.object({ providers: z.array(z.record(z.string(), z.unknown())) }).passthrough();

export async function addProvider(
  args: AddProviderArgs,
  opts: { configPath: string; env: Env; fetch?: FetchLike },
): Promise<AddProviderResult> {
  const file = configFileSchema.parse(JSON.parse(await readFile(opts.configPath, 'utf8')));
  const existingIdx = file.providers.findIndex((e) => e.id === args.id);
  if (existingIdx >= 0 && !args.replace) {
    throw new Error(`esiste gia' un provider con id "${args.id}" (usa --replace per sostituirlo)`);
  }
  const others = file.providers.filter((e) => e.id !== args.id);

  const autoModes: StructuredOutputMode[] = ['json_schema', 'json_object', 'prompt'];
  let structured: StructuredOutputMode = args.structured === 'auto' ? 'prompt' : args.structured;
  let probe: ProbeResult;
  const draft = buildEntry(args, others, structured);

  if (!args.test) probe = { status: 'skipped_by_flag' };
  else if (!opts.env[args.env]?.trim()) probe = { status: 'skipped_no_env' };
  else {
    probe = await probeProvider(draft, opts.env, args.structured === 'auto' ? autoModes : [structured], opts.fetch);
    if (probe.status === 'ok' && probe.structured) structured = probe.structured;
  }

  const entry = buildEntry(args, others, structured);
  if (existingIdx >= 0) file.providers[existingIdx] = entry;
  else file.providers.push(entry);
  await writeFile(opts.configPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  return { entry, probe, configPath: opts.configPath };
}
