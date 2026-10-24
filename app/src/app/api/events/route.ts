import { NextResponse } from 'next/server';

import { parseIncomingEvent } from '@/server/events-schema';
import { ingestEvent } from '@/server/ingest';
import { getRepo } from '@/server/repo-factory';
import { authenticate } from '@/server/token';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** Endpoint dei Comandi iOS: POST /api/events con `Authorization: Bearer st_…`. */
export async function POST(request: Request): Promise<Response> {
  const pepper = process.env.INGEST_TOKEN_PEPPER ?? '';
  let repo;
  try {
    repo = getRepo();
  } catch {
    return json(503, { ok: false, error: 'Servizio non configurato.' });
  }

  let authorized: boolean;
  try {
    authorized = await authenticate(request.headers.get('authorization'), pepper, (hash) =>
      repo.tokenExists(hash),
    );
  } catch {
    return json(503, { ok: false, error: 'Servizio non configurato.' });
  }
  if (!authorized) return json(401, { ok: false, error: 'Non autorizzato.' });

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'Richiesta troppo grande.' });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'Richiesta troppo grande.' });
    body = JSON.parse(text);
  } catch {
    return json(400, { ok: false, error: 'Corpo della richiesta non valido.' });
  }

  const now = new Date();
  const parsed = parseIncomingEvent(body, now);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });

  try {
    const result = await ingestEvent(repo, parsed.value, now);
    if (!result.ok) return json(result.status, { ok: false, error: result.error });
    return json(200, { ok: true, duplicate: result.duplicate, nightDate: result.nightDate });
  } catch {
    return json(500, { ok: false, error: 'Errore interno. Riprova.' });
  }
}
