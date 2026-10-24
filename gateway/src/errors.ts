// Error taxonomy used by the router to decide fallback and cooldown.

export type ProviderErrorKind =
  | 'network'
  | 'timeout'
  | 'server_error' // 5xx
  | 'rate_limit' // 429 or local rpm/rpd limit
  | 'auth' // 401/403
  | 'not_found' // 404 (wrong model id / base url)
  | 'bad_request' // other 4xx
  | 'invalid_response' // non-JSON body or missing choices
  | 'invalid_output'; // JSON content failed schema validation

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(kind: ProviderErrorKind, message: string, opts: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
    this.code = code;
  }
}

/** Parses Retry-After (delta-seconds or HTTP-date). Returns ms or undefined. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return undefined;
}

export function classifyStatus(status: number): ProviderErrorKind {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status >= 500) return 'server_error';
  return 'bad_request';
}
