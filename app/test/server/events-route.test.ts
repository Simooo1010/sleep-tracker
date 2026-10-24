/**
 * Test HTTP dell'endpoint reale POST /api/events (route Next) con `APP_DATA_MODE=memory`.
 *
 * Nota sull'alias `@/`: vitest.config.ts non risolve i `paths` di tsconfig, quindi gli import
 * `@/server/*` della route vengono mappati qui (vi.doMock) sui moduli reali: stesso codice, nessun mock.
 * Isolamento: `getRepo()` tiene un singleton a livello di modulo; `vi.resetModules()` + doMock +
 * import dinamico in ogni test danno una route e un MemoryRepo nuovi, condivisi fra route e test.
 * Nota: `Headers` (Fetch) toglie gli spazi iniziali/finali dei valori, quindi `"Bearer <t> "` arriva
 * alla route già normalizzato: non è un caso di header malformato testabile via HTTP.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MemoryRepo } from '../../src/server/memory-repo';
import { generateToken, hashToken } from '../../src/server/token';

// Ottobre 2026: Europe/Rome in CEST (UTC+2).
const NOW = new Date('2026-10-24T12:00:00Z');
const PEPPER = 'pepper-di-test-http-lungo-almeno-32-caratteri';
const ENDPOINT = 'http://localhost/api/events';

type PostFn = (request: Request) => Promise<Response>;

let POST: PostFn;
let repo: MemoryRepo;
let token: string;

/** Route e MemoryRepo nuovi: registry dei moduli azzerato e alias `@/` ri-mappati ogni volta. */
async function load(): Promise<void> {
  vi.resetModules();
  vi.doMock('@/server/events-schema', () => import('../../src/server/events-schema'));
  vi.doMock('@/server/ingest', () => import('../../src/server/ingest'));
  vi.doMock('@/server/repo-factory', () => import('../../src/server/repo-factory'));
  vi.doMock('@/server/token', () => import('../../src/server/token'));
  const route = await import('../../src/app/api/events/route');
  POST = route.POST;
  const factory = await import('@/server/repo-factory');
  if (process.env.APP_DATA_MODE === 'memory') repo = factory.getRepo() as MemoryRepo;
}

function request(body: unknown, authorization: string | null = `Bearer ${token}`): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (authorization !== null) headers.set('authorization', authorization);
  return new Request(ENDPOINT, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

interface Result {
  status: number;
  text: string;
  json: Record<string, unknown>;
  headers: Headers;
}

async function send(body: unknown, authorization?: string | null): Promise<Result> {
  const res = await POST(request(body, authorization));
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) as Record<string, unknown>, headers: res.headers };
}

/** Invarianti di ogni risposta: no-store, JSON, niente token/pepper/stack. */
function expectSafe(r: Result): void {
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(r.headers.get('content-type')).toMatch(/application\/json/);
  expect(r.text).not.toContain(token);
  expect(r.text).not.toContain(PEPPER);
  expect(r.text).not.toMatch(/\bat .+:\d+:\d+|Error:|stack/i);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('APP_DATA_MODE', 'memory');
  vi.stubEnv('INGEST_TOKEN_PEPPER', PEPPER);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);
  await load();
  token = generateToken();
  repo.addToken(hashToken(token, PEPPER));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/events — autenticazione', () => {
  it('senza Authorization → 401', async () => {
    const r = await send({ type: 'wake' }, null);
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ ok: false, error: 'Non autorizzato.' });
    expectSafe(r);
    expect(repo.events).toHaveLength(0);
  });

  it('header malformati → 401 senza interrogare il DB', async () => {
    const spy = vi.spyOn(repo, 'tokenExists');
    const malformed = [
      '',
      token,
      `Basic ${token}`,
      `Bearer  ${token}`,
      `Bearer\t${token}`,
      `Bearer ${token}x`,
      'Bearer st_corto',
      `Bearer ${token.slice(3)}`,
      'Bearer',
      'Bearer ',
    ];
    for (const h of malformed) {
      const r = await send({ type: 'wake' }, h);
      expect(r.status, JSON.stringify(h)).toBe(401);
      expectSafe(r);
    }
    expect(spy).not.toHaveBeenCalled();
    expect(repo.events).toHaveLength(0);
  });

  it('token ben formato ma sconosciuto → 401 (il DB viene interrogato una volta)', async () => {
    const spy = vi.spyOn(repo, 'tokenExists');
    const r = await send({ type: 'wake' }, `Bearer ${generateToken()}`);
    expect(r.status).toBe(401);
    expectSafe(r);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(repo.events).toHaveLength(0);
  });

  it('schema Bearer case-insensitive', async () => {
    const r = await send({ type: 'wake', ts: '2026-10-24T05:30:00Z' }, `bEaReR ${token}`);
    expect(r.status).toBe(200);
    expectSafe(r);
  });

  it('pepper mancante → 503 gestito, mai 500', async () => {
    vi.stubEnv('INGEST_TOKEN_PEPPER', undefined);
    const r = await send({ type: 'wake' });
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ ok: false, error: 'Servizio non configurato.' });
    expectSafe(r);
    expect(repo.events).toHaveLength(0);
  });

  it('pepper troppo corto → 503 gestito', async () => {
    vi.stubEnv('INGEST_TOKEN_PEPPER', 'corto');
    const r = await send({ type: 'wake' });
    expect(r.status).toBe(503);
    expectSafe(r);
    expect(r.text).not.toContain('corto');
  });

  it('pepper diverso da quello usato per l’hash → 401', async () => {
    vi.stubEnv('INGEST_TOKEN_PEPPER', 'un-altro-pepper-sempre-lungo-32-caratteri');
    const r = await send({ type: 'wake' });
    expect(r.status).toBe(401);
    expectSafe(r);
  });

  it('repo non configurato (niente memory né Supabase) → 503 senza dettagli', async () => {
    vi.stubEnv('APP_DATA_MODE', undefined);
    await load();
    const r = await send({ type: 'wake' });
    expect(r.status).toBe(503);
    expect(r.json).toEqual({ ok: false, error: 'Servizio non configurato.' });
    expectSafe(r);
    expect(r.text).not.toMatch(/SUPABASE/);
  });

  it('errore del DB in tokenExists → 401, senza dettagli', async () => {
    vi.spyOn(repo, 'tokenExists').mockRejectedValue(new Error('connessione persa a db.interno:5432'));
    const r = await send({ type: 'wake' });
    expect(r.status).toBe(401);
    expectSafe(r);
    expect(r.text).not.toContain('db.interno');
  });
});

