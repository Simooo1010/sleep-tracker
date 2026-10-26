import { describe, expect, it } from 'vitest';
import type { EveningCheck, Nap, Night } from '../../src/domain/types';
import { MemoryRepo } from '../../src/server/memory-repo';
import type { QuestionLogRow } from '../../src/server/types';
import { hashToken } from '../../src/server/token';

const MISSING = { value: null, provenance: 'mancante' } as const;

function night(nightDate: string, over: Partial<Night> = {}): Night {
  return {
    nightDate,
    bedAt: { value: `${nightDate}T22:00:00Z`, provenance: 'automatico' },
    wakeAt: { value: `${nightDate}T06:00:00Z`, provenance: 'automatico' },
    status: 'stimata',
    quality: { ...MISSING },
    energy: { ...MISSING },
    isException: false,
    factors: [],
    ...over,
  };
}

function nap(date: string, startAt: string, minutes = 20): Nap {
  return { date, startAt, minutes, provenance: 'automatico' };
}

function check(date: string): EveningCheck {
  return {
    date,
    tiredness: { value: 3, provenance: 'confermato' },
    mood: { ...MISSING },
    factors: [],
    napMinutesToday: { ...MISSING },
  } as EveningCheck;
}

function q(date: string, over: Partial<QuestionLogRow> = {}): QuestionLogRow {
  return { date, kind: 'energy', answeredOrSkipped: true, ...over };
}

describe('MemoryRepo.overwriteNight', () => {
  it('crea una notte assente', async () => {
    const repo = new MemoryRepo();
    await repo.overwriteNight(night('2026-10-20'));
    expect(await repo.getNight('2026-10-20')).toEqual(night('2026-10-20'));
  });

  it('sostituisce una notte confermata mentre upsertNight continua a rifiutare', async () => {
    const repo = new MemoryRepo({ nights: [night('2026-10-20', { status: 'confermata' })] });
    expect(await repo.upsertNight(night('2026-10-20', { status: 'stimata', isException: true }))).toBe(false);
    expect((await repo.getNight('2026-10-20'))?.status).toBe('confermata');

    await repo.overwriteNight(night('2026-10-20', { status: 'stimata', isException: true }));
    const n = await repo.getNight('2026-10-20');
    expect(n?.status).toBe('stimata');
    expect(n?.isException).toBe(true);
  });

  it('copia in entrata: mutare l\'oggetto passato non cambia lo stato', async () => {
    const repo = new MemoryRepo();
    const n = night('2026-10-20');
    await repo.overwriteNight(n);
    n.factors.push('x');
    expect((await repo.getNight('2026-10-20'))?.factors).toEqual([]);
  });
});

describe('MemoryRepo.listNaps', () => {
  it('filtra per intervallo (estremi inclusi) e ordina per startAt', async () => {
    const repo = new MemoryRepo({
      naps: [
        nap('2026-10-22', '2026-10-22T15:00:00Z'),
        nap('2026-10-20', '2026-10-20T14:00:00Z'),
        nap('2026-10-22', '2026-10-22T13:00:00Z'),
        nap('2026-10-19', '2026-10-19T14:00:00Z'),
        nap('2026-10-23', '2026-10-23T14:00:00Z'),
      ],
    });
    const r = await repo.listNaps('2026-10-20', '2026-10-22');
    expect(r.map((n) => n.startAt)).toEqual([
      '2026-10-20T14:00:00Z',
      '2026-10-22T13:00:00Z',
      '2026-10-22T15:00:00Z',
    ]);
  });

  it('vuoto: nessun sonnellino o intervallo senza dati', async () => {
    const repo = new MemoryRepo({ naps: [nap('2026-10-20', '2026-10-20T14:00:00Z')] });
    expect(await new MemoryRepo().listNaps('2026-10-01', '2026-10-31')).toEqual([]);
    expect(await repo.listNaps('2026-10-21', '2026-10-30')).toEqual([]);
  });

  it('copie difensive', async () => {
    const repo = new MemoryRepo({ naps: [nap('2026-10-20', '2026-10-20T14:00:00Z')] });
    (await repo.listNaps('2026-10-20', '2026-10-20'))[0]!.minutes = 999;
    expect((await repo.listNaps('2026-10-20', '2026-10-20'))[0]!.minutes).toBe(20);
  });
});

