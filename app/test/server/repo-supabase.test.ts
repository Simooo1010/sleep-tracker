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
  exception_types: 'slug',
  settings: 'key',
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
    exception_types: [],
    night_exceptions: [],
    questions_log: [],
    settings: [],
    ...tables,
  };
  const calls: Call[] = [];

  function exec(call: Call): { data: unknown; error: unknown } {
    const forced = opts.failWhen?.(call);
    if (forced) return { data: null, error: forced };
    const rows = db[call.table]!;
    const key = UNIQUE[call.table]!;
    const find = (m: string) => call.ops.filter((o) => o.method === m);
    const filters = call.ops.filter((o) => ['eq', 'neq', 'gte', 'lte', 'in'].includes(o.method));
    const match = (r: Row) =>
      filters.every(({ method, args: [col, v] }) => {
        const x = r[col as string] as string | number | boolean;
        if (method === 'in') return (v as unknown[]).includes(x);
        const y = v as string | number | boolean;
        if (method === 'eq') return x === y;
        if (method === 'neq') return x !== y;
        if (method === 'gte') return x >= y;
        return x <= y;
      });
    const wantsSelect = find('select').length > 0;

    const upsert = find('upsert')[0];
    if (upsert) {
      const [input, o] = upsert.args as [Row | Row[], { onConflict?: string; ignoreDuplicates?: boolean }];
      const conflictCol = o?.onConflict ?? key;
      const affected: Row[] = [];
      for (const value of ([] as Row[]).concat(input)) {
        const existing = rows.find((r) => r[conflictCol!] === value[conflictCol!]);
        if (!existing) {
          rows.push({ ...value });
          affected.push(value);
        } else if (!o?.ignoreDuplicates) {
          Object.assign(existing, value);
          affected.push(existing);
        }
      }
      return { data: wantsSelect ? affected.map((r) => ({ ...r })) : null, error: null };
    }

    const insert = find('insert')[0];
    if (insert) {
      const values = ([] as Row[]).concat(insert.args[0] as Row | Row[]);
      const added = values.map((v) =>
        call.table === 'questions_log' ? { id: rows.length + 1, ...v } : { ...v },
      );
      rows.push(...added);
      return { data: wantsSelect ? added.map((r) => ({ ...r })) : null, error: null };
    }

    if (find('delete').length) {
      const removed = rows.filter(match);
      for (const r of removed) rows.splice(rows.indexOf(r), 1);
      return { data: wantsSelect ? removed.map((r) => ({ ...r })) : null, error: null };
    }

    const update = find('update')[0];
    if (update) {
      const affected = rows.filter(match);
      affected.forEach((r) => Object.assign(r, update.args[0] as Row));
      return { data: wantsSelect ? affected.map((r) => ({ ...r })) : null, error: null };
    }

    const out = rows.filter(match).map((r) => ({ ...r }));
    const orders = find('order');
    if (orders.length) {
      out.sort((a, b) => {
        for (const { args } of orders) {
          const col = args[0] as string;
          const dir = (args[1] as { ascending?: boolean } | undefined)?.ascending === false ? -1 : 1;
          const x = a[col];
          const y = b[col];
          const c =
            typeof x === 'number' && typeof y === 'number'
              ? x - y
              : String(x).localeCompare(String(y));
          if (c !== 0) return c * dir;
        }
        return 0;
      });
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
      'delete',
      'eq',
      'neq',
      'gte',
      'lte',
      'in',
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

// ---------- Aggiunte Slice 3 ----------

const failAll = (code?: string) => ({
  failWhen: () => ({ ...(code ? { code } : {}), message: 'dato segreto 2026-10-25 nap-xyz' }),
});

describe('createSupabaseRepo: overwriteNight', () => {
  it('sostituisce anche una notte confermata, con upsert su night_date senza filtro di status', async () => {
    const { client, db, calls } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    await repo.upsertNight(night({ status: 'confermata' }));
    const replaced = night({ status: 'stimata', quality: { value: 2, provenance: 'confermato' }, factors: [] });
    const before = calls.length;
    await repo.overwriteNight(replaced);
    const call = calls[before]!;
    expect(db.nights).toHaveLength(1);
    expect(await repo.getNight('2026-10-25')).toEqual(replaced);

    expect(call.table).toBe('nights');
    expect(call.ops.map((o) => o.method)).toEqual(['upsert']);
    expect(call.ops[0]!.args[1]).toEqual({ onConflict: 'night_date' });
    expect(db.nights![0]).toMatchObject({ updated_at: NOW.toISOString() });
  });

  it('crea la notte se non esiste', async () => {
    const { client, db } = fakeClient();
    await createSupabaseRepo(client, fixedNow).overwriteNight(night());
    expect(db.nights).toHaveLength(1);
  });

  it('errore → Error breve senza dati', async () => {
    const { client } = fakeClient({}, failAll('42501'));
    const p = createSupabaseRepo(client, fixedNow).overwriteNight(night());
    await expect(p).rejects.toThrow('Supabase: sovrascrittura notte non riuscita (42501)');
    await expect(p).rejects.not.toThrow(/segreto|2026/);
  });
});

describe('createSupabaseRepo: listNaps / listEveningChecks', () => {
  const napRow = (date: string, start: string, minutes = 20) => ({
    id: 1,
    date,
    start_at: start,
    minutes,
    provenance: 'stimato',
  });

  it('listNaps: intervallo inclusivo, ordine per start_at, mapping a Nap', async () => {
    const { client, calls } = fakeClient({
      naps: [
        napRow('2026-10-25', '2026-10-25T14:00:00+00:00', 30),
        napRow('2026-10-23', '2026-10-23T13:00:00+00:00'),
        napRow('2026-10-25', '2026-10-25T09:00:00+00:00', 15),
        napRow('2026-10-20', '2026-10-20T13:00:00+00:00'),
        napRow('2026-10-26', '2026-10-26T13:00:00+00:00'),
      ],
    });
    const out = await createSupabaseRepo(client, fixedNow).listNaps('2026-10-23', '2026-10-25');
    expect(out).toEqual([
      { date: '2026-10-23', startAt: '2026-10-23T13:00:00.000Z', minutes: 20, provenance: 'stimato' },
      { date: '2026-10-25', startAt: '2026-10-25T09:00:00.000Z', minutes: 15, provenance: 'stimato' },
      { date: '2026-10-25', startAt: '2026-10-25T14:00:00.000Z', minutes: 30, provenance: 'stimato' },
    ]);
    const ops = calls[0]!.ops;
    expect(ops).toContainEqual({ method: 'gte', args: ['date', '2026-10-23'] });
    expect(ops).toContainEqual({ method: 'lte', args: ['date', '2026-10-25'] });
    expect(ops).toContainEqual({ method: 'order', args: ['start_at', { ascending: true }] });
  });

  it('listNaps: riga non valida → errore senza dati; errore client → Error breve', async () => {
    const bad = fakeClient({ naps: [{ ...napRow('2026-10-25', '2026-10-25T09:00:00+00:00'), provenance: 'boh' }] });
    await expect(createSupabaseRepo(bad.client, fixedNow).listNaps('2026-10-01', '2026-10-31')).rejects.toThrow(
      'Dato non valido letto da naps',
    );
    const { client } = fakeClient({}, failAll('XX000'));
    const p = createSupabaseRepo(client, fixedNow).listNaps('2026-10-01', '2026-10-31');
    await expect(p).rejects.toThrow('Supabase: lettura sonnellini non riuscita (XX000)');
    await expect(p).rejects.not.toThrow(/segreto|nap-xyz/);
  });

  it('listEveningChecks: intervallo inclusivo, ordine per data, mapping a EveningCheck', async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    const mk = (date: string): EveningCheck => ({
      date,
      tiredness: { value: 3, provenance: 'confermato' },
      mood: { value: null, provenance: 'mancante' },
      factors: ['caffe-tardi'],
      napMinutesToday: { value: null, provenance: 'mancante' },
    });
    for (const d of ['2026-10-25', '2026-10-22', '2026-10-24', '2026-10-30']) {
      await repo.saveEveningCheck(mk(d));
    }
    const out = await repo.listEveningChecks('2026-10-22', '2026-10-25');
    expect(out).toEqual([mk('2026-10-22'), mk('2026-10-24'), mk('2026-10-25')]);
    const ops = calls[calls.length - 1]!.ops;
    expect(ops).toContainEqual({ method: 'gte', args: ['date', '2026-10-22'] });
    expect(ops).toContainEqual({ method: 'lte', args: ['date', '2026-10-25'] });
    expect(ops).toContainEqual({ method: 'order', args: ['date', { ascending: true }] });
  });

  it('listEveningChecks: errore → Error breve senza dati', async () => {
    const { client } = fakeClient({}, failAll());
    const p = createSupabaseRepo(client, fixedNow).listEveningChecks('2026-10-01', '2026-10-31');
    await expect(p).rejects.toThrow('Supabase: lettura check serali non riuscita');
    await expect(p).rejects.not.toThrow(/segreto/);
  });
});

describe('createSupabaseRepo: eccezioni', () => {
  const types = () => [
    { slug: 'malattia', label: 'malattia', uses: 2 },
    { slug: 'viaggio', label: 'viaggio', uses: 5 },
    { slug: 'alcol', label: 'alcol', uses: 2 },
    { slug: 'festa', label: 'festa', uses: 0 },
  ];

  it('listExceptionTypes: ordina per uses desc poi label, mapping a ExceptionTypeRow', async () => {
    const { client, calls } = fakeClient({ exception_types: types() });
    const out = await createSupabaseRepo(client, fixedNow).listExceptionTypes();
    expect(out).toEqual([
      { slug: 'viaggio', label: 'viaggio', uses: 5 },
      { slug: 'alcol', label: 'alcol', uses: 2 },
      { slug: 'malattia', label: 'malattia', uses: 2 },
      { slug: 'festa', label: 'festa', uses: 0 },
    ]);
    const ops = calls[0]!.ops;
    expect(ops).toContainEqual({ method: 'select', args: ['slug, label, uses'] });
    expect(ops.filter((o) => o.method === 'order')).toEqual([
      { method: 'order', args: ['uses', { ascending: false }] },
      { method: 'order', args: ['label', { ascending: true }] },
    ]);
  });

  it('listExceptionTypes: errore → Error breve senza dati', async () => {
    const { client } = fakeClient({}, failAll('42P01'));
    const p = createSupabaseRepo(client, fixedNow).listExceptionTypes();
    await expect(p).rejects.toThrow('Supabase: lettura tipi di eccezione non riuscita (42P01)');
    await expect(p).rejects.not.toThrow(/segreto/);
  });

  describe('setNightExceptions', () => {
    const setup = (current: string[] = []) =>
      fakeClient({
        nights: [{ night_date: '2026-10-25' }, { night_date: '2026-10-24' }],
        exception_types: types(),
        night_exceptions: [
          ...current.map((slug) => ({ night_date: '2026-10-25', slug })),
          { night_date: '2026-10-24', slug: 'festa' },
        ],
      });
    const usesOf = (db: Record<string, Row[]>) =>
      Object.fromEntries(db.exception_types!.map((r) => [r.slug, r.uses]));

    it('aggiunge: inserisce le associazioni e fa uses +1 solo per i nuovi', async () => {
      const { client, db } = setup(['malattia']);
      await createSupabaseRepo(client, fixedNow).setNightExceptions('2026-10-25', ['malattia', 'viaggio', 'alcol']);
      expect(db.night_exceptions!.filter((r) => r.night_date === '2026-10-25').map((r) => r.slug).sort()).toEqual([
        'alcol',
        'malattia',
        'viaggio',
      ]);
      expect(usesOf(db)).toEqual({ malattia: 2, viaggio: 6, alcol: 3, festa: 0 });
    });

    it('rimuove: cancella solo le righe di quella notte e fa uses -1, mai sotto 0', async () => {
      const { client, db, calls } = setup(['malattia', 'festa']);
      await createSupabaseRepo(client, fixedNow).setNightExceptions('2026-10-25', ['malattia']);
      expect(db.night_exceptions).toEqual([
        { night_date: '2026-10-25', slug: 'malattia' },
        { night_date: '2026-10-24', slug: 'festa' },
      ]);
      expect(usesOf(db)).toEqual({ malattia: 2, viaggio: 5, alcol: 2, festa: 0 });
      const del = calls.find((c) => c.ops.some((o) => o.method === 'delete'))!;
      expect(del.table).toBe('night_exceptions');
      expect(del.ops).toContainEqual({ method: 'eq', args: ['night_date', '2026-10-25'] });
      expect(del.ops).toContainEqual({ method: 'in', args: ['slug', ['festa']] });
    });

    it('sostituzione mista, deduplica e nessuna modifica per gli slug invariati', async () => {
      const { client, db, calls } = setup(['malattia', 'viaggio']);
      await createSupabaseRepo(client, fixedNow).setNightExceptions('2026-10-25', ['alcol', 'viaggio', 'alcol']);
      expect(db.night_exceptions!.filter((r) => r.night_date === '2026-10-25').map((r) => r.slug).sort()).toEqual([
        'alcol',
        'viaggio',
      ]);
      expect(usesOf(db)).toEqual({ malattia: 1, viaggio: 5, alcol: 3, festa: 0 });
      const updates = calls.filter((c) => c.ops.some((o) => o.method === 'update'));
      expect(updates.map((c) => c.ops.find((o) => o.method === 'eq')!.args[1]).sort()).toEqual(['alcol', 'malattia']);
    });

    it('slug sconosciuto: creato con label derivata e uses 0, poi portato a 1', async () => {
      const { client, db, calls } = setup();
      await createSupabaseRepo(client, fixedNow).setNightExceptions('2026-10-25', ['notte-in-bianco', 'viaggio']);
      expect(db.exception_types).toContainEqual({ slug: 'notte-in-bianco', label: 'notte in bianco', uses: 1 });
      expect(usesOf(db).viaggio).toBe(6);
      const create = calls.find((c) => c.table === 'exception_types' && c.ops.some((o) => o.method === 'upsert'))!;
      expect(create.ops[0]).toEqual({
        method: 'upsert',
        args: [[{ slug: 'notte-in-bianco', label: 'notte in bianco', uses: 0 }], { onConflict: 'slug', ignoreDuplicates: true }],
      });
      // Il tipo esiste prima dell'associazione (vincolo FK).
      const idx = (pred: (c: Call) => boolean) => calls.findIndex(pred);
      expect(idx((c) => c === create)).toBeLessThan(
        idx((c) => c.table === 'night_exceptions' && c.ops.some((o) => o.method === 'insert')),
      );
    });

    it('lista vuota: cancella tutto e scala i contatori; slug già presenti non toccano uses', async () => {
      const { client, db } = setup(['viaggio', 'festa']);
      const repo = createSupabaseRepo(client, fixedNow);
      await repo.setNightExceptions('2026-10-25', ['viaggio', 'festa']);
      expect(usesOf(db)).toEqual({ malattia: 2, viaggio: 5, alcol: 2, festa: 0 });
      await repo.setNightExceptions('2026-10-25', []);
      expect(db.night_exceptions).toEqual([{ night_date: '2026-10-24', slug: 'festa' }]);
      expect(usesOf(db)).toEqual({ malattia: 2, viaggio: 4, alcol: 2, festa: 0 });
    });

    it('slug non valido → Error("Slug non valido.") prima di qualunque scrittura', async () => {
      for (const bad of ['Viaggio', 'a b', 'x_y', '-x', 'x-', 'a--b', '']) {
        const { client, calls } = setup();
        await expect(
          createSupabaseRepo(client, fixedNow).setNightExceptions('2026-10-25', ['viaggio', bad]),
        ).rejects.toThrow('Slug non valido.');
        expect(calls).toHaveLength(0);
      }
    });

    it('notte inesistente → Error("Notte non trovata.") senza creare nulla', async () => {
      const { client, db } = setup();
      await expect(
        createSupabaseRepo(client, fixedNow).setNightExceptions('2026-01-01', ['nuovo-tipo']),
      ).rejects.toThrow('Notte non trovata.');
      expect(db.exception_types).toHaveLength(4);
      expect(db.night_exceptions).toHaveLength(1);
    });

    it('errori del client → Error breve senza dati', async () => {
      const tables = ['nights', 'night_exceptions', 'exception_types'];
      for (const t of tables) {
        const { client } = fakeClient(
          { nights: [{ night_date: '2026-10-25' }], exception_types: types(), night_exceptions: [{ night_date: '2026-10-25', slug: 'festa' }] },
          { failWhen: (c) => (c.table === t ? { code: '23503', message: 'dato segreto 2026-10-25' } : null) },
        );
        const p = createSupabaseRepo(client, fixedNow).setNightExceptions('2026-10-25', ['nuovo-tipo']);
        await expect(p).rejects.toThrow(/^Supabase: .+ non riuscita \(23503\)$/);
        await expect(p).rejects.not.toThrow(/segreto|2026/);
      }
    });
  });

  it('listNightExceptions: intervallo, slug in ordine alfabetico, solo notti con eccezioni', async () => {
    const { client, calls } = fakeClient({
      night_exceptions: [
        { night_date: '2026-10-25', slug: 'viaggio' },
        { night_date: '2026-10-25', slug: 'alcol' },
        { night_date: '2026-10-23', slug: 'festa' },
        { night_date: '2026-10-20', slug: 'malattia' },
        { night_date: '2026-10-26', slug: 'malattia' },
      ],
    });
    const out = await createSupabaseRepo(client, fixedNow).listNightExceptions('2026-10-23', '2026-10-25');
    expect(out).toEqual({ '2026-10-23': ['festa'], '2026-10-25': ['alcol', 'viaggio'] });
    expect(calls[0]!.ops).toContainEqual({ method: 'gte', args: ['night_date', '2026-10-23'] });
    expect(calls[0]!.ops).toContainEqual({ method: 'lte', args: ['night_date', '2026-10-25'] });
    expect(await createSupabaseRepo(client, fixedNow).listNightExceptions('2027-01-01', '2027-01-31')).toEqual({});
  });

  it('listNightExceptions: errore → Error breve senza dati', async () => {
    const { client } = fakeClient({}, failAll('XX000'));
    const p = createSupabaseRepo(client, fixedNow).listNightExceptions('2026-10-01', '2026-10-31');
    await expect(p).rejects.toThrow('Supabase: lettura eccezioni non riuscita (XX000)');
    await expect(p).rejects.not.toThrow(/segreto/);
  });
});

describe('createSupabaseRepo: domande e impostazioni', () => {
  it('logQuestion mappa i campi (nightDate assente → null)', async () => {
    const { client, db } = fakeClient();
    const repo = createSupabaseRepo(client, fixedNow);
    await repo.logQuestion({ date: '2026-10-25', kind: 'confirm_night', nightDate: '2026-10-25', answeredOrSkipped: true });
    await repo.logQuestion({ date: '2026-10-25', kind: 'energy', answeredOrSkipped: false });
    expect(db.questions_log!.map((r) => ({ ...r, id: undefined }))).toEqual([
      { date: '2026-10-25', kind: 'confirm_night', night_date: '2026-10-25', answered_or_skipped: true },
      { date: '2026-10-25', kind: 'energy', night_date: null, answered_or_skipped: false },
    ]);
  });

  it('listQuestions: intervallo, ordine per id, mapping a QuestionLogRow', async () => {
    const { client, calls } = fakeClient({
      questions_log: [
        { id: 3, date: '2026-10-25', kind: 'quality', night_date: null, answered_or_skipped: false },
        { id: 1, date: '2026-10-24', kind: 'confirm_night', night_date: '2026-10-24', answered_or_skipped: true },
        { id: 2, date: '2026-10-25', kind: 'exception', night_date: '2026-10-25', answered_or_skipped: false },
        { id: 4, date: '2026-10-20', kind: 'factors', night_date: null, answered_or_skipped: true },
        { id: 10, date: '2026-10-25', kind: 'nap_today', night_date: null, answered_or_skipped: true },
      ],
    });
    const out = await createSupabaseRepo(client, fixedNow).listQuestions('2026-10-24', '2026-10-25');
    expect(out).toEqual([
      { date: '2026-10-24', kind: 'confirm_night', nightDate: '2026-10-24', answeredOrSkipped: true },
      { date: '2026-10-25', kind: 'exception', nightDate: '2026-10-25', answeredOrSkipped: false },
      { date: '2026-10-25', kind: 'quality', answeredOrSkipped: false },
      { date: '2026-10-25', kind: 'nap_today', answeredOrSkipped: true },
    ]);
    expect(out[2]).not.toHaveProperty('nightDate');
    const ops = calls[0]!.ops;
    expect(ops).toContainEqual({ method: 'gte', args: ['date', '2026-10-24'] });
    expect(ops).toContainEqual({ method: 'lte', args: ['date', '2026-10-25'] });
    expect(ops).toContainEqual({ method: 'order', args: ['id', { ascending: true }] });
  });

  it('listQuestions: kind non valido → errore senza dati', async () => {
    const { client } = fakeClient({
      questions_log: [{ id: 1, date: '2026-10-25', kind: 'boh', night_date: null, answered_or_skipped: true }],
    });
    await expect(createSupabaseRepo(client, fixedNow).listQuestions('2026-10-01', '2026-10-31')).rejects.toThrow(
      'Dato non valido letto da questions_log',
    );
  });

  it('errori del client su logQuestion / listQuestions → Error breve senza dati', async () => {
    const { client } = fakeClient({}, failAll('23514'));
    const repo = createSupabaseRepo(client, fixedNow);
    const a = repo.logQuestion({ date: '2026-10-25', kind: 'energy', answeredOrSkipped: false });
    await expect(a).rejects.toThrow('Supabase: registrazione domanda non riuscita (23514)');
    await expect(a).rejects.not.toThrow(/segreto|2026/);
    const b = repo.listQuestions('2026-10-01', '2026-10-31');
    await expect(b).rejects.toThrow('Supabase: lettura domande non riuscita (23514)');
    await expect(b).rejects.not.toThrow(/segreto|2026/);
  });

  it('getSetting: valore JSON tipizzato, null se assente, maybeSingle sulla chiave', async () => {
    const { client, calls } = fakeClient({
      settings: [
        { key: 'target_sleep_minutes', value: 450 },
        { key: 'timezone', value: 'Europe/Rome' },
        { key: 'prefs', value: { a: [1, 2] } },
      ],
    });
    const repo = createSupabaseRepo(client, fixedNow);
    expect(await repo.getSetting<number>('target_sleep_minutes')).toBe(450);
    expect(await repo.getSetting<string>('timezone')).toBe('Europe/Rome');
    expect(await repo.getSetting('prefs')).toEqual({ a: [1, 2] });
    expect(await repo.getSetting('assente')).toBeNull();
    const ops = calls[0]!.ops;
    expect(ops).toContainEqual({ method: 'select', args: ['value'] });
    expect(ops).toContainEqual({ method: 'eq', args: ['key', 'target_sleep_minutes'] });
    expect(ops.some((o) => o.method === 'maybeSingle')).toBe(true);
  });

  it('getSetting: errore → Error breve senza dati', async () => {
    const { client } = fakeClient({}, failAll('XX000'));
    const p = createSupabaseRepo(client, fixedNow).getSetting('timezone');
    await expect(p).rejects.toThrow('Supabase: lettura impostazione non riuscita (XX000)');
    await expect(p).rejects.not.toThrow(/segreto|timezone/);
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
