// Web-standard Request → Response handler (Vercel functions, Next.js route handlers, Node 22+).
//   POST /v1/chat/completions   OpenAI-compatible (supports response_format)
//   POST /v1/insights           aggregate stats → insights (AI or rules)
//   GET  /v1/health             provider status (no secrets)
// Paths are matched by suffix, so the handler can be mounted under any prefix (e.g. /api/ai/v1/...).
import { z } from 'zod';
import { AllProvidersFailedError, createGateway, type Gateway, type GatewayOptions } from '../gateway.ts';
import { GatewayError } from '../errors.ts';
import type { Env } from '../types.ts';
import { isAuthorized } from './auth.ts';
import { FixedWindowRateLimiter } from './rate-limit.ts';

export interface HandlerOptions extends GatewayOptions {
  /** Shared bearer secret (defaults to env.GATEWAY_SECRET). */
  secret?: string;
  /** Requests per minute per client IP (defaults to env.GATEWAY_RATE_LIMIT_RPM or 60). */
  rateLimitPerMinute?: number;
  gateway?: Gateway;
  now?: () => number;
}

const MAX_BODY_BYTES = 64 * 1024;

const chatRequestSchema = z.object({
  model: z.string().max(100).optional(),
  messages: z
    .array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() }))
    .min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(8192).optional(),
  stream: z.literal(false).optional(),
  response_format: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('text') }),
      z.object({ type: z.literal('json_object') }),
      z.object({
        type: z.literal('json_schema'),
        json_schema: z.object({
          name: z.string().min(1).max(64),
          schema: z.record(z.string(), z.unknown()),
          strict: z.boolean().optional(),
          description: z.string().optional(),
        }),
      }),
    ])
    .optional(),
});

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return json(status, { error: { message, type: status >= 500 ? 'server_error' : 'invalid_request_error', code, ...extra } }, headers);
}

function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anon';
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new GatewayError(413, 'payload_too_large', 'body troppo grande');
  try {
    return JSON.parse(text);
  } catch {
    throw new GatewayError(400, 'invalid_json', 'body non e\' JSON valido');
  }
}

export function createHandler(options: HandlerOptions = {}): (req: Request) => Promise<Response> {
  const env: Env = options.env ?? (globalThis as { process?: { env?: Env } }).process?.env ?? {};
  const gateway = options.gateway ?? createGateway({ ...options, env });
  const secret = options.secret ?? env.GATEWAY_SECRET;
  const rpm = options.rateLimitPerMinute ?? (Number(env.GATEWAY_RATE_LIMIT_RPM) || 60);
  const limiter = new FixedWindowRateLimiter(rpm, 60_000, options.now);

  return async function handle(req: Request): Promise<Response> {
    try {
      const rl = limiter.hit(clientKey(req));
      if (!rl.allowed) {
        return errorResponse(429, 'rate_limited', 'troppe richieste', {}, { 'retry-after': String(rl.retryAfterSec) });
      }
      if (!secret || secret.length < 16) {
        return errorResponse(500, 'gateway_misconfigured', 'GATEWAY_SECRET non impostato (min 16 caratteri)');
      }
      if (!(await isAuthorized(req.headers.get('authorization'), secret))) {
        return errorResponse(401, 'unauthorized', 'token mancante o non valido', {}, { 'www-authenticate': 'Bearer' });
      }

      const path = new URL(req.url).pathname.replace(/\/+$/, '');

      if (path.endsWith('/v1/health')) {
        if (req.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'usare GET');
        return json(200, await gateway.health());
      }

      if (path.endsWith('/v1/chat/completions')) {
        if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'usare POST');
        const raw = await readJson(req);
        if (raw && typeof raw === 'object' && (raw as { stream?: unknown }).stream === true) {
          return errorResponse(400, 'stream_not_supported', 'stream non supportato');
        }
        const parsed = chatRequestSchema.safeParse(raw);
        if (!parsed.success) {
          return errorResponse(400, 'invalid_request', parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
        }
        const { stream: _stream, ...chatReq } = parsed.data;
        return json(200, await gateway.chat(chatReq, { signal: req.signal }));
      }

      if (path.endsWith('/v1/insights')) {
        if (req.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'usare POST');
        const raw = await readJson(req);
        return json(200, await gateway.insights(raw, { signal: req.signal }));
      }

      return errorResponse(404, 'not_found', 'endpoint sconosciuto');
    } catch (err) {
      if (err instanceof AllProvidersFailedError) {
        return errorResponse(503, err.code, err.message, { attempts: err.attempts });
      }
      if (err instanceof GatewayError) return errorResponse(err.status, err.code, err.message);
      // Never echo internal error details (could contain request data).
      return errorResponse(500, 'internal_error', 'errore interno');
    }
  };
}