describe('MemoryRepo.listEveningChecks', () => {
  it('filtra per intervallo con estremi inclusi, ordinati per data', async () => {
    const repo = new MemoryRepo({ checks: [check('2026-10-22'), check('2026-10-19'), check('2026-10-20'), check('2026-10-23')] });
    expect((await repo.listEveningChecks('2026-10-20', '2026-10-22')).map((c) => c.date)).toEqual([
      '2026-10-20',
      '2026-10-22',
    ]);
  });

  it('vuoto', async () => {
    expect(await new MemoryRepo().listEveningChecks('2026-10-01', '2026-10-31')).toEqual([]);
    const repo = new MemoryRepo({ checks: [check('2026-10-10')] });
    expect(await repo.listEveningChecks('2026-10-11', '2026-10-12')).toEqual([]);
  });

  it('copie difensive', async () => {
    const repo = new MemoryRepo({ checks: [check('2026-10-20')] });
    (await repo.listEveningChecks('2026-10-20', '2026-10-20'))[0]!.factors.push('x');
    expect((await repo.listEveningChecks('2026-10-20', '2026-10-20'))[0]!.factors).toEqual([]);
  });
});

describe('MemoryRepo.listExceptionTypes', () => {
  it('parte dai 5 tipi di default con uses 0, ordinati per label', async () => {
    const r = await new MemoryRepo().listExceptionTypes();
    expect(r).toEqual([
      { slug: 'alcol', label: 'alcol', uses: 0 },
      { slug: 'festa', label: 'festa', uses: 0 },
      { slug: 'malattia', label: 'malattia', uses: 0 },
      { slug: 'notte-in-bianco', label: 'notte in bianco', uses: 0 },
      { slug: 'viaggio', label: 'viaggio', uses: 0 },
    ]);
  });

  it('ordina per uses decrescente poi label', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['viaggio', 'festa']);
    await repo.setNightExceptions('2026-10-21', ['viaggio']);
    const r = await repo.listExceptionTypes();
    expect(r.slice(0, 3).map((t) => [t.slug, t.uses])).toEqual([
      ['viaggio', 2],
      ['festa', 1],
      ['alcol', 0],
    ]);
  });

  it('copie difensive', async () => {
    const repo = new MemoryRepo();
    (await repo.listExceptionTypes())[0]!.uses = 99;
    expect((await repo.listExceptionTypes()).every((t) => t.uses === 0)).toBe(true);
  });
});

