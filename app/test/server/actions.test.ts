import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Night } from '@/domain/types';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth-server', () => ({ isAuthorized: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getPepper: vi.fn() }));
vi.mock('@/server/repo-factory', () => ({ getRepo: vi.fn() }));
vi.mock('@/server/mutations', () => ({
  confirmNight: vi.fn(),
  undoConfirmNight: vi.fn(),
  rateNight: vi.fn(),
  setExceptions: vi.fn(),
  saveEveningCheckFromUi: vi.fn(),
  recordQuestion: vi.fn(),
  napFromUi: vi.fn(),
  createApiToken: vi.fn(),
  revokeApiToken: vi.fn(),
}));

import { revalidatePath } from 'next/cache';

import {
  actionConfirmNight,
  actionCreateApiToken,
  actionNap,
  actionRateNight,
  actionRecordQuestion,
  actionRevokeApiToken,
  actionSaveEveningCheck,
  actionSetExceptions,
  actionUndoConfirmNight,
} from '@/app/actions';
import { getPepper } from '@/lib/auth';
import { isAuthorized } from '@/lib/auth-server';
import * as mutations from '@/server/mutations';
import { getRepo } from '@/server/repo-factory';

const fakeRepo = { fake: true };
const INVALID = { ok: false, error: 'Dati non validi.' };
const UNAUTHORIZED = { ok: false, error: 'Accesso richiesto.' };
const PEPPER = 'pepper-di-prova-abbastanza-lungo';
const TOKEN = 'st_' + 'A'.repeat(43);
const tokenInfo = { id: 3, label: 'iPhone', active: true, createdAt: '2026-10-25T08:00:00.000Z', lastUsedAt: null };

const night: Night = {
  nightDate: '2026-10-25',
  bedAt: { value: '2026-10-24T22:30:00.000Z', provenance: 'confermato' },
  wakeAt: { value: '2026-10-25T05:30:00.000Z', provenance: 'confermato' },
  status: 'confermata',
  quality: { value: 4, provenance: 'confermato' },
  energy: { value: null, provenance: 'mancante' },
  isException: false,
  factors: ['schermo-a-letto'],
};

interface Case {
  name: string;
  action: (input: unknown) => Promise<unknown>;
  mutation: ReturnType<typeof vi.fn>;
  valid: unknown;
  /** Argomenti attesi dopo `repo`. */
  expectedArgs: unknown[];
  success: unknown;
  expectedValue?: unknown;
  invalid: unknown[];
}

