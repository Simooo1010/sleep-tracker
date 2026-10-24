// Vercel Functions adapter.
//
// vercel.json rewrites every /v1/<route> request to the single function api/gateway.ts
// with ?route=<route>. Depending on the platform, the function receives either the original
// URL (/v1/chat/completions) or the rewritten one (/api/gateway?route=chat/completions):
// normalizeGatewayRequest() maps both to /v1/<route>, so the suffix-based routing of the
// Web-standard handler keeps working unchanged.
//
// One single function (not one per endpoint) on purpose: health/cooldown/rate-limit state
// lives in memory, so all endpoints must share the same handler instance.
import { createHandler, type HandlerOptions } from './handler.ts';

export const ROUTE_PARAM = 'route';

const ROUTE_RE = /^[a-z0-9/_-]{1,64}$/i;

/** Returns a Request whose pathname is /v1/<route>, or the request unchanged if it already is. */
export function normalizeGatewayRequest(req: Request): Request {
  const url = new URL(req.url);
  if (/\/v1\/[^/]/.test(url.pathname)) return req;

  const route = url.searchParams.get(ROUTE_PARAM)?.replace(/^\/+|\/+$/g, '');
  if (!route || !ROUTE_RE.test(route) || route.includes('..')) return req;

  url.pathname = `/v1/${route.replace(/^v1\//, '')}`;
  url.searchParams.delete(ROUTE_PARAM);
  // Rebuilding the Request keeps method, headers, body and signal.
  return new Request(url, req);
}

/**
 * Creates the handler for a Vercel function. Call it ONCE at module level so that the
 * in-memory health state is reused across requests served by the same (Fluid) instance.
 */
export function createVercelHandler(options: HandlerOptions = {}): (req: Request) => Promise<Response> {
  const handle = createHandler(options);
  return (req) => handle(normalizeGatewayRequest(req));
}
