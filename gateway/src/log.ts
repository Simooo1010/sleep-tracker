// Metadata-only logging. NEVER logs prompt/response content (health data):
// only provider, model, outcome, latency, tokens.
import type { FetchLike } from './types.ts';

export interface GatewayLogEvent {
  request_id: string;
  endpoint: 'chat' | 'insights';
  provider_id: string | null;
  model: string | null;
  attempt: number;
  outcome: 'success' | 'error' | 'skipped' | 'rules_fallback';
  error_kind?: string | null;
  http_status?: number | null;
  latency_ms?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  structured_mode?: string | null;
  validation?: 'ok' | 'invalid' | 'n/a' | null;
  source?: 'ai' | 'rules' | null;
}

export interface GatewayLogger {
  log(event: GatewayLogEvent): void | Promise<void>;
}

export const noopLogger: GatewayLogger = { log: () => {} };

export const consoleLogger: GatewayLogger = {
  log: (e) => {
    console.info(JSON.stringify({ msg: 'ai_gateway', ...e }));
  },
};

/**
 * Inserts into public.ai_gateway_log via PostgREST with the service role key (server-side only).
 * Bounded by a short timeout so a slow/unreachable Supabase never delays a gateway response much.
 */
export function supabaseLogger(opts: { url: string; serviceRoleKey: string; fetch?: FetchLike; table?: string; timeoutMs?: number }): GatewayLogger {
  const f = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 2_000;
  const endpoint = `${opts.url.replace(/\/+$/, '')}/rest/v1/${opts.table ?? 'ai_gateway_log'}`;
  return {
    log: async (e) => {
      await f(endpoint, {
        method: 'POST',
        headers: {
          apikey: opts.serviceRoleKey,
          authorization: `Bearer ${opts.serviceRoleKey}`,
          'content-type': 'application/json',
          prefer: 'return=minimal',
        },
        body: JSON.stringify(e),
        signal: AbortSignal.timeout(timeoutMs),
      });
    },
  };
}

export function multiLogger(...loggers: GatewayLogger[]): GatewayLogger {
  return {
    log: async (e) => {
      await Promise.allSettled(loggers.map((l) => Promise.resolve().then(() => l.log(e))));
    },
  };
}

/**
 * Logger from env. Supabase logging is OPT-IN: only when BOTH SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set (non-empty); otherwise console only (or nothing with GATEWAY_LOG=off).
 */
export function loggerFromEnv(env: Record<string, string | undefined>, fetchImpl?: FetchLike): GatewayLogger {
  if (env.GATEWAY_LOG === 'off') return noopLogger;
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) {
    return multiLogger(consoleLogger, supabaseLogger({ url, serviceRoleKey: key, ...(fetchImpl ? { fetch: fetchImpl } : {}) }));
  }
  return consoleLogger;
}

export async function safeLog(logger: GatewayLogger, e: GatewayLogEvent): Promise<void> {
  try {
    await logger.log(e);
  } catch {
    // logging must never break a request
  }
}
