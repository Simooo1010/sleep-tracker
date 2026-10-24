import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXCEPTIONS,
  DEFAULT_FACTORS,
  orderExceptionChips,
  selectQuestions,
  type AskedQuestion,
  type QuestionContext,
} from '../../src/domain/questions';
import type { EveningCheck, Night, NightStatus } from '../../src/domain/types';

const TODAY = '2026-10-24';

function night(nightDate: string, status: NightStatus, over: Partial<Night> = {}): Night {
  const prov = status === 'confermata' ? 'confermato' : status === 'stimata' ? 'stimato' : 'mancante';
  const hasTimes = status !== 'mancante';
  return {
    nightDate,
    // 23:30 e 07:15 ora di Roma (CEST, UTC+2)
    bedAt: { value: hasTimes ? `${addDaysIso(nightDate, -1)}T21:30:00Z` : null, provenance: prov },
    wakeAt: { value: hasTimes ? `${nightDate}T05:15:00Z` : null, provenance: prov },
    status,
    quality: { value: null, provenance: 'mancante' },
    energy: { value: null, provenance: 'mancante' },
    isException: false,
    factors: [],
    ...over,
  };
}

function addDaysIso(date: string, d: number): string {
  const x = new Date(`${date}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

function ctx(over: Partial<QuestionContext> = {}): QuestionContext {
  return { today: TODAY, nights: [], eveningChecks: [], asked: [], napsRecentlyMissing: false, ...over };
}

const confirmedFull = (d: string) =>
  night(d, 'confermata', {
    energy: { value: 4, provenance: 'confermato' },
    quality: { value: 3, provenance: 'confermato' },
    isException: true,
    factors: ['sport'],
  });

describe('selectQuestions', () => {
  it('nessun dato → nessuna domanda', () => {
    expect(selectQuestions(ctx())).toEqual([]);
  });

  it('notte confermata e completa, niente sonnellini da recuperare → []', () => {
    expect(selectQuestions(ctx({ nights: [confirmedFull(TODAY)] }))).toEqual([]);
  });

  it('la conferma della notte stimata più recente viene prima, con orari nel testo', () => {
    const qs = selectQuestions(ctx({ nights: [night('2026-10-23', 'stimata'), night(TODAY, 'stimata')] }));
    expect(qs.map((q) => [q.kind, q.nightDate])).toEqual([
      ['confirm_night', TODAY],
      ['confirm_night', '2026-10-23'],
    ]);
    expect(qs[0]!.text).toBe('Stanotte: a letto alle 23:30, sveglia alle 07:15. Confermi?');
    expect(qs[1]!.text).toContain('Notte tra 22 ott e 23 ott');
    expect(qs[0]!.priority).toBeGreaterThan(qs[1]!.priority);
  });

  it('recupero solo delle ultime 3 notti: le più vecchie restano stimate', () => {
    const nights = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', TODAY].map((d) =>
      night(d, 'stimata'),
    );
    const qs = selectQuestions(ctx({ nights }));
    expect(qs.map((q) => q.nightDate)).toEqual([TODAY, '2026-10-23', '2026-10-22']);
  });

  it('notti future e notti mancanti non vengono chieste', () => {
    const qs = selectQuestions(ctx({ nights: [night('2026-10-25', 'stimata'), night(TODAY, 'mancante')] }));
    expect(qs).toEqual([]);
  });

  it('ordine per valore informativo: energy > nap_today > quality > exception > factors', () => {
    const qs = selectQuestions(ctx({ nights: [night(TODAY, 'confermata')], napsRecentlyMissing: true }));
    expect(qs.map((q) => q.kind)).toEqual(['energy', 'nap_today', 'quality']);
    const noNap = selectQuestions(
      ctx({ nights: [night(TODAY, 'confermata', { energy: { value: 3, provenance: 'confermato' } })] }),
    );
    expect(noNap.map((q) => q.kind)).toEqual(['quality', 'exception', 'factors']);
  });

  it('confirm_night batte energy: le domande post-conferma aspettano che la notte recente sia confermata', () => {
    const qs = selectQuestions(ctx({ nights: [night('2026-10-23', 'confermata'), night(TODAY, 'stimata')] }));
    expect(qs.map((q) => q.kind)).toEqual(['confirm_night']);
  });

  it('nap_today solo se napsRecentlyMissing e il check serale non ha già il dato', () => {
    const check: EveningCheck = {
      date: TODAY,
      tiredness: { value: 3, provenance: 'confermato' },
      mood: { value: 3, provenance: 'confermato' },
      factors: [],
      napMinutesToday: { value: 20, provenance: 'confermato' },
    };
    expect(selectQuestions(ctx({ napsRecentlyMissing: true })).map((q) => q.kind)).toEqual(['nap_today']);
    expect(selectQuestions(ctx({ napsRecentlyMissing: true, eveningChecks: [check] }))).toEqual([]);
    expect(selectQuestions(ctx({ napsRecentlyMissing: false }))).toEqual([]);
  });

  it('factors non si chiede se il check della sera prima li ha già', () => {
    const check: EveningCheck = {
      date: '2026-10-23',
      tiredness: { value: null, provenance: 'mancante' },
      mood: { value: null, provenance: 'mancante' },
      factors: ['cena-tardi'],
      napMinutesToday: { value: null, provenance: 'mancante' },
    };
    const n = night(TODAY, 'confermata', {
      energy: { value: 3, provenance: 'confermato' },
      quality: { value: 3, provenance: 'confermato' },
    });
    expect(selectQuestions(ctx({ nights: [n], eveningChecks: [check] })).map((q) => q.kind)).toEqual(['exception']);
  });

  describe('budget di 3 domande al giorno (contando le già chieste oggi)', () => {
    const nights = [night(TODAY, 'confermata')];
    const base = { nights, napsRecentlyMissing: true };
    const done = (kind: AskedQuestion['kind'], date = TODAY): AskedQuestion => ({
      date,
      kind,
      nightDate: kind === 'nap_today' ? undefined : TODAY,
      answeredOrSkipped: true,
    });

    it('0 già chieste → 3', () => {
      expect(selectQuestions(ctx(base))).toHaveLength(3);
    });

    it('1 già chiesta → 2, senza ripetere quella', () => {
      const qs = selectQuestions(ctx({ ...base, asked: [done('energy')] }));
      expect(qs.map((q) => q.kind)).toEqual(['nap_today', 'quality']);
    });

    it('2 già chieste → 1', () => {
      const qs = selectQuestions(ctx({ ...base, asked: [done('energy'), done('nap_today')] }));
      expect(qs.map((q) => q.kind)).toEqual(['quality']);
    });

    it('3 già chieste → []', () => {
      const qs = selectQuestions(ctx({ ...base, asked: [done('energy'), done('nap_today'), done('quality')] }));
      expect(qs).toEqual([]);
    });

    it('le domande dei giorni precedenti non consumano il budget di oggi', () => {
      const asked = [done('energy', '2026-10-23'), done('quality', '2026-10-23'), done('nap_today', '2026-10-23')];
      expect(selectQuestions(ctx({ ...base, asked }))).toHaveLength(3);
    });

    it('una domanda saltata oggi senza nightDate blocca tutto quel kind', () => {
      const asked: AskedQuestion[] = [{ date: TODAY, kind: 'confirm_night', answeredOrSkipped: true }];
      const qs = selectQuestions(ctx({ nights: [night(TODAY, 'stimata'), night('2026-10-23', 'stimata')], asked }));
      expect(qs).toEqual([]);
    });

    it('con nightDate, saltare una notte non blocca la conferma delle altre', () => {
      const asked: AskedQuestion[] = [{ date: TODAY, kind: 'confirm_night', nightDate: TODAY, answeredOrSkipped: true }];
      const qs = selectQuestions(ctx({ nights: [night(TODAY, 'stimata'), night('2026-10-23', 'stimata')], asked }));
      expect(qs.map((q) => q.nightDate)).toEqual(['2026-10-23']);
    });

    it('una domanda mostrata e ancora in attesa viene riproposta senza superare il budget (idempotente)', () => {
      const asked: AskedQuestion[] = [{ date: TODAY, kind: 'energy', nightDate: TODAY, answeredOrSkipped: false }];
      const qs = selectQuestions(ctx({ ...base, asked }));
      expect(qs.map((q) => q.kind)).toEqual(['energy', 'nap_today', 'quality']);
    });
  });

  it('deterministico: stesso input (anche in ordine diverso) → stesso output', () => {
    const nights = [night('2026-10-22', 'stimata'), night(TODAY, 'stimata'), night('2026-10-23', 'stimata')];
    const a = selectQuestions(ctx({ nights }));
    const b = selectQuestions(ctx({ nights: [...nights].reverse() }));
    expect(a).toEqual(b);
  });
});

describe('orderExceptionChips', () => {
  it('ordina per uso decrescente, a parità alfabetico per label, default non usati in coda', () => {
    const out = orderExceptionChips(
      [
        { slug: 'viaggio', label: 'Viaggio', uses: 3 },
        { slug: 'trasloco', label: 'Trasloco', uses: 5 },
        { slug: 'festa', label: 'Festa', uses: 3 },
        { slug: 'alcol', label: 'Alcol', uses: 3 },
      ],
      DEFAULT_EXCEPTIONS,
    );
    expect(out.map((c) => c.slug)).toEqual(['trasloco', 'alcol', 'festa', 'viaggio', 'malattia', 'notte-in-bianco']);
    expect(out.at(-1)).toEqual({ slug: 'notte-in-bianco', label: 'Notte in bianco', uses: 0 });
  });

  it('senza tipi restituisce i default nell’ordine dato', () => {
    expect(orderExceptionChips([], DEFAULT_EXCEPTIONS).map((c) => c.slug)).toEqual([...DEFAULT_EXCEPTIONS]);
  });

  it('non duplica e non muta l’input', () => {
    const types = [
      { slug: 'festa', label: 'Festa', uses: 1 },
      { slug: 'festa', label: 'Festa', uses: 9 },
    ];
    const snapshot = JSON.stringify(types);
    const out = orderExceptionChips(types, ['festa', 'altro-evento']);
    expect(out).toEqual([
      { slug: 'festa', label: 'Festa', uses: 1 },
      { slug: 'altro-evento', label: 'Altro evento', uses: 0 },
    ]);
    expect(JSON.stringify(types)).toBe(snapshot);
  });
});

describe('default', () => {
  it('eccezioni e fattori in kebab-case; il caffè non è un fattore', () => {
    expect(DEFAULT_EXCEPTIONS).toEqual(['malattia', 'viaggio', 'festa', 'notte-in-bianco', 'alcol']);
    expect(DEFAULT_FACTORS).toEqual([
      'schermo-a-letto',
      'sport',
      'giornata-stressante',
      'cena-tardi',
      'alcol',
      'mal-di-testa',
    ]);
    for (const s of [...DEFAULT_EXCEPTIONS, ...DEFAULT_FACTORS]) expect(s).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(DEFAULT_FACTORS.some((s) => s.includes('caff'))).toBe(false);
  });
});
