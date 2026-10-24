// Minimal node:http ↔ Web-standard bridge, used by the local dev server (scripts/dev-server.ts).
// Production on Vercel does not use this: the platform passes a Web Request directly.
import type { IncomingMessage, ServerResponse } from 'node:http';

export async function toWebRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
  }
  const method = req.method ?? 'GET';
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = new Uint8Array(Buffer.concat(chunks));
  }
  const ac = new AbortController();
  req.once('close', () => {
    if (!req.complete) ac.abort();
  });
  return new Request(new URL(req.url ?? '/', origin), { method, headers, body: body ?? null, signal: ac.signal });
}

export async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Wraps a Web handler as a node:http request listener. */
export function nodeListener(handle: (req: Request) => Promise<Response>, origin: () => string) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    toWebRequest(req, origin())
      .then(handle)
      .then((response) => sendWebResponse(res, response))
      .catch(() => {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end('{"error":{"code":"internal_error"}}');
      });
  };
}