const cases: Case[] = [
  {
    name: 'actionConfirmNight',
    action: actionConfirmNight,
    mutation: vi.mocked(mutations.confirmNight),
    valid: { nightDate: '2026-10-25', bedAt: '2026-10-24T23:30:00+01:00' },
    expectedArgs: [{ nightDate: '2026-10-25', bedAt: '2026-10-24T23:30:00+01:00' }],
    success: { night, previous: null },
    expectedValue: { night, previous: null },
    invalid: [
      null,
      {},
      { nightDate: '25/10/2026' },
      { nightDate: '2026-10-25', bedAt: 'ieri sera' },
      { nightDate: '2026-10-25', extra: 1 },
    ],
  },
  {
    name: 'actionUndoConfirmNight',
    action: actionUndoConfirmNight,
    mutation: vi.mocked(mutations.undoConfirmNight),
    valid: { previous: night, nightDate: '2026-10-25' },
    expectedArgs: [night, '2026-10-25'],
    success: undefined,
    invalid: [
      {},
      { nightDate: '2026-10-25' },
      { previous: { ...night, status: 'boh' }, nightDate: '2026-10-25' },
      { previous: null, nightDate: 'oggi' },
    ],
  },
  {
    name: 'actionRateNight',
    action: actionRateNight,
    mutation: vi.mocked(mutations.rateNight),
    valid: { nightDate: '2026-10-25', energy: 3, quality: 5 },
    expectedArgs: [{ nightDate: '2026-10-25', energy: 3, quality: 5 }],
    success: night,
    expectedValue: night,
    invalid: [{ nightDate: '2026-10-25', energy: 0 }, { nightDate: '2026-10-25', quality: 6 }, { nightDate: '2026-10-25', energy: 2.5 }, 'x'],
  },
  {
    name: 'actionSetExceptions',
    action: actionSetExceptions,
    mutation: vi.mocked(mutations.setExceptions),
    valid: { nightDate: '2026-10-25', slugs: ['malattia', 'viaggio-lungo'] },
    expectedArgs: [{ nightDate: '2026-10-25', slugs: ['malattia', 'viaggio-lungo'] }],
    success: undefined,
    invalid: [
      { nightDate: '2026-10-25' },
      { nightDate: '2026-10-25', slugs: ['Non Slug'] },
      { nightDate: '2026-10-25', slugs: ['a'.repeat(41)] },
      { nightDate: '2026-10-25', slugs: Array.from({ length: 13 }, (_, i) => `s${i}`) },
    ],
  },
  {
    name: 'actionSaveEveningCheck',
    action: actionSaveEveningCheck,
    mutation: vi.mocked(mutations.saveEveningCheckFromUi),
    valid: { date: '2026-10-24', tiredness: 4, factors: ['caffe-tardi'], napMinutesToday: 20 },
    expectedArgs: [{ date: '2026-10-24', tiredness: 4, factors: ['caffe-tardi'], napMinutesToday: 20 }],
    success: undefined,
    invalid: [
      { date: '2026-10-24', mood: 9 },
      { date: '2026-10-24', napMinutesToday: 601 },
      { date: '2026-10-24', napMinutesToday: -1 },
      { date: '2026-10-24', napMinutesToday: 1.5 },
      { tiredness: 3 },
    ],
  },
  {
    name: 'actionRecordQuestion',
    action: actionRecordQuestion,
    mutation: vi.mocked(mutations.recordQuestion),
    valid: { date: '2026-10-25', kind: 'energy', nightDate: '2026-10-25', answeredOrSkipped: true },
    expectedArgs: [{ date: '2026-10-25', kind: 'energy', nightDate: '2026-10-25', answeredOrSkipped: true }],
    success: undefined,
    invalid: [
      { date: '2026-10-25', kind: 'altro', answeredOrSkipped: true },
      { date: '2026-10-25', kind: 'energy' },
      { date: '2026-10-25', kind: 'energy', answeredOrSkipped: 'si' },
    ],
  },
  {
    name: 'actionCreateApiToken',
    action: actionCreateApiToken,
    mutation: vi.mocked(mutations.createApiToken),
    valid: { label: '  iPhone  ' },
    expectedArgs: [{ label: 'iPhone' }, PEPPER],
    success: { token: TOKEN, info: tokenInfo },
    expectedValue: { token: TOKEN, info: tokenInfo },
    invalid: [
      null,
      {},
      { label: '' },
      { label: '   ' },
      { label: 'x'.repeat(41) },
      { label: 5 },
      { label: 'iPhone', extra: 1 },
    ],
  },
  {
    name: 'actionRevokeApiToken',
    action: actionRevokeApiToken,
    mutation: vi.mocked(mutations.revokeApiToken),
    valid: { id: 3 },
    expectedArgs: [3],
    success: undefined,
    invalid: [null, {}, { id: 0 }, { id: -2 }, { id: 1.5 }, { id: '3' }, { id: 3, extra: 1 }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthorized).mockResolvedValue(true);
  vi.mocked(getPepper).mockResolvedValue(PEPPER);
  vi.mocked(getRepo).mockReturnValue(fakeRepo as never);
});

