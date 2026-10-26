// Core router: tries providers in priority order with health tracking,
// structured-output validation (+1 corrective retry) and rules fallback for insights.
import { getAdapter, type Adapter } from './adapters/index.ts';
import { loadConfig, type LoadedConfig, type ResolvedProvider } from './config.ts';
import { GatewayError, ProviderError } from './errors.ts';
import { HealthTracker, InMemoryHealthStore, type HealthOptions, type HealthSnapshot, type HealthStore } from './health.ts';
import { buildInsightMessages } from './insights/prompt.ts';
import { generateRuleInsights } from './insights/rules.ts';
import { aiInsightsSchema, insightStatsSchema, type AiInsights, type InsightsResult } from './insights/schema.ts';
import { applyThresholds, categoryToSection, coverageOf } from './insights/thresholds.ts';
import { safeLog, loggerFromEnv, type GatewayLogEvent, type GatewayLogger } from './log.ts';
import { assertNoIdentifyingKeys, guardMessages, defaultPrivacyLimits, sanitizeDayContextText, type PrivacyLimits } from './privacy.ts';
import {
  buildStructuredRequest,
  correctionMessages,
  specFromResponseFormat,
  specFromZod,
  validateContent,
  type StructuredSpec,
} from './structured.ts';
import type {
  AttemptMeta,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  Env,
  FetchLike,
  GatewayMeta,
  Usage,
} from './types.ts';

export interface GatewayOptions {
  /** Environment (defaults to process.env). Read once at creation. */
  env?: Env;
  /** Base provider entries (defaults to providers.config.json). */
  providers?: unknown[];
  fetch?: FetchLike;
  healthStore?: HealthStore;
  health?: HealthOptions;
  logger?: GatewayLogger;
  /** Custom adapters for non OpenAI-compatible providers. */
  adapters?: Record<string, Adapter>;
  privacyLimits?: PrivacyLimits;
}

export class AllProvidersFailedError extends GatewayError {
  readonly attempts: AttemptMeta[];
  constructor(attempts: AttemptMeta[]) {
    super(503, 'all_providers_failed', 'nessun provider AI disponibile');
    this.attempts = attempts;
  }
}

interface ChainOptions {
  endpoint: GatewayLogEvent['endpoint'];
  requestId: string;
  messages: ChatMessage[];
  spec: StructuredSpec | null;
  temperature?: number;
  maxTokens?: number;
  providers: ResolvedProvider[];
  signal?: AbortSignal;
}

interface ChainResult {
  provider: ResolvedProvider;
  model: string;
  content: string;
  value: unknown;
  finishReason: string | null;
  usage?: Usage;
  attempts: AttemptMeta[];
}

export interface ProviderHealthReport {
  id: string;
  label: string;
  model: string;
  priority: number;
  enabled: boolean;
  configured: boolean;
  reason?: string;
  apiKeyEnv: string;
  note?: string;
  health?: HealthSnapshot;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'rules_only';
  rulesFallback: true;
  providers: ProviderHealthReport[];
  warnings: string[];
}

export interface Gateway {
  readonly config: LoadedConfig;
  chat(req: ChatCompletionRequest, opts?: { signal?: AbortSignal }): Promise<ChatCompletionResponse>;
  insights(input: unknown, opts?: { signal?: AbortSignal }): Promise<InsightsResult & { x_gateway: GatewayMeta }>;
  health(): Promise<HealthReport>;
}

function defaultEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {};
}

