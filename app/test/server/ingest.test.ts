import { describe, expect, it } from 'vitest';
import { durationMinutes } from '../../src/domain/time';
import type { Night, SignalType } from '../../src/domain/types';
import { ingestEvent, nightDateForEvent, type ValidatedEvent } from '../../src/server/ingest';
import { MemoryRepo } from '../../src/server/memory-repo';

// Ottobre 2026: Europe/Rome in CEST (UTC+2) fino al 25/10 alle 03:00, poi CET (UTC+1).
const NOW = new Date('2026-10-24T12:00:00Z');

let seq = 0;
function ev(type: SignalType, ts: string, extra: Partial<ValidatedEvent> = {}): ValidatedEvent {
  seq += 1;
  return { type, ts, idempotencyKey: `${type}-${ts}-${seq}`, ...extra };
}

const MISSING = { value: null, provenance: 'mancante' } as const;

function night(nightDate: string, bedIso: string | null, wakeIso: string | null, over: Partial<Night> = {}): Night {
  return {
    nightDate,
    bedAt: bedIso ? { value: bedIso, provenance: 'automatico' } : { ...MISSING },
    wakeAt: wakeIso ? { value: wakeIso, provenance: 'automatico' } : { ...MISSING },
    status: 'stimata',
    quality: { ...MISSING },
    energy: { ...MISSING },
    isException: false,
    factors: [],
    ...over,
  };
}