describe('MemoryRepo.setNightExceptions', () => {
  const uses = async (repo: MemoryRepo, slug: string) =>
    (await repo.listExceptionTypes()).find((t) => t.slug === slug)?.uses;

  it('aggiunta: +1 per i nuovi slug, solo i nuovi su una seconda chiamata', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['alcol']);
    expect(await uses(repo, 'alcol')).toBe(1);
    await repo.setNightExceptions('2026-10-20', ['alcol', 'festa']);
    expect(await uses(repo, 'alcol')).toBe(1);
    expect(await uses(repo, 'festa')).toBe(1);
    expect(await repo.listNightExceptions('2026-10-20', '2026-10-20')).toEqual({ '2026-10-20': ['alcol', 'festa'] });
  });

  it('rimozione: -1 per gli slug tolti, mai sotto 0', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['alcol']);
    await repo.setNightExceptions('2026-10-20', []);
    expect(await uses(repo, 'alcol')).toBe(0);
    expect(await repo.listNightExceptions('2026-10-01', '2026-10-31')).toEqual({});

    // uses già a 0 con eccezione presente (seed incoerente simulato): riportare a 0 non va sotto
    await repo.setNightExceptions('2026-10-21', ['alcol']);
    await repo.setNightExceptions('2026-10-22', ['alcol']);
    await repo.setNightExceptions('2026-10-21', []);
    await repo.setNightExceptions('2026-10-22', []);
    await repo.setNightExceptions('2026-10-22', []);
    expect(await uses(repo, 'alcol')).toBe(0);
  });

  it('slug sconosciuto: creato con label derivata e uses 1', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['esame-di-stato']);
    const t = (await repo.listExceptionTypes()).find((x) => x.slug === 'esame-di-stato');
    expect(t).toEqual({ slug: 'esame-di-stato', label: 'esame di stato', uses: 1 });
  });

  it('slug nuovo con label dalla UI: usa la label normalizzata', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['cena-fuori'], { 'cena-fuori': '  Cena   fuori ' });
    const t = (await repo.listExceptionTypes()).find((x) => x.slug === 'cena-fuori');
    expect(t).toEqual({ slug: 'cena-fuori', label: 'Cena fuori', uses: 1 });
  });

  it('label lunga troncata a 30; vuota o mancante → derivata dallo slug', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['lunga', 'vuota', 'altra-cosa'], {
      lunga: 'L'.repeat(50),
      vuota: '  ',
      'non-presente': 'ignorata',
    });
    const types = await repo.listExceptionTypes();
    expect(types.find((x) => x.slug === 'lunga')?.label).toBe('L'.repeat(30));
    expect(types.find((x) => x.slug === 'vuota')?.label).toBe('vuota');
    expect(types.find((x) => x.slug === 'altra-cosa')?.label).toBe('altra cosa');
    expect(types.some((x) => x.slug === 'non-presente')).toBe(false);
  });

  it('slug esistente: la label passata non sovrascrive quella del catalogo', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['viaggio'], { viaggio: 'Viaggione' });
    const t = (await repo.listExceptionTypes()).find((x) => x.slug === 'viaggio');
    expect(t?.label).toBe('viaggio');
    expect(t?.uses).toBe(1);
    await repo.setNightExceptions('2026-10-21', ['nuovo-tipo'], { 'nuovo-tipo': 'Nuovo' });
    await repo.setNightExceptions('2026-10-22', ['nuovo-tipo'], { 'nuovo-tipo': 'Cambiato' });
    expect((await repo.listExceptionTypes()).find((x) => x.slug === 'nuovo-tipo')?.label).toBe('Nuovo');
  });

  it('slug non valido: lancia e non cambia nulla', async () => {
    const repo = new MemoryRepo();
    for (const bad of ['Alcol', 'a b', '-x', 'x-', 'a--b', '', 'è']) {
      await expect(repo.setNightExceptions('2026-10-20', ['festa', bad])).rejects.toThrow('Slug non valido.');
    }
    expect(await uses(repo, 'festa')).toBe(0);
    expect(repo.exceptions).toEqual({});
  });

  it('deduplica gli slug ripetuti (uses +1 una sola volta)', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['festa', 'festa', 'alcol', 'festa']);
    expect(await uses(repo, 'festa')).toBe(1);
    expect(repo.exceptions).toEqual({ '2026-10-20': ['alcol', 'festa'] });
  });
});

describe('MemoryRepo.listNightExceptions', () => {
  it('solo notti nell\'intervallo (estremi inclusi) con eccezioni, slug alfabetici', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-19', ['festa']);
    await repo.setNightExceptions('2026-10-20', ['viaggio', 'alcol']);
    await repo.setNightExceptions('2026-10-22', ['malattia']);
    await repo.setNightExceptions('2026-10-23', ['festa']);
    await repo.setNightExceptions('2026-10-21', ['festa']);
    await repo.setNightExceptions('2026-10-21', []);
    expect(await repo.listNightExceptions('2026-10-20', '2026-10-22')).toEqual({
      '2026-10-20': ['alcol', 'viaggio'],
      '2026-10-22': ['malattia'],
    });
  });

  it('vuoto', async () => {
    expect(await new MemoryRepo().listNightExceptions('2026-10-01', '2026-10-31')).toEqual({});
  });

  it('copie difensive', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-20', ['festa']);
    (await repo.listNightExceptions('2026-10-20', '2026-10-20'))['2026-10-20']!.push('x');
    expect(await repo.listNightExceptions('2026-10-20', '2026-10-20')).toEqual({ '2026-10-20': ['festa'] });
  });
});