export function createGateway(options: GatewayOptions = {}): Gateway {
  const env = options.env ?? defaultEnv();
  const config = loadConfig({ env, ...(options.providers ? { entries: options.providers } : {}) });
  const fetchImpl: FetchLike = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const tracker = new HealthTracker(options.healthStore ?? new InMemoryHealthStore(), options.health);
  const logger = options.logger ?? loggerFromEnv(env, fetchImpl);
  const privacyLimits = options.privacyLimits ?? defaultPrivacyLimits;

  async function runChain(o: ChainOptions): Promise<ChainResult> {
    const attempts: AttemptMeta[] = [];
    let attemptNo = 0;
    const log = (e: Omit<GatewayLogEvent, 'request_id' | 'endpoint' | 'attempt'>) =>
      safeLog(logger, { request_id: o.requestId, endpoint: o.endpoint, attempt: ++attemptNo, ...e });

    for (const p of o.providers) {
      const avail = await tracker.check(p);
      if (!avail.available) {
        attempts.push({ provider: p.id, model: p.model, outcome: 'skipped', reason: avail.reason });
        await log({ provider_id: p.id, model: p.model, outcome: 'skipped', error_kind: avail.reason });
        continue;
      }
      const adapter = getAdapter(p.adapter, options.adapters);
      if (!adapter) {
        attempts.push({ provider: p.id, model: p.model, outcome: 'skipped', reason: 'unknown_adapter' });
        continue;
      }

      const base = o.spec ? buildStructuredRequest(p.structuredOutput, o.spec, o.messages) : { messages: o.messages };
      let messages = base.messages;
      const mode = o.spec ? p.structuredOutput : null;

      for (let tryNo = 0; tryNo < 2; tryNo++) {
        await tracker.markRequest(p, avail.halfOpen && tryNo === 0);
        const t0 = Date.now();
        try {
          const res = await adapter(
            p,
            {
              messages,
              ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
              ...(o.maxTokens !== undefined ? { maxTokens: o.maxTokens } : {}),
              ...('responseFormat' in base && base.responseFormat ? { responseFormat: base.responseFormat } : {}),
            },
            { fetch: fetchImpl, ...(o.signal ? { signal: o.signal } : {}) },
          );
          const latency = Date.now() - t0;
          const tokens = {
            prompt_tokens: res.usage?.prompt_tokens ?? null,
            completion_tokens: res.usage?.completion_tokens ?? null,
            total_tokens: res.usage?.total_tokens ?? null,
          };

          let value: unknown = res.content;
          if (o.spec) {
            const v = validateContent(o.spec, res.content);
            if (!v.ok) {
              await log({
                provider_id: p.id,
                model: res.model,
                outcome: 'error',
                error_kind: 'invalid_output',
                latency_ms: latency,
                structured_mode: mode,
                validation: 'invalid',
                ...tokens,
              });
              if (tryNo === 0) {
                messages = [...messages, ...correctionMessages(res.content, v.errors)];
                continue; // one corrective retry on the same provider
              }
              await tracker.recordFailure(p.id, 'invalid_output');
              attempts.push({ provider: p.id, model: res.model, outcome: 'error', errorKind: 'invalid_output', latencyMs: latency });
              break;
            }
            value = v.value;
          }

          await tracker.recordSuccess(p.id);
          attempts.push({ provider: p.id, model: res.model, outcome: 'success', latencyMs: latency });
          await log({
            provider_id: p.id,
            model: res.model,
            outcome: 'success',
            latency_ms: latency,
            structured_mode: mode,
            validation: o.spec ? 'ok' : 'n/a',
            source: 'ai',
            ...tokens,
          });
          return {
            provider: p,
            model: res.model,
            content: o.spec ? JSON.stringify(value) : res.content,
            value,
            finishReason: res.finishReason,
            ...(res.usage ? { usage: res.usage } : {}),
            attempts,
          };
        } catch (err) {
          const latency = Date.now() - t0;
          const e =
            err instanceof ProviderError ? err : new ProviderError('network', `errore adapter (${(err as Error)?.name ?? 'Error'})`);
          await tracker.recordFailure(p.id, e.kind, e.retryAfterMs);
          attempts.push({
            provider: p.id,
            model: p.model,
            outcome: 'error',
            errorKind: e.kind,
            latencyMs: latency,
            ...(e.status !== undefined ? { httpStatus: e.status } : {}),
          });
          await log({
            provider_id: p.id,
            model: p.model,
            outcome: 'error',
            error_kind: e.kind,
            http_status: e.status ?? null,
            latency_ms: latency,
            structured_mode: mode,
          });
          break; // next provider
        }
      }
    }
    throw new AllProvidersFailedError(attempts);
  }

  function selectProviders(model: string | undefined): ResolvedProvider[] {
    if (!model || model === 'auto') return config.providers;
    const byId = config.providers.filter((p) => p.id === model);
    if (byId.length) return byId;
    const byModel = config.providers.filter((p) => p.model === model);
    if (byModel.length) return byModel;
    throw new GatewayError(400, 'unknown_model', 'model: usare "auto" oppure l\'id di un provider configurato');
  }

  return {
    config,

    async chat(req, opts = {}) {
      const requestId = crypto.randomUUID();
      const guarded = guardMessages(req.messages, privacyLimits);
      const spec = specFromResponseFormat(req.response_format);
      const providers = selectProviders(req.model);
      const r = await runChain({
        endpoint: 'chat',
        requestId,
        messages: guarded.messages,
        spec,
        providers,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.max_tokens !== undefined ? { maxTokens: req.max_tokens } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      return {
        id: `chatcmpl-${requestId}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: r.model,
        choices: [{ index: 0, message: { role: 'assistant', content: r.content }, finish_reason: r.finishReason }],
        ...(r.usage ? { usage: r.usage } : {}),
        x_gateway: {
          requestId,
          provider: r.provider.id,
          model: r.model,
          source: 'ai',
          attempts: r.attempts,
          redactions: guarded.redactions,
        },
      };
    },

    async insights(input, opts = {}) {
      const requestId = crypto.randomUUID();
      assertNoIdentifyingKeys(input);
      const parsed = insightStatsSchema.safeParse(input);
      if (!parsed.success) {
        const where = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(radice)'}: ${i.message}`);
        throw new GatewayError(400, 'invalid_stats', `statistiche non valide: ${where.join('; ')}`);
      }
      // Free text from the user: redact identifiers server-side too (the app already does). Never logged.
      const dayContext = parsed.data.dayContext
        ?.map((d) => ({ ...d, text: sanitizeDayContextText(d.text).text }))
        .filter((d) => d.text !== '' || d.factors.length > 0);
      const stats = { ...parsed.data, ...(dayContext ? { dayContext } : {}) };
      const { eligible, hidden } = applyThresholds(stats);
      const coverage = coverageOf(stats);
      const rules = generateRuleInsights(stats);
      const hasSections = (['duration', 'debt', 'regularity', 'drift', 'weekdayWeekend', 'naps', 'correlations'] as const).some(
        (k) => eligible[k] !== undefined,
      );

      const rulesResult = async (attempts: AttemptMeta[]) => {
        await safeLog(logger, {
          request_id: requestId,
          endpoint: 'insights',
          provider_id: null,
          model: null,
          attempt: attempts.length + 1,
          outcome: 'rules_fallback',
          source: 'rules',
        });
        return {
          summary: rules.summary,
          insights: rules.insights,
          source: 'rules' as const,
          provider: null,
          model: null,
          coverage,
          hidden,
          x_gateway: { requestId, provider: null, model: null, source: 'rules' as const, attempts },
        };
      };

      if (!hasSections || config.providers.length === 0) return rulesResult([]);

      // AI output must not discuss sections hidden for insufficient data.
      const baseSpec = specFromZod('sleep_insights', aiInsightsSchema, true);
      const spec: StructuredSpec = {
        ...baseSpec,
        validate: (value) => {
          const v = baseSpec.validate(value);
          if (!v.ok) return v;
          // The AI must not repeat the user's free text verbatim (potentially identifying).
          const out = JSON.stringify(v.value).toLowerCase();
          const echoed = (eligible.dayContext ?? []).some((d) => d.text.length >= 12 && out.includes(JSON.stringify(d.text.toLowerCase()).slice(1, -1)));
          if (echoed) return { ok: false, errors: ['non ripetere testualmente il contesto riportato dall\'utente'] };
          const bad = (v.value as AiInsights).insights
            .map((i) => i.category)
            .filter((c) => {
              const section = categoryToSection[c];
              return section !== null && eligible[section] === undefined;
            });
          return bad.length
            ? { ok: false, errors: [`categorie non ammesse (dati insufficienti): ${[...new Set(bad)].join(', ')}`] }
            : v;
        },
      };

      try {
        const r = await runChain({
          endpoint: 'insights',
          requestId,
          messages: buildInsightMessages(eligible, hidden),
          spec,
          providers: config.providers,
          temperature: 0.3,
          maxTokens: 2000,
          ...(opts.signal ? { signal: opts.signal } : {}),
        });
        const ai = r.value as AiInsights;
        return {
          summary: ai.summary,
          insights: ai.insights,
          source: 'ai',
          provider: r.provider.id,
          model: r.model,
          coverage,
          hidden,
          x_gateway: { requestId, provider: r.provider.id, model: r.model, source: 'ai', attempts: r.attempts },
        };
      } catch (err) {
        if (err instanceof AllProvidersFailedError) return rulesResult(err.attempts);
        throw err;
      }
    },

    async health() {
      const providers: ProviderHealthReport[] = [];
      let usable = 0;
      for (const s of config.all) {
        const entry: ProviderHealthReport = {
          id: s.id,
          label: s.label,
          model: s.model,
          priority: s.priority,
          enabled: s.enabled,
          configured: s.configured,
          apiKeyEnv: s.apiKeyEnv,
          ...(s.reason ? { reason: s.reason } : {}),
          ...(s.note ? { note: s.note } : {}),
        };
        if (s.enabled && s.configured) {
          entry.health = await tracker.snapshot(s.id);
          if (entry.health.state !== 'open') usable++;
        }
        providers.push(entry);
      }
      const status: HealthReport['status'] =
        config.providers.length === 0 ? 'rules_only' : usable > 0 ? 'ok' : 'degraded';
      return { status, rulesFallback: true, providers, warnings: config.warnings };
    },
  };
}
