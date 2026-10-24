// Config-driven provider registry. Adding a provider = adding an entry to
// providers.config.json (or GATEWAY_PROVIDERS_JSON) + setting its env var. No code.
import { z } from 'zod';
import defaultConfigFile from '../providers.config.json' with { type: 'json' };
import type { Env } from './types.ts';

export const structuredOutputModes = ['json_schema', 'json_object', 'prompt'] as const;
export type StructuredOutputMode = (typeof structuredOutputModes)[number];

const headerRecord = z.record(z.string(), z.string());

export const providerConfigSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/i, 'id: lettere, numeri, . _ - (max 64)'),
    label: z.string().max(120).optional(),
    baseUrl: z.url(),
    apiKeyEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, 'apiKeyEnv: nome di env var MAIUSCOLO'),
    model: z.string().min(1),
    enabled: z.boolean().default(true),
    priority: z.number().default(100),
    /** How structured output is requested. Defaults derived from supportsJsonSchema/jsonMode. */
    structuredOutput: z.enum(structuredOutputModes).optional(),
    supportsJsonSchema: z.boolean().optional(),
    jsonMode: z.boolean().optional(),
    timeoutMs: z.number().int().positive().max(120_000).default(20_000),
    limits: z
      .object({
        rpm: z.number().int().positive().optional(),
        rpd: z.number().int().positive().optional(),
      })
      .optional(),
    extraHeaders: headerRecord.optional(),
    /** Extra fields merged into the request body (e.g. reasoning_effort). */
    extraBody: z.record(z.string(), z.unknown()).optional(),
    /** Adapter name; only needed for non OpenAI-compatible APIs. */
    adapter: z.string().default('openai-compatible'),
    note: z.string().optional(),
  })
  .transform((p) => ({
    ...p,
    label: p.label ?? p.id,
    structuredOutput:
      p.structuredOutput ??
      (p.supportsJsonSchema ? 'json_schema' : p.jsonMode ? 'json_object' : ('prompt' as StructuredOutputMode)),
  }));

export type ProviderConfigInput = z.input<typeof providerConfigSchema>;
export type ProviderConfig = z.output<typeof providerConfigSchema>;

export interface ResolvedProvider extends ProviderConfig {
  apiKey: string;
}

export interface ProviderStatus {
  id: string;
  label: string;
  model: string;
  enabled: boolean;
  configured: boolean;
  priority: number;
  reason?: 'disabled' | 'missing_env';
  apiKeyEnv: string;
  note?: string;
}

export interface LoadedConfig {
  /** Usable providers, sorted by priority (stable). */
  providers: ResolvedProvider[];
  /** Every known provider with its status (for /v1/health; never contains keys). */
  all: ProviderStatus[];
  warnings: string[];
}

type RawEntry = Record<string, unknown>;

function readRawEntries(source: unknown): RawEntry[] | null {
  if (Array.isArray(source)) return source as RawEntry[];
  if (source && typeof source === 'object' && Array.isArray((source as { providers?: unknown }).providers)) {
    return (source as { providers: RawEntry[] }).providers;
  }
  return null;
}

export const defaultProviderEntries: RawEntry[] = readRawEntries(defaultConfigFile) ?? [];

/**
 * Applies GATEWAY_PROVIDERS_JSON. Accepted shapes:
 *  - array of entries → merge by id (same id = shallow override, new id = appended)
 *  - { "mode": "merge" | "replace", "providers": [...] }
 */
export function applyOverride(base: RawEntry[], overrideJson: string | undefined, warnings: string[]): RawEntry[] {
  if (!overrideJson || !overrideJson.trim()) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(overrideJson);
  } catch {
    warnings.push('GATEWAY_PROVIDERS_JSON non e\' JSON valido: ignorato');
    return base;
  }
  const entries = readRawEntries(parsed);
  if (!entries) {
    warnings.push('GATEWAY_PROVIDERS_JSON: atteso un array o { providers: [...] }: ignorato');
    return base;
  }
  const mode = !Array.isArray(parsed) && (parsed as { mode?: unknown }).mode === 'replace' ? 'replace' : 'merge';
  if (mode === 'replace') return entries;

  const merged = base.map((e) => ({ ...e }));
  for (const entry of entries) {
    const idx = merged.findIndex((e) => e.id === entry.id);
    if (idx >= 0) merged[idx] = { ...merged[idx], ...entry };
    else merged.push(entry);
  }
  return merged;
}

export interface LoadConfigOptions {
  env: Env;
  /** Base entries; defaults to providers.config.json. */
  entries?: unknown[];
}

export function loadConfig({ env, entries }: LoadConfigOptions): LoadedConfig {
  const warnings: string[] = [];
  const raw = applyOverride((entries as RawEntry[] | undefined) ?? defaultProviderEntries, env.GATEWAY_PROVIDERS_JSON, warnings);

  const parsed: ProviderConfig[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, i) => {
    const res = providerConfigSchema.safeParse(entry);
    if (!res.success) {
      const id = typeof entry?.id === 'string' ? entry.id : `#${i}`;
      warnings.push(`provider ${id} non valido: ${res.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
      return;
    }
    if (seen.has(res.data.id)) {
      warnings.push(`provider ${res.data.id} duplicato: ignorata la seconda voce`);
      return;
    }
    seen.add(res.data.id);
    parsed.push(res.data);
  });

  // Stable sort by priority (Array.prototype.sort is stable).
  const sorted = [...parsed].sort((a, b) => a.priority - b.priority);

  const all: ProviderStatus[] = [];
  const providers: ResolvedProvider[] = [];
  for (const p of sorted) {
    const key = env[p.apiKeyEnv]?.trim();
    const status: ProviderStatus = {
      id: p.id,
      label: p.label,
      model: p.model,
      enabled: p.enabled,
      configured: Boolean(key),
      priority: p.priority,
      apiKeyEnv: p.apiKeyEnv,
      ...(p.note ? { note: p.note } : {}),
    };
    if (!p.enabled) status.reason = 'disabled';
    else if (!key) status.reason = 'missing_env';
    all.push(status);
    // Providers without their env var are skipped silently (not an error).
    if (p.enabled && key) providers.push({ ...p, apiKey: key });
  }
  return { providers, all, warnings };
}