describe('POST /api/events — ingestione', () => {
  it('token valido + wake → 200 {ok:true,duplicate:false} e notte creata', async () => {
    const r = await send({ type: 'wake', ts: '2026-10-24T05:30:00Z' });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-24' });
    expectSafe(r);
    expect(repo.events).toEqual([
      { type: 'wake', ts: '2026-10-24T05:30:00.000Z', source: 'comandi', idempotencyKey: 'wake:2026-10-24T05:30Z' },
    ]);
    const n = await repo.getNight('2026-10-24');
    expect(n?.status).toBe('stimata');
    expect(n?.wakeAt).toEqual({ value: '2026-10-24T05:30:00.000Z', provenance: 'automatico' });
  });

  it('wake senza ts usa l’orario di ricezione', async () => {
    vi.setSystemTime(new Date('2026-10-24T06:15:00Z'));
    const r = await send({ type: 'wake' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, duplicate: false, nightDate: '2026-10-24' });
    expect(repo.events[0]?.ts).toBe('2026-10-24T06:15:00.000Z');
  });

  it('stesso evento due volte → seconda risposta duplicate:true, un solo evento salvato', async () => {
    const body = { type: 'wake', ts: '2026-10-24T05:30:00Z', idempotencyKey: 'wake-2026-10-24' };
    const first = await send(body);
    const nightsAfterFirst = repo.nights;
    const second = await send(body);
    expect(first.json).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-24' });
    expect(second.status).toBe(200);
    expect(second.json).toEqual({ ok: true, duplicate: true, nightDate: '2026-10-24' });
    expectSafe(second);
    expect(repo.events).toHaveLength(1);
    expect(repo.nights).toEqual(nightsAfterFirst);
  });

  it('stesso evento senza idempotencyKey (chiave derivata da type+ts) → duplicate:true', async () => {
    await send({ type: 'wake', ts: '2026-10-24T05:30:10Z' });
    const second = await send({ type: 'wake', ts: '2026-10-24T05:30:40Z' });
    expect(second.json).toMatchObject({ ok: true, duplicate: true });
    expect(repo.events).toHaveLength(1);
  });

  it('giornata completa via HTTP: bedtime_candidate sera → evening_check → wake → notte stimata', async () => {
    const r1 = await send({ type: 'bedtime_candidate', ts: '2026-10-20T23:10:00+02:00' });
    const r2 = await send({
      type: 'evening_check',
      ts: '2026-10-20T23:05:00+02:00',
      check: { tiredness: '4', mood: 3, factors: ['schermo-a-letto'] },
    });
    const r3 = await send({ type: 'WAKE', ts: '2026-10-21T07:05:00+02:00' });
    for (const r of [r1, r2, r3]) {
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-21' });
      expectSafe(r);
    }

    expect(repo.events.map((e) => e.type)).toEqual(['evening_check', 'bedtime_candidate', 'wake']);
    expect(repo.checks).toEqual([
      {
        date: '2026-10-20',
        tiredness: { value: 4, provenance: 'confermato' },
        mood: { value: 3, provenance: 'confermato' },
        factors: ['schermo-a-letto'],
        napMinutesToday: { value: null, provenance: 'mancante' },
      },
    ]);
    const n = await repo.getNight('2026-10-21');
    expect(n).toEqual({
      nightDate: '2026-10-21',
      bedAt: { value: '2026-10-20T21:10:00.000Z', provenance: 'automatico' },
      wakeAt: { value: '2026-10-21T05:05:00.000Z', provenance: 'automatico' },
      status: 'stimata',
      quality: { value: null, provenance: 'mancante' },
      energy: { value: null, provenance: 'mancante' },
      isException: false,
      factors: ['schermo-a-letto'],
    });
  });
});

