import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';

import type { EveningCheck, Nap, Night } from '../../src/domain/types';
import {
  createServiceClient,
  createSupabaseRepo,
  rowToNight,
  type NightRow,
} from '../../src/server/repo-supabase';

// ---------- Client Supabase finto: catena del query builder su tabelle in memoria ----------

type Row = Record<string, unknown>;
type Op = { method: string; args: unknown[] };
interface Call {
  table: string;
  ops: Op[];
}

const UNIQUE: Record<string, string> = {
  events: 'idempotency_key',
  nights: 'night_date',
  naps: 'start_at',
  evening_checks: 'date',
  api_tokens: 'token_hash',
};

interface FakeOpts {
  /** Forza un errore per la chiamata che soddisfa il predicato. */
  failWhen?: (c: Call) => { code?: string; message: string } | null;
  /** Lancia (es. rete giù) per la chiamata che soddisfa il predicato. */
  throwWhen?: (c: Call) => boolean;
}

function fakeClient(tables: Record<string, Row[]> = {}, opts: FakeOpts = {}) {
  const db: Record<string, Row[]> = {
    events: [],
    nights: [],
    naps: [],
    evening_checks: [],
    api_tokens: [],
    ...tables,
  };
  const calls: Call[] = [];

  function exec(call: Call): { data: unknown; error: unknown } {
    const forced = opts.failWhen?.(call);
    if (forced) return { data: null, error: forced };
    const rows = db[call.table]!;
    const key = UNIQUE[call.table]!;
    const find = (m: string) => call.ops.filter((o) => o.method === m);
    const filters = call.ops.filter((o) => ['eq', 'neq', 'gte', 'lte'].includes(o.method));
    const match = (r: Row) =>
      filters.every(({ method, args: [col, v] }) => {
        const x = r[col as string] as string | number | boolean;
        const y = v as string | number | boolean;
        if (method === 'eq') return x === y;
        if (method === 'neq') return x !== y;
        if (method === 'gte') return x >= y;
        return x <= y;
      });
    const wantsSelect = find('select').length > 0;

    const upsert = find('upsert')[0];
    if (upsert) {
      const [value, o] = upsert.args as [Row, { onConflict?: string; ignoreDuplicates?: boolean }];
      const conflictCol = o?.onConflict ?? key;
      const existing = rows.find((r) => r[conflictCol] === value[conflictCol]);
      let affected: Row[] = [];
      if (!existing) {
        rows.push({ ...value });
        affected = [value];
      } else if (!o?.ignoreDuplicates) {
        Object.assign(existing, value);
        affected = [existing];
      }
      return { data: wantsSelect ? affected.map((r) => ({ ...r })) : null, error: null };
    }

    const update = find('update')[0];
    if (update) {
      const affected = rows.filter(match);
      affected.forEach((r) => Object.assign(r, update.args[0] as Row));
      return { data: wantsSelect ? affected.map((r) => ({ ...r })) : null, error: null };
    }

    const out = rows.filter(match).map((r) => ({ ...r }));
    const order = find('order')[0];
    if (order) {
      const col = order.args[0] as string;
      out.sort((a, b) => String(a[col]).localeCompare(String(b[col])));
    }
    if (find('maybeSingle').length) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }

  function builder(table: string) {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    for (const m of [
      'select',
      'insert',
      'upsert',
      'update',
      'eq',
      'neq',
      'gte',
      'lte',
      'order',
      'maybeSingle',
    ]) {
      b[m] = (...args: unknown[]) => {
        call.ops.push({ method: m, args });
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      try {
        if (opts.throwWhen?.(call)) throw new Error('network down');
        return Promise.resolve(exec(call)).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    };
    return b;
  }

  const client = { from: (t: string) => builder(t) } as unknown as SupabaseClient;
  return { client, db, calls };
}

const NOW = new Date('2026-10-25T08:00:00.000Z');
const fixedNow = () => NOW;

function night(o: Partial<Night> = {}): Night {
  return {
    nightDate: '2026-10-25',
    bedAt: { value: '2026-10-24T22:30:00.000Z', provenance: 'automatico' },
    wakeAt: { value: '2026-10-25T06:15:00.000Z', provenance: 'confermato' },
    status: 'stimata',
    quality: { value: 4, provenance: 'confermato' },
    energy: { value: null, provenance: 'mancante' },
    isException: false,
    factors: ['schermo-a-letto'],
    ...o,
  };
}

// ---------- Unit test ----------

describe('createSupabaseRepo: eventi', () => {
  it('insertEvent è idempotente sulla idempotency_key', async () => {
    const { client, db, calls } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    const e = {
      type: 'wake' as const,
      ts: '2026-10-25T06:15:00.000Z',
      source: 'comandi' as const,
      idempotencyKey: 'wake-2026-10-25',
    };
    expect(await repo.insertEvent(e)).toEqual({ inserted: true });
    expect(await repo.insertEvent(e)).toEqual({ inserted: false });
    expect(db.events).toHaveLength(1);
    expect(db.events![0]).toEqual({
      idempotency_key: 'wake-2026-10-25',
      type: 'wake',
      ts: '2026-10-25T06:15:00.000Z',
      source: 'comandi',
    });
    const upsert = calls[0]!.ops.find((o) => o.method === 'upsert')!;
    expect(upsert.args[1]).toEqual({ onConflict: 'idempotency_key', ignoreDuplicates: true });
  });

  it('listEvents filtra, ordina e normalizza ts in ISO UTC', async () => {
    const { client } = fakeClient({
      events: [
        { idempotency_key: 'b', type: 'wake', ts: '2026-10-25T06:15:00+00:00', source: 'comandi' },
        { idempotency_key: 'a', type: 'bedtime_candidate', ts: '2026-10-24T22:30:00+00:00', source: 'app' },
        { idempotency_key: 'c', type: 'app_open', ts: '2026-10-27T10:00:00+00:00', source: 'app' },
      ],
    });
    const repo = createSupabaseRepo(client, fixedNow);
    const out = await repo.listEvents('2026-10-24T00:00:00+00:00', '2026-10-26T00:00:00+00:00');
    expect(out).toEqual([
      { type: 'bedtime_candidate', ts: '2026-10-24T22:30:00.000Z', source: 'app' },
      { type: 'wake', ts: '2026-10-25T06:15:00.000Z', source: 'comandi' },
    ]);
  });

  it('errore Supabase → Error breve senza dati', async () => {
    const { client } = fakeClient({}, {
      failWhen: () => ({ code: '23505', message: 'key (idempotency_key)=(wake-2026-10-25) segreta' }),
    });
    const repo = createSupabaseRepo(client, fixedNow);
    const p = repo.insertEvent({
      type: 'wake',
      ts: '2026-10-25T06:15:00.000Z',
      source: 'comandi',
      idempotencyKey: 'wake-2026-10-25',
    });
    await expect(p).rejects.toThrow('Supabase: inserimento evento non riuscita (23505)');
    await expect(p).rejects.not.toThrow(/wake-2026/);
  });
});

describe('createSupabaseRepo: notti', () => {
  it('mapping completo Night ↔ riga, con null + mancante', async () => {
    const { client, db } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    expect(await repo.upsertNight(night())).toBe(true);
    expect(db.nights![0]).toEqual({
      night_date: '2026-10-25',
      bed_at: '2026-10-24T22:30:00.000Z',
      bed_prov: 'automatico',
      wake_at: '2026-10-25T06:15:00.000Z',
      wake_prov: 'confermato',
      status: 'stimata',
      quality: 4,
      quality_prov: 'confermato',
      energy: null,
      energy_prov: 'mancante',
      is_exception: false,
      factors: ['schermo-a-letto'],
      updated_at: NOW.toISOString(),
    });
    expect(await repo.getNight('2026-10-25')).toEqual(night());
    expect(await repo.getNight('2026-10-26')).toBeNull();
  });

  it('valore null scritto sempre con provenienza mancante', async () => {
    const { client, db } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    await repo.upsertNight(night({ bedAt: { value: null, provenance: 'stimato' } }));
    expect(db.nights![0]).toMatchObject({ bed_at: null, bed_prov: 'mancante' });
  });

  it('in lettura un valore null è sempre mancante, anche se la colonna _prov dice altro', () => {
    const row: NightRow = {
      night_date: '2026-10-25',
      bed_at: null,
      bed_prov: 'automatico',
      wake_at: '2026-10-25T06:15:00+00:00',
      wake_prov: 'automatico',
      status: 'mancante',
      quality: null,
      quality_prov: null,
      energy: null,
      energy_prov: null,
      is_exception: null,
      factors: null,
    };
    expect(rowToNight(row)).toEqual({
      nightDate: '2026-10-25',
      bedAt: { value: null, provenance: 'mancante' },
      wakeAt: { value: '2026-10-25T06:15:00.000Z', provenance: 'automatico' },
      status: 'mancante',
      quality: { value: null, provenance: 'mancante' },
      energy: { value: null, provenance: 'mancante' },
      isException: false,
      factors: [],
    });
  });

  it('righe non valide → errore senza dati', () => {
    const base = {
      night_date: '2026-10-25',
      bed_at: null,
      bed_prov: 'mancante',
      wake_at: null,
      wake_prov: 'mancante',
      status: 'stimata',
      quality: null,
      quality_prov: 'mancante',
      energy: null,
      energy_prov: 'mancante',
      is_exception: false,
      factors: [],
    } satisfies NightRow;
    expect(() => rowToNight({ ...base, status: 'boh' })).toThrow('Dato non valido letto da nights');
    expect(() => rowToNight({ ...base, quality: 9, quality_prov: 'confermato' })).toThrow();
    expect(() => rowToNight({ ...base, quality: 3, quality_prov: 'mancante' })).toThrow();
  });

  it('aggiorna una notte non confermata', async () => {
    const { client, db } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    await repo.upsertNight(night());
    const updated = night({ status: 'confermata', energy: { value: 2, provenance: 'confermato' } });
    expect(await repo.upsertNight(updated)).toBe(true);
    expect(db.nights).toHaveLength(1);
    expect(await repo.getNight('2026-10-25')).toEqual(updated);
  });

  it('non sovrascrive MAI una notte confermata (ritorna false)', async () => {
    const { client, db, calls } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    const confirmed = night({ status: 'confermata' });
    await repo.upsertNight(confirmed);
    const snapshot = { ...db.nights![0] };

    expect(await repo.upsertNight(night({ status: 'stimata', quality: { value: 1, provenance: 'stimato' } }))).toBe(false);
    expect(await repo.upsertNight(night({ status: 'confermata', factors: [] }))).toBe(false);
    expect(db.nights![0]).toEqual(snapshot);
    expect(await repo.getNight('2026-10-25')).toEqual(confirmed);

    // L'update è condizionato atomicamente sullo status, non una lettura + scrittura.
    const upd = calls.find((c) => c.ops.some((o) => o.method === 'update'))!;
    expect(upd.ops).toContainEqual({ method: 'neq', args: ['status', 'confermata'] });
    expect(upd.ops).toContainEqual({ method: 'eq', args: ['night_date', '2026-10-25'] });
    const ins = calls.find((c) => c.ops.some((o) => o.method === 'upsert'))!;
    expect(ins.ops.find((o) => o.method === 'upsert')!.args[1]).toEqual({
      onConflict: 'night_date',
      ignoreDuplicates: true,
    });
  });

  it('listNights filtra per intervallo e ordina', async () => {
    const { client } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    for (const d of ['2026-10-27', '2026-10-23', '2026-10-25', '2026-10-30']) {
      await repo.upsertNight(night({ nightDate: d }));
    }
    const out = await repo.listNights('2026-10-23', '2026-10-27');
    expect(out.map((n) => n.nightDate)).toEqual(['2026-10-23', '2026-10-25', '2026-10-27']);
  });
});

describe('createSupabaseRepo: check serale e sonnellini', () => {
  const check: EveningCheck = {
    date: '2026-10-24',
    tiredness: { value: 4, provenance: 'confermato' },
    mood: { value: null, provenance: 'mancante' },
    factors: ['caffe-tardi'],
    napMinutesToday: { value: 20, provenance: 'automatico' },
  };

  it('mapping EveningCheck ↔ riga e upsert sulla data', async () => {
    const { client, db } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    await repo.saveEveningCheck(check);
    expect(db.evening_checks![0]).toEqual({
      date: '2026-10-24',
      tiredness: 4,
      tiredness_prov: 'confermato',
      mood: null,
      mood_prov: 'mancante',
      factors: ['caffe-tardi'],
      nap_minutes: 20,
      nap_prov: 'automatico',
      saved_at: NOW.toISOString(),
    });
    expect(await repo.getEveningCheck('2026-10-24')).toEqual(check);

    await repo.saveEveningCheck({ ...check, mood: { value: 2, provenance: 'confermato' } });
    expect(db.evening_checks).toHaveLength(1);
    expect((await repo.getEveningCheck('2026-10-24'))?.mood).toEqual({ value: 2, provenance: 'confermato' });
    expect(await repo.getEveningCheck('2026-10-25')).toBeNull();
  });

  it('saveNap mappa i campi e usa start_at come chiave', async () => {
    const { client, db, calls } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    const nap: Nap = { date: '2026-10-24', startAt: '2026-10-24T13:00:00.000Z', minutes: 25, provenance: 'stimato' };
    await repo.saveNap(nap);
    await repo.saveNap({ ...nap, minutes: 30 });
    expect(db.naps).toEqual([
      { date: '2026-10-24', start_at: '2026-10-24T13:00:00.000Z', minutes: 30, provenance: 'stimato' },
    ]);
    expect(calls[0]!.ops[0]!.args[1]).toEqual({ onConflict: 'start_at' });
  });
});

describe('createSupabaseRepo: token', () => {
  const tokens = () => [
    { id: 1, token_hash: 'h-ok', label: 'iPhone', active: true, last_used_at: null },
    { id: 2, token_hash: 'h-off', label: 'vecchio', active: false, last_used_at: null },
  ];

  it('true solo se esiste ed è attivo; aggiorna last_used_at', async () => {
    const { client, db } = fakeClient({ api_tokens: tokens() });
    const repo = createSupabaseRepo(client, fixedNow);
    expect(await repo.tokenExists('h-ok')).toBe(true);
    expect(await repo.tokenExists('h-off')).toBe(false);
    expect(await repo.tokenExists('nessuno')).toBe(false);
    expect(db.api_tokens![0]!.last_used_at).toBe(NOW.toISOString());
    expect(db.api_tokens![1]!.last_used_at).toBeNull();
  });

  it("se l'update di last_used_at fallisce la verifica riesce comunque", async () => {
    const isUpdate = (c: Call) => c.ops.some((o) => o.method === 'update');
    const failing = fakeClient({ api_tokens: tokens() }, { failWhen: (c) => (isUpdate(c) ? { message: 'x' } : null) });
    expect(await createSupabaseRepo(failing.client, fixedNow).tokenExists('h-ok')).toBe(true);
    const throwing = fakeClient({ api_tokens: tokens() }, { throwWhen: isUpdate });
    expect(await createSupabaseRepo(throwing.client, fixedNow).tokenExists('h-ok')).toBe(true);
  });

  it('errore nella lettura del token → Error', async () => {
    const { client } = fakeClient({ api_tokens: tokens() }, { failWhen: () => ({ message: 'boom' }) });
    await expect(createSupabaseRepo(client, fixedNow).tokenExists('h-ok')).rejects.toThrow(
      'Supabase: verifica token non riuscita',
    );
  });
});

describe('createServiceClient', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('lancia un errore chiaro se mancano le variabili', () => {
    expect(() => createServiceClient({})).toThrow(
      'Configurazione Supabase mancante: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
    );
    expect(() => createServiceClient({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
  });

  it('crea il client con le variabili presenti', () => {
    const c = createServiceClient({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'finta-chiave-di-test',
    });
    expect(typeof c.from).toBe('function');
  });

  it('rifiuta di girare nel browser', () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() =>
      createServiceClient({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'finta-chiave-di-test',
      }),
    ).toThrow('solo per il server');
  });
});

// ---------- Integrazione (DB reale di test): saltata finché SUPABASE_TEST_URL non è impostata ----------

describe.skipIf(!process.env.SUPABASE_TEST_URL)('integrazione Supabase (DB di test)', () => {
  const repo = () =>
    createSupabaseRepo(
      createServiceClient({
        NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_TEST_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
      }),
    );

  it('insertEvent idempotente', async () => {
    const r = repo();
    const key = `test-${Date.now()}`;
    const e = { type: 'app_open' as const, ts: new Date().toISOString(), source: 'app' as const, idempotencyKey: key };
    expect((await r.insertEvent(e)).inserted).toBe(true);
    expect((await r.insertEvent(e)).inserted).toBe(false);
  });

  it('non sovrascrive una notte confermata', async () => {
    const r = repo();
    const d = '1999-01-01';
    const n = night({ nightDate: d, status: 'confermata' });
    await r.upsertNight(n);
    expect(await r.upsertNight(night({ nightDate: d, status: 'stimata' }))).toBe(false);
    expect((await r.getNight(d))?.status).toBe('confermata');
  });
});