describe.each(cases)('$name', (c) => {
  it('non autorizzato: "Accesso richiesto." senza toccare repo, mutation né cache', async () => {
    vi.mocked(isAuthorized).mockResolvedValue(false);
    for (const input of [c.valid, ...c.invalid]) {
      expect(await c.action(input)).toEqual(UNAUTHORIZED);
    }
    expect(getRepo).not.toHaveBeenCalled();
    expect(c.mutation).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('input invalido: "Dati non validi." senza chiamare la mutation', async () => {
    for (const bad of c.invalid) {
      expect(await c.action(bad)).toEqual(INVALID);
    }
    expect(c.mutation).not.toHaveBeenCalled();
    expect(getRepo).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('input valido: chiama la mutation con i parametri giusti e invalida la cache', async () => {
    c.mutation.mockResolvedValue({ ok: true, value: c.success });
    const res = await c.action(c.valid);
    expect(c.mutation).toHaveBeenCalledTimes(1);
    expect(c.mutation).toHaveBeenCalledWith(fakeRepo, ...c.expectedArgs);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(res).toEqual(c.expectedValue === undefined ? { ok: true } : { ok: true, value: c.expectedValue });
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
  });

  it("l'errore della mutation è propagato e la cache non viene invalidata", async () => {
    c.mutation.mockResolvedValue({ ok: false, error: 'Notte non trovata.' });
    const res = await c.action(c.valid);
    expect(res).toEqual({ ok: false, error: 'Notte non trovata.' });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
  });

  it('getRepo che lancia: "Servizio non configurato."', async () => {
    vi.mocked(getRepo).mockImplementation(() => {
      throw new Error('SUPABASE_URL mancante: segreto-da-non-esporre');
    });
    const res = await c.action(c.valid);
    expect(res).toEqual({ ok: false, error: 'Servizio non configurato.' });
    expect(JSON.stringify(res)).not.toContain('segreto');
    expect(c.mutation).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('una mutation che lancia diventa un errore generico serializzabile', async () => {
    c.mutation.mockRejectedValue(new Error('dettaglio interno'));
    const res = await c.action(c.valid);
    expect(res).toEqual({ ok: false, error: 'Operazione non riuscita.' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('actionSetExceptions: labels', () => {
  const base = { nightDate: '2026-10-25', slugs: ['trasloco'] };

  it('accetta labels e le passa alla mutation (trim)', async () => {
    vi.mocked(mutations.setExceptions).mockResolvedValue({ ok: true, value: undefined });
    const res = await actionSetExceptions({ ...base, labels: { trasloco: '  Trasloco casa ' } });
    expect(res).toEqual({ ok: true });
    expect(mutations.setExceptions).toHaveBeenCalledWith(fakeRepo, { ...base, labels: { trasloco: 'Trasloco casa' } });
  });

  it('labels invalide respinte: chiave non slug, label vuota o oltre 30, più di 12 voci, non oggetto', async () => {
    const twelvePlusOne = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`s${i}`, 'x']));
    const bad = [
      { 'Non Slug': 'x' },
      { trasloco: '' },
      { trasloco: '   ' },
      { trasloco: 'a'.repeat(31) },
      { trasloco: 5 },
      twelvePlusOne,
      'trasloco',
      [],
    ];
    for (const labels of bad) {
      expect(await actionSetExceptions({ ...base, labels })).toEqual(INVALID);
    }
    expect(mutations.setExceptions).not.toHaveBeenCalled();
  });

  it('label lunga esattamente 30 e 12 voci sono accettate', async () => {
    vi.mocked(mutations.setExceptions).mockResolvedValue({ ok: true, value: undefined });
    const twelve = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${i}`, 'x']));
    expect(await actionSetExceptions({ ...base, labels: { trasloco: 'a'.repeat(30) } })).toEqual({ ok: true });
    expect(await actionSetExceptions({ ...base, labels: twelve })).toEqual({ ok: true });
  });
});

describe('actionSaveEveningCheck: dayNote', () => {
  const base = { date: '2026-10-24' };

  it('trim e passaggio alla mutation', async () => {
    vi.mocked(mutations.saveEveningCheckFromUi).mockResolvedValue({ ok: true, value: undefined });
    await actionSaveEveningCheck({ ...base, dayNote: '  esame di fisica ' });
    expect(mutations.saveEveningCheckFromUi).toHaveBeenCalledWith(fakeRepo, { ...base, dayNote: 'esame di fisica' });
  });

  it('vuota o solo spazi diventa null; null resta null', async () => {
    vi.mocked(mutations.saveEveningCheckFromUi).mockResolvedValue({ ok: true, value: undefined });
    await actionSaveEveningCheck({ ...base, dayNote: '   ' });
    await actionSaveEveningCheck({ ...base, dayNote: null });
    const calls = vi.mocked(mutations.saveEveningCheckFromUi).mock.calls;
    expect(calls[0]?.[1]).toEqual({ ...base, dayNote: null });
    expect(calls[1]?.[1]).toEqual({ ...base, dayNote: null });
  });

  it('assente: la chiave non arriva alla mutation', async () => {
    vi.mocked(mutations.saveEveningCheckFromUi).mockResolvedValue({ ok: true, value: undefined });
    await actionSaveEveningCheck({ ...base, mood: 3 });
    expect(vi.mocked(mutations.saveEveningCheckFromUi).mock.calls[0]?.[1]).toStrictEqual({ ...base, mood: 3 });
  });

  it('limite 280 (dopo il trim): 280 ok, 281 respinta, tipo errato respinto', async () => {
    vi.mocked(mutations.saveEveningCheckFromUi).mockResolvedValue({ ok: true, value: undefined });
    expect(await actionSaveEveningCheck({ ...base, dayNote: ` ${'a'.repeat(280)} ` })).toEqual({ ok: true });
    vi.mocked(mutations.saveEveningCheckFromUi).mockClear();
    expect(await actionSaveEveningCheck({ ...base, dayNote: 'a'.repeat(281) })).toEqual(INVALID);
    expect(await actionSaveEveningCheck({ ...base, dayNote: 5 })).toEqual(INVALID);
    expect(mutations.saveEveningCheckFromUi).not.toHaveBeenCalled();
  });
});

describe('actionConfirmNight / actionRateNight / actionSaveEveningCheck: campi opzionali', () => {
  it('non passa chiavi undefined alla mutation', async () => {
    vi.mocked(mutations.confirmNight).mockResolvedValue({ ok: true, value: { night, previous: null } });
    await actionConfirmNight({ nightDate: '2026-10-25' });
    const arg = vi.mocked(mutations.confirmNight).mock.calls[0]?.[1];
    expect(arg).toStrictEqual({ nightDate: '2026-10-25' });
  });
});

describe('actionUndoConfirmNight con previous null', () => {
  it('accetta previous null', async () => {
    vi.mocked(mutations.undoConfirmNight).mockResolvedValue({ ok: true, value: undefined });
    const res = await actionUndoConfirmNight({ previous: null, nightDate: '2026-10-25' });
    expect(mutations.undoConfirmNight).toHaveBeenCalledWith(fakeRepo, null, '2026-10-25');
    expect(res).toEqual({ ok: true });
  });
});

describe('actionNap', () => {
  it('non autorizzato: "Accesso richiesto." senza toccare repo, mutation né cache', async () => {
    vi.mocked(isAuthorized).mockResolvedValue(false);
    expect(await actionNap({ action: 'start' })).toEqual(UNAUTHORIZED);
    expect(await actionNap({})).toEqual(UNAUTHORIZED);
    expect(getRepo).not.toHaveBeenCalled();
    expect(mutations.napFromUi).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('input invalido: "Dati non validi."', async () => {
    for (const bad of [{}, { action: 'pause' }, { action: 'start', extra: 1 }, null]) {
      expect(await actionNap(bad)).toEqual(INVALID);
    }
    expect(mutations.napFromUi).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(['start', 'stop'] as const)('%s: passa new Date() e restituisce nightDate', async (action) => {
    vi.mocked(mutations.napFromUi).mockResolvedValue({ ok: true, value: { nightDate: '2026-10-25' } });
    const before = Date.now();
    const res = await actionNap({ action });
    const after = Date.now();
    const [repo, act, now] = vi.mocked(mutations.napFromUi).mock.calls[0] ?? [];
    expect(repo).toBe(fakeRepo);
    expect(act).toBe(action);
    expect(now).toBeInstanceOf(Date);
    expect((now as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((now as Date).getTime()).toBeLessThanOrEqual(after);
    expect(res).toEqual({ ok: true, value: { nightDate: '2026-10-25' } });
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('nightDate null è un valore valido e serializzabile', async () => {
    vi.mocked(mutations.napFromUi).mockResolvedValue({ ok: true, value: { nightDate: null } });
    expect(await actionNap({ action: 'stop' })).toEqual({ ok: true, value: { nightDate: null } });
  });

  it('errore della mutation propagato, getRepo che lancia gestito', async () => {
    vi.mocked(mutations.napFromUi).mockResolvedValue({ ok: false, error: 'Nessun sonnellino in corso.' });
    expect(await actionNap({ action: 'stop' })).toEqual({ ok: false, error: 'Nessun sonnellino in corso.' });
    expect(revalidatePath).not.toHaveBeenCalled();

    vi.mocked(getRepo).mockImplementation(() => {
      throw new Error('x');
    });
    expect(await actionNap({ action: 'start' })).toEqual({ ok: false, error: 'Servizio non configurato.' });
  });
});

describe('actionCreateApiToken', () => {
  it('senza pepper: "Accesso non configurato." e nessun token creato', async () => {
    vi.mocked(getPepper).mockResolvedValue(null);
    const res = await actionCreateApiToken({ label: 'iPhone' });
    expect(res).toEqual({ ok: false, error: 'Accesso non configurato.' });
    expect(mutations.createApiToken).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('il token in chiaro esce solo dalla creazione e la risposta non rivela il pepper', async () => {
    vi.mocked(mutations.createApiToken).mockResolvedValue({ ok: true, value: { token: TOKEN, info: tokenInfo } });
    const res = await actionCreateApiToken({ label: 'iPhone' });
    expect(res).toEqual({ ok: true, value: { token: TOKEN, info: tokenInfo } });
    expect(JSON.stringify(res)).not.toContain(PEPPER);

    vi.mocked(mutations.revokeApiToken).mockResolvedValue({ ok: true, value: undefined });
    const revoked = await actionRevokeApiToken({ id: 3 });
    expect(revoked).toEqual({ ok: true });
    expect(JSON.stringify(revoked)).not.toContain('st_');
  });

  it('errore calmo per troppi token attivi', async () => {
    vi.mocked(mutations.createApiToken).mockResolvedValue({ ok: false, error: 'Hai già troppi token attivi. Revocane uno.' });
    expect(await actionCreateApiToken({ label: 'iPhone' })).toEqual({
      ok: false,
      error: 'Hai già troppi token attivi. Revocane uno.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('getPepper che lancia diventa un errore generico senza dettagli', async () => {
    vi.mocked(getPepper).mockRejectedValue(new Error('segreto-interno'));
    const res = await actionCreateApiToken({ label: 'iPhone' });
    expect(res).toEqual({ ok: false, error: 'Operazione non riuscita.' });
    expect(JSON.stringify(res)).not.toContain('segreto');
  });
});