describe('POST /api/events — validazione', () => {
  it('JSON non valido → 400', async () => {
    for (const body of ['{type: wake}', '', '{"type":"wake"', 'null', '[]', '"wake"', '42']) {
      const r = await send(body);
      expect(r.status, body).toBe(400);
      expect(r.json.ok).toBe(false);
      expect(typeof r.json.error).toBe('string');
      expectSafe(r);
    }
    expect(repo.events).toHaveLength(0);
  });

  it('JSON non valido → messaggio dedicato', async () => {
    const r = await send('{type: wake}');
    expect(r.json).toEqual({ ok: false, error: 'Corpo della richiesta non valido.' });
  });

  it('type sconosciuto → 400 in italiano, senza eco dell’input', async () => {
    const marker = 'tipo_inventato_xyz<script>';
    const r = await send({ type: marker });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/^Il campo "type" è obbligatorio/);
    expect(r.text).not.toContain('tipo_inventato_xyz');
    expect(r.text).not.toContain('<script>');
    expectSafe(r);
  });

  it('ts nel futuro (oltre 5 minuti) → 400 in italiano, senza eco', async () => {
    const future = '2026-10-24T13:00:00Z';
    const r = await send({ type: 'wake', ts: future });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/nel futuro/);
    expect(r.text).not.toContain(future);
    expect(r.text).not.toContain('13:00');
    expectSafe(r);
    expect(repo.events).toHaveLength(0);
  });

  it('ts nel futuro entro 5 minuti → accettato', async () => {
    const r = await send({ type: 'app_open', ts: '2026-10-24T12:04:00Z' });
    expect(r.status).toBe(200);
  });

  it('campi extra → 400 in italiano, senza eco del nome o del valore', async () => {
    const r = await send({ type: 'wake', campoSegreto: 'valore-da-non-ripetere' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, error: 'Il corpo della richiesta contiene un campo non consentito.' });
    expect(r.text).not.toContain('campoSegreto');
    expect(r.text).not.toContain('valore-da-non-ripetere');
    expectSafe(r);
  });

  it('campi extra dentro check → 400', async () => {
    const r = await send({ type: 'evening_check', check: { mood: 3, note: 'testo libero personale' } });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('Il campo "check" contiene un campo non consentito.');
    expect(r.text).not.toContain('testo libero');
    expectSafe(r);
  });

  it('il token nel corpo non viene mai ripetuto nella risposta', async () => {
    const r = await send({ type: 'wake', idempotencyKey: token });
    expectSafe(r);
    const r2 = await send({ type: token });
    expect(r2.status).toBe(400);
    expectSafe(r2);
  });

  it('body enorme (>100KB) non manda in crash: 413 gestito', async () => {
    const huge = 'x'.repeat(200_000);
    const cases: unknown[] = [
      { type: 'wake', pad: huge },
      { type: huge },
      { type: 'wake', idempotencyKey: huge },
      { type: 'evening_check', check: { factors: Array.from({ length: 20_000 }, () => 'schermo-a-letto') } },
      `{"type":"wake","x":"${huge}`,
    ];
    for (const body of cases) {
      const r = await send(body);
      expect(r.status).toBe(413);
      expect(r.text.length).toBeLessThan(1_000);
      expectSafe(r);
    }
    expect(repo.events).toHaveLength(0);
    // L'endpoint resta funzionante dopo i body enormi.
    const ok = await send({ type: 'wake', ts: '2026-10-24T05:30:00Z' });
    expect(ok.status).toBe(200);
  });

  it('errore interno in ingest → 500 gestito senza dettagli', async () => {
    vi.spyOn(repo, 'insertEvent').mockRejectedValue(new Error('dettaglio interno sensibile'));
    const r = await send({ type: 'wake', ts: '2026-10-24T05:30:00Z' });
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ ok: false, error: 'Errore interno. Riprova.' });
    expectSafe(r);
    expect(r.text).not.toContain('sensibile');
  });
});
