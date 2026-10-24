// Bearer auth with constant-time comparison (Web Crypto: works on Node, Edge, Vercel).

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

/** Constant-time string comparison: both sides are hashed to fixed length first. */
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= (ha[i] ?? 0) ^ (hb[i] ?? 0);
  return diff === 0;
}

export function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || null;
}

export async function isAuthorized(header: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || secret.length < 16) return false; // fail closed if misconfigured
  const token = extractBearer(header) ?? '';
  return timingSafeEqualStr(token, secret);
}