describe('MemoryRepo: dayNote del check serale', () => {
  it('salva con trim e rilegge; vuota/null → null; assente resta assente; troncata a 280', async () => {
    const repo = new MemoryRepo();
    await repo.saveEveningCheck({ ...check('2026-10-20'), dayNote: '  Giornata in treno.  ' });
    expect((await repo.getEveningCheck('2026-10-20'))?.dayNote).toBe('Giornata in treno.');

    await repo.saveEveningCheck({ ...check('2026-10-20'), dayNote: '   ' });
    expect((await repo.getEveningCheck('2026-10-20'))?.dayNote).toBeNull();

    await repo.saveEveningCheck({ ...check('2026-10-21'), dayNote: null });
    expect((await repo.getEveningCheck('2026-10-21'))?.dayNote).toBeNull();

    await repo.saveEveningCheck(check('2026-10-22'));
    expect((await repo.getEveningCheck('2026-10-22'))?.dayNote).toBeUndefined();

    await repo.saveEveningCheck({ ...check('2026-10-23'), dayNote: 'z'.repeat(400) });
    expect((await repo.getEveningCheck('2026-10-23'))?.dayNote).toBe('z'.repeat(280));
  });

  it('listEveningChecks include dayNote; copie difensive', async () => {
    const repo = new MemoryRepo();
    const c = { ...check('2026-10-20'), dayNote: 'Nota' };
    await repo.saveEveningCheck(c);
    c.dayNote = 'cambiata';
    const [out] = await repo.listEveningChecks('2026-10-01', '2026-10-31');
    expect(out?.dayNote).toBe('Nota');
    out!.dayNote = 'mutata';
    expect((await repo.getEveningCheck('2026-10-20'))?.dayNote).toBe('Nota');
  });
});

describe('MemoryRepo.logQuestion / listQuestions', () => {
  it('aggiunge senza deduplicare e filtra per intervallo in ordine di inserimento', async () => {
    const repo = new MemoryRepo();
    await repo.logQuestion(q('2026-10-22', { kind: 'quality' }));
    await repo.logQuestion(q('2026-10-20'));
    await repo.logQuestion(q('2026-10-20'));
    await repo.logQuestion(q('2026-10-23'));
    await repo.logQuestion(q('2026-10-19'));
    const r = await repo.listQuestions('2026-10-20', '2026-10-22');
    expect(r.map((x) => [x.date, x.kind])).toEqual([
      ['2026-10-22', 'quality'],
      ['2026-10-20', 'energy'],
      ['2026-10-20', 'energy'],
    ]);
    expect(repo.questions).toHaveLength(5);
  });

  it('vuoto', async () => {
    const repo = new MemoryRepo();
    expect(await repo.listQuestions('2026-10-01', '2026-10-31')).toEqual([]);
    await repo.logQuestion(q('2026-10-10'));
    expect(await repo.listQuestions('2026-10-11', '2026-10-12')).toEqual([]);
  });

  it('copie difensive in entrata e in uscita', async () => {
    const repo = new MemoryRepo();
    const row = q('2026-10-20');
    await repo.logQuestion(row);
    row.answeredOrSkipped = false;
    (await repo.listQuestions('2026-10-20', '2026-10-20'))[0]!.date = 'x';
    expect(await repo.listQuestions('2026-10-20', '2026-10-20')).toEqual([q('2026-10-20')]);
  });
});

describe('MemoryRepo.getSetting', () => {
  it('default: target 450 minuti e fuso Europe/Rome', async () => {
    const repo = new MemoryRepo();
    expect(await repo.getSetting<number>('target_sleep_minutes')).toBe(450);
    expect(await repo.getSetting<string>('timezone')).toBe('Europe/Rome');
  });

  it('chiave assente: null', async () => {
    expect(await new MemoryRepo().getSetting('inesistente')).toBeNull();
  });

  it('seed sostituisce i default (anche valori oggetto, copiati)', async () => {
    const obj = { a: [1, 2] };
    const repo = new MemoryRepo({ settings: { custom: obj } });
    obj.a.push(3);
    expect(await repo.getSetting('custom')).toEqual({ a: [1, 2] });
    expect(await repo.getSetting('timezone')).toBeNull();
    const got = await repo.getSetting<{ a: number[] }>('custom');
    got!.a.push(9);
    expect(await repo.getSetting('custom')).toEqual({ a: [1, 2] });
  });
});