describe('ingestEvent', () => {
  it('giornata completa: bedtime_candidate → evening_check → wake produce una notte stimata automatica', async () => {
    const repo = new MemoryRepo();

    const r1 = await ingestEvent(repo, ev('bedtime_candidate', '2026-10-20T21:10:00Z'), NOW);
    expect(r1).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-21' });

    const r2 = await ingestEvent(
      repo,
      ev('evening_check', '2026-10-20T21:05:00Z', {
        check: { tiredness: 4, mood: 3, factors: ['schermo-a-letto'] },
      }),
      NOW,
    );
    expect(r2).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-21' });

    const r3 = await ingestEvent(repo, ev('wake', '2026-10-21T05:05:00Z'), NOW);
    expect(r3).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-21' });

    expect(repo.events).toHaveLength(3);
    expect(repo.events.every((e) => e.source === 'comandi')).toBe(true);
    expect(repo.checks).toEqual([
      {
        date: '2026-10-20',
        tiredness: { value: 4, provenance: 'confermato' },
        mood: { value: 3, provenance: 'confermato' },
        factors: ['schermo-a-letto'],
        napMinutesToday: { value: null, provenance: 'mancante' },
      },
    ]);
    expect(repo.naps).toEqual([]);

    const n = await repo.getNight('2026-10-21');
    expect(n).toEqual(
      night('2026-10-21', '2026-10-20T21:10:00Z', '2026-10-21T05:05:00Z', { factors: ['schermo-a-letto'] }),
    );
  });

  it('duplicato: stessa idempotencyKey → duplicate:true, nessun ricalcolo', async () => {
    const repo = new MemoryRepo();
    const wake = ev('wake', '2026-10-21T05:05:00Z');
    await ingestEvent(repo, wake, NOW);
    const before = repo.nights;

    // Anche con un ts diverso la chiave decide: l'evento non viene salvato né ricalcolato.
    const again = await ingestEvent(repo, { ...wake, ts: '2026-10-21T06:00:00Z' }, NOW);
    expect(again).toEqual({ ok: true, duplicate: true, nightDate: '2026-10-21' });
    expect(repo.events).toHaveLength(1);
    expect(repo.nights).toEqual(before);

    expect(await ingestEvent(repo, wake, NOW)).toEqual({ ok: true, duplicate: true, nightDate: '2026-10-21' });
  });

  it('solo wake: risveglio automatico, letto mancante senza storico', async () => {
    const repo = new MemoryRepo();
    const r = await ingestEvent(repo, ev('wake', '2026-10-21T05:05:00Z'), NOW);
    expect(r).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-21' });
    expect(await repo.getNight('2026-10-21')).toEqual(night('2026-10-21', null, '2026-10-21T05:05:00Z'));
  });

  it('solo wake con storico: il letto viene stimato dalle notti precedenti', async () => {
    // Martedì–venerdì 13–16 ottobre: letto 23:00, sveglia 07:00 locali (CEST).
    const history = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((d) => {
      const prev = `2026-10-${String(Number(d.slice(8)) - 1).padStart(2, '0')}`;
      return night(d, `${prev}T21:00:00.000Z`, `${d}T05:00:00.000Z`);
    });
    const repo = new MemoryRepo({ nights: history });

    await ingestEvent(repo, ev('wake', '2026-10-21T05:05:00Z'), NOW);
    const n = await repo.getNight('2026-10-21');
    expect(n?.status).toBe('stimata');
    expect(n?.wakeAt).toEqual({ value: '2026-10-21T05:05:00Z', provenance: 'automatico' });
    expect(n?.bedAt).toEqual({ value: '2026-10-20T21:00:00.000Z', provenance: 'stimato' });
  });

  it('solo app_open: risveglio stimato (limite superiore)', async () => {
    const repo = new MemoryRepo();
    const r = await ingestEvent(repo, ev('app_open', '2026-10-21T06:30:00Z'), NOW);
    expect(r).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-21' });
    const n = await repo.getNight('2026-10-21');
    expect(n?.status).toBe('stimata');
    expect(n?.wakeAt).toEqual({ value: '2026-10-21T06:30:00Z', provenance: 'stimato' });
    expect(n?.bedAt).toEqual(MISSING);
  });

  it('evento fuori finestra: salvato, nightDate null, nessuna notte', async () => {
    const repo = new MemoryRepo();
    // 15:00 locali: oltre le 14:00.
    expect(await ingestEvent(repo, ev('wake', '2026-10-21T13:00:00Z'), NOW)).toEqual({
      ok: true,
      duplicate: false,
      nightDate: null,
    });
    // 02:00 locali: prima delle 03:00.
    expect(await ingestEvent(repo, ev('app_open', '2026-10-21T00:00:00Z'), NOW)).toEqual({
      ok: true,
      duplicate: false,
      nightDate: null,
    });
    expect(repo.events).toHaveLength(2);
    expect(repo.nights).toEqual([]);
  });

  it('notte confermata: mai sovrascritta, nessun errore', async () => {
    const confirmed = night('2026-10-21', '2026-10-20T21:30:00Z', '2026-10-21T05:30:00Z', {
      status: 'confermata',
      bedAt: { value: '2026-10-20T21:30:00Z', provenance: 'confermato' },
      wakeAt: { value: '2026-10-21T05:30:00Z', provenance: 'confermato' },
      quality: { value: 4, provenance: 'confermato' },
    });
    const repo = new MemoryRepo({ nights: [confirmed] });

    expect(await ingestEvent(repo, ev('wake', '2026-10-21T05:05:00Z'), NOW)).toEqual({
      ok: true,
      duplicate: false,
      nightDate: '2026-10-21',
    });
    expect(await ingestEvent(repo, ev('bedtime_candidate', '2026-10-20T20:00:00Z'), NOW)).toMatchObject({
      ok: true,
      nightDate: '2026-10-21',
    });
    expect(await repo.getNight('2026-10-21')).toEqual(confirmed);
    expect(repo.events).toHaveLength(2);
  });

  it('memory-repo: upsertNight su notte confermata ritorna false', async () => {
    const confirmed = night('2026-10-21', null, '2026-10-21T05:30:00Z', { status: 'confermata' });
    const repo = new MemoryRepo({ nights: [confirmed] });
    expect(await repo.upsertNight(night('2026-10-21', null, null, { status: 'mancante' }))).toBe(false);
    expect(await repo.getNight('2026-10-21')).toEqual(confirmed);
  });

  it('evening_check con sonnellino: salva check e sonnellino recuperato', async () => {
    const repo = new MemoryRepo();
    const r = await ingestEvent(
      repo,
      ev('evening_check', '2026-10-20T19:00:00Z', { check: { mood: 3, napMinutesToday: 30 } }),
      NOW,
    );
    expect(r).toEqual({ ok: true, duplicate: false, nightDate: '2026-10-21' });

    expect(await repo.getEveningCheck('2026-10-20')).toEqual({
      date: '2026-10-20',
      tiredness: { value: null, provenance: 'mancante' },
      mood: { value: 3, provenance: 'confermato' },
      factors: [],
      napMinutesToday: { value: 30, provenance: 'confermato' },
    });
    // Segnaposto alle 12:00 locali (CEST).
    expect(repo.naps).toEqual([
      { date: '2026-10-20', startAt: '2026-10-20T10:00:00.000Z', minutes: 30, provenance: 'confermato' },
    ]);
    // Il letto è stimato dall'orario del check.
    const n = await repo.getNight('2026-10-21');
    expect(n?.bedAt).toEqual({ value: '2026-10-20T19:00:00Z', provenance: 'stimato' });
    expect(n?.status).toBe('stimata');
  });

  it('evening_check con napMinutesToday 0 o senza check: nessun sonnellino, nessun errore', async () => {
    const repo = new MemoryRepo();
    await ingestEvent(repo, ev('evening_check', '2026-10-20T19:00:00Z', { check: { napMinutesToday: 0 } }), NOW);
    expect(repo.naps).toEqual([]);
    expect((await repo.getEveningCheck('2026-10-20'))?.napMinutesToday).toEqual({ value: 0, provenance: 'confermato' });

    // Secondo check della stessa sera senza campi: non azzera quanto già salvato.
    await ingestEvent(repo, ev('evening_check', '2026-10-20T20:00:00Z'), NOW);
    expect((await repo.getEveningCheck('2026-10-20'))?.napMinutesToday).toEqual({ value: 0, provenance: 'confermato' });
    expect(repo.events).toHaveLength(2);
  });

  it('nap_start / nap_end: sonnellino automatico, idempotente, nightDate null', async () => {
    const repo = new MemoryRepo();
    // 14:00 → 14:40 locali.
    expect(await ingestEvent(repo, ev('nap_start', '2026-10-20T12:00:00Z'), NOW)).toEqual({
      ok: true,
      duplicate: false,
      nightDate: null,
    });
    const end = ev('nap_end', '2026-10-20T12:40:00Z');
    expect(await ingestEvent(repo, end, NOW)).toEqual({ ok: true, duplicate: false, nightDate: null });
    const first = { date: '2026-10-20', startAt: '2026-10-20T12:00:00Z', minutes: 40, provenance: 'automatico' };
    expect(repo.naps).toEqual([first]);

    expect((await ingestEvent(repo, end, NOW)).ok).toBe(true);
    expect(repo.naps).toEqual([first]);

    // Secondo sonnellino nella stessa giornata: 17:00 → 17:20.
    await ingestEvent(repo, ev('nap_start', '2026-10-20T15:00:00Z'), NOW);
    await ingestEvent(repo, ev('nap_end', '2026-10-20T15:20:00Z'), NOW);
    expect(repo.naps).toEqual([
      first,
      { date: '2026-10-20', startAt: '2026-10-20T15:00:00Z', minutes: 20, provenance: 'automatico' },
    ]);
    expect(repo.nights).toEqual([]);
  });

  it('eventi isolati o incoerenti non producono errori', async () => {
    const repo = new MemoryRepo();
    // nap_end senza inizio.
    expect(await ingestEvent(repo, ev('nap_end', '2026-10-20T12:40:00Z'), NOW)).toMatchObject({ ok: true });
    // bedtime_candidate a mezzogiorno: riguarda la notte successiva ma non è nella finestra del letto.
    expect(await ingestEvent(repo, ev('bedtime_candidate', '2026-10-20T10:00:00Z'), NOW)).toEqual({
      ok: true,
      duplicate: false,
      nightDate: '2026-10-21',
    });
    expect(await repo.getNight('2026-10-21')).toEqual(night('2026-10-21', null, null, { status: 'mancante' }));
    expect(repo.naps).toEqual([]);
  });

  it('bedtime_candidate dopo mezzanotte appartiene alla notte del giorno stesso', async () => {
    const repo = new MemoryRepo();
    // 00:40 locali del 21.
    expect(await ingestEvent(repo, ev('bedtime_candidate', '2026-10-20T22:40:00Z'), NOW)).toMatchObject({
      nightDate: '2026-10-21',
    });
    expect((await repo.getNight('2026-10-21'))?.bedAt).toEqual({
      value: '2026-10-20T22:40:00Z',
      provenance: 'automatico',
    });
  });

  it('ora legale 2026-10-25: notte di 8h30 a cavallo del ritorno all\'ora solare', async () => {
    const repo = new MemoryRepo();
    // 23:30 CEST del 24 → notte del 25.
    await ingestEvent(repo, ev('bedtime_candidate', '2026-10-24T21:30:00Z'), NOW);
    // 07:00 CET del 25.
    expect(await ingestEvent(repo, ev('wake', '2026-10-25T06:00:00Z'), NOW)).toMatchObject({
      nightDate: '2026-10-25',
    });
    const n = await repo.getNight('2026-10-25');
    expect(n?.bedAt).toEqual({ value: '2026-10-24T21:30:00Z', provenance: 'automatico' });
    expect(n?.wakeAt).toEqual({ value: '2026-10-25T06:00:00Z', provenance: 'automatico' });
    expect(durationMinutes(n?.bedAt.value as string, n?.wakeAt.value as string)).toBe(510);

    // Ora ripetuta: 02:30 CET (seconda occorrenza) → notte del giorno stesso.
    expect(nightDateForEvent('bedtime_candidate', '2026-10-25T01:30:00Z')).toBe('2026-10-25');
    // 02:30 CEST (prima occorrenza) → stessa notte.
    expect(nightDateForEvent('bedtime_candidate', '2026-10-25T00:30:00Z')).toBe('2026-10-25');
    // Finestra del risveglio in CET: 13:30 dentro, 14:30 fuori.
    expect(nightDateForEvent('wake', '2026-10-25T12:30:00Z')).toBe('2026-10-25');
    expect(nightDateForEvent('wake', '2026-10-25T13:30:00Z')).toBeNull();
  });

  it('preserva quality, energy, isException e factors della notte esistente', async () => {
    const existing = night('2026-10-21', null, '2026-10-21T05:00:00Z', {
      quality: { value: 4, provenance: 'confermato' },
      energy: { value: 3, provenance: 'confermato' },
      isException: true,
      factors: ['caffe'],
    });
    const repo = new MemoryRepo({ nights: [existing] });
    await ingestEvent(repo, ev('wake', '2026-10-21T05:05:00Z'), NOW);
    const n = await repo.getNight('2026-10-21');
    expect(n).toEqual({ ...existing, wakeAt: { value: '2026-10-21T05:05:00Z', provenance: 'automatico' } });
  });

  it('un orario già confermato dall\'utente non viene sostituito dalla ricostruzione', async () => {
    const existing = night('2026-10-21', null, null, {
      bedAt: { value: '2026-10-20T21:45:00Z', provenance: 'confermato' },
    });
    const repo = new MemoryRepo({ nights: [existing] });
    await ingestEvent(repo, ev('bedtime_candidate', '2026-10-20T21:10:00Z'), NOW);
    await ingestEvent(repo, ev('wake', '2026-10-21T05:05:00Z'), NOW);
    const n = await repo.getNight('2026-10-21');
    expect(n?.bedAt).toEqual({ value: '2026-10-20T21:45:00Z', provenance: 'confermato' });
    expect(n?.wakeAt).toEqual({ value: '2026-10-21T05:05:00Z', provenance: 'automatico' });
  });
});
