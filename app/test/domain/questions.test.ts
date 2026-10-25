import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXCEPTIONS,
  DAY_CONTEXT_MAX_DAYS,
  DAY_CONTEXT_TEXT_MAX,
  DAY_NOTE_MAX,
  DEFAULT_FACTORS,
  EXCEPTION_LABEL_MAX,
  EXCEPTION_SLUG_MAX,
  EXCEPTION_SLUG_RE,
  normalizeExceptionLabel,
  orderExceptionChips,
  slugifyExceptionLabel,
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

describe('slugifyExceptionLabel', () => {
  const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const samples = [
    'Cena fuori',
    '  Caffè   tardi  ',
    'Perché sì!',
    'Notte in bianco 🎉',
    '🎉🎉',
    '!!! ??? ...',
    'Àèìòù ÇÑ',
    'a--b__c',
    'x'.repeat(100),
    `${'ab '.repeat(30)}`,
    'Festa di compleanno di mia cugina a Milano',
    '',
    '   ',
  ];

  it('minuscolo, senza accenti, kebab', () => {
    expect(slugifyExceptionLabel('Cena fuori')).toBe('cena-fuori');
    expect(slugifyExceptionLabel('  Caffè   tardi  ')).toBe('caffe-tardi');
    expect(slugifyExceptionLabel('Perché sì!')).toBe('perche-si');
    expect(slugifyExceptionLabel('Àèìòù ÇÑ')).toBe('aeiou-cn');
    expect(slugifyExceptionLabel('a--b__c')).toBe('a-b-c');
  });

  it('emoji ignorate; solo simboli o vuoto → stringa vuota', () => {
    expect(slugifyExceptionLabel('Notte in bianco 🎉')).toBe('notte-in-bianco');
    expect(slugifyExceptionLabel('🎉🎉')).toBe('');
    expect(slugifyExceptionLabel('!!! ??? ...')).toBe('');
    expect(slugifyExceptionLabel('')).toBe('');
    expect(slugifyExceptionLabel('   ')).toBe('');
  });

  it('tronca a 40 caratteri senza trattino finale', () => {
    expect(slugifyExceptionLabel('x'.repeat(100))).toBe('x'.repeat(40));
    // 39 caratteri + spazio: il taglio cadrebbe su un trattino.
    const s = slugifyExceptionLabel(`${'a'.repeat(39)} bcd`);
    expect(s).toBe('a'.repeat(39));
    expect(slugifyExceptionLabel('Festa di compleanno di mia cugina a Milano').length).toBeLessThanOrEqual(
      EXCEPTION_SLUG_MAX,
    );
  });

  it('idempotente e sempre valido (o vuoto)', () => {
    for (const label of samples) {
      const s = slugifyExceptionLabel(label);
      expect(slugifyExceptionLabel(s)).toBe(s);
      expect(s.length).toBeLessThanOrEqual(EXCEPTION_SLUG_MAX);
      if (s !== '') {
        expect(s).toMatch(SLUG_RE);
        expect(s).toMatch(EXCEPTION_SLUG_RE);
      }
    }
  });

  it('gli slug predefiniti restano invariati', () => {
    for (const slug of [...DEFAULT_EXCEPTIONS, ...DEFAULT_FACTORS]) expect(slugifyExceptionLabel(slug)).toBe(slug);
  });
});

describe('normalizeExceptionLabel', () => {
  it('trim e spazi collassati', () => {
    expect(normalizeExceptionLabel('  Cena   fuori\t\n ')).toBe('Cena fuori');
    expect(normalizeExceptionLabel('   ')).toBe('');
  });

  it(`tronca a EXCEPTION_LABEL_MAX (${EXCEPTION_LABEL_MAX}) senza spazio finale`, () => {
    expect(normalizeExceptionLabel('x'.repeat(50))).toBe('x'.repeat(EXCEPTION_LABEL_MAX));
    expect(normalizeExceptionLabel(`${'a'.repeat(29)} bcd`)).toBe('a'.repeat(29));
  });

  it('non spezza le emoji (conta per code point)', () => {
    const out = normalizeExceptionLabel('🎉'.repeat(40));
    expect(Array.from(out)).toHaveLength(EXCEPTION_LABEL_MAX);
    expect(out).toBe('🎉'.repeat(EXCEPTION_LABEL_MAX));
  });

  it('idempotente', () => {
    for (const l of ['  Cena   fuori ', 'x'.repeat(50), `${'a'.repeat(29)} bcd`, '🎉'.repeat(40)]) {
      const n = normalizeExceptionLabel(l);
      expect(normalizeExceptionLabel(n)).toBe(n);
    }
  });
});

describe('costanti imprevisti/giornata', () => {
  it('valori del contratto', () => {
    expect(EXCEPTION_LABEL_MAX).toBe(30);
    expect(DAY_NOTE_MAX).toBe(280);
    expect(DAY_CONTEXT_TEXT_MAX).toBe(140);
    expect(DAY_CONTEXT_MAX_DAYS).toBe(10);
  });
});