describe('MemoryRepo: gestione token', () => {
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 9, 24, 8, tick++));

  it('createToken: trimma l\'etichetta, restituisce i metadati senza hash e autentica', async () => {
    const repo = new MemoryRepo({ now: clock });
    const info = await repo.createToken({ tokenHash: 'h-1', label: '  iPhone ' });
    expect(info).toEqual({ id: 1, label: 'iPhone', active: true, createdAt: '2026-10-24T08:00:00.000Z', lastUsedAt: null });
    expect(JSON.stringify(info)).not.toContain('h-1');
    expect(await repo.tokenExists('h-1')).toBe(true);
    expect(repo.tokenHashes).toEqual(['h-1']);
  });

  it('createToken: etichetta non valida → Error; hash duplicato → Error', async () => {
    const repo = new MemoryRepo();
    for (const label of ['', '  ', 'x'.repeat(41)]) {
      await expect(repo.createToken({ tokenHash: 'h', label })).rejects.toThrow('Etichetta non valida.');
    }
    await repo.createToken({ tokenHash: 'h', label: 'x'.repeat(40) });
    await expect(repo.createToken({ tokenHash: 'h', label: 'altro' })).rejects.toThrow();
    expect(await repo.listTokens()).toHaveLength(1);
  });

  it('listTokens: dal più recente, con attivi e revocati, senza hash', async () => {
    tick = 0;
    const repo = new MemoryRepo({ now: clock });
    const a = await repo.createToken({ tokenHash: 'h-a', label: 'A' });
    const b = await repo.createToken({ tokenHash: 'h-b', label: 'B' });
    await repo.revokeToken(a.id);
    const list = await repo.listTokens();
    expect(list.map((t) => [t.label, t.active])).toEqual([
      ['B', true],
      ['A', false],
    ]);
    expect(list[0]!.id).toBe(b.id);
    expect(JSON.stringify(list)).not.toMatch(/h-a|h-b|hash/i);
  });

  it('listTokens restituisce copie: modificarle non cambia lo stato', async () => {
    const repo = new MemoryRepo();
    await repo.createToken({ tokenHash: 'h', label: 'iPhone' });
    (await repo.listTokens())[0]!.active = false;
    expect((await repo.listTokens())[0]!.active).toBe(true);
  });

  it('revokeToken: true se esiste (anche se già revocato), false altrimenti; il token revocato non autentica', async () => {
    const repo = new MemoryRepo();
    const info = await repo.createToken({ tokenHash: 'h', label: 'iPhone' });
    expect(await repo.revokeToken(info.id)).toBe(true);
    expect(await repo.revokeToken(info.id)).toBe(true);
    expect(await repo.revokeToken(999)).toBe(false);
    expect(await repo.tokenExists('h')).toBe(false);
    expect((await repo.listTokens())[0]).toMatchObject({ active: false });
  });

  it('tokenExists ignora i revocati, non aggiorna lastUsedAt e lo imposta per gli attivi', async () => {
    tick = 0;
    const repo = new MemoryRepo({ now: clock });
    const live = await repo.createToken({ tokenHash: 'h-live', label: 'live' });
    const dead = await repo.createToken({ tokenHash: 'h-dead', label: 'dead' });
    await repo.revokeToken(dead.id);
    expect(await repo.tokenExists('h-dead')).toBe(false);
    expect(await repo.tokenExists('nessuno')).toBe(false);
    expect(await repo.tokenExists('h-live')).toBe(true);
    const list = await repo.listTokens();
    expect(list.find((t) => t.id === live.id)!.lastUsedAt).not.toBeNull();
    expect(list.find((t) => t.id === dead.id)!.lastUsedAt).toBeNull();
  });

  it('i token del seed (solo hash) sono attivi e compaiono nell\'elenco con etichetta di default', async () => {
    const repo = new MemoryRepo({ tokenHashes: [hashToken('st_x', 'pepper-lungo-abbastanza')] });
    expect(await repo.tokenExists(hashToken('st_x', 'pepper-lungo-abbastanza'))).toBe(true);
    expect(await repo.listTokens()).toHaveLength(1);
  });
});
