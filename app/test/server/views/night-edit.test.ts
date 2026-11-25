import { describe, expect, it } from 'vitest';
import type { EveningCheck, Nap } from '../../../src/domain/types';
import { localToIso } from '../../../src/domain/estimate';
import { buildNightEditView, type NightEditViewInput } from '../../../src/server/views';
import { TODAY, expectSerializable, makeNight } from './fixtures';

const chk = (date: string, over: Partial<EveningCheck> = {}): EveningCheck => ({
  date,
  tiredness: { value: 4, provenance: 'confermato' },
  mood: { value: 3, provenance: 'confermato' },
  factors: [],
  napMinutesToday: { value: null, provenance: 'mancante' },
  ...over,
});

const base = (over: Partial<NightEditViewInput> = {}): NightEditViewInput => ({
  date: '2026-10-20',
  today: TODAY,
  night: null,
  nights: [],
  naps: [],
  eveningCheck: null,
  exceptionTypes: [],
  activeExceptions: [],
  ...over,
});

const recent = (n: number) =>
  Array.from({ length: n }, (_, i) => makeNight(`2026-10-${String(10 + i).padStart(2, '0')}`, '23:00', '07:00'));

describe('buildNightEditView: stato della notte', () => {
  it('notte mancante: orari null, durata —, parole Mancante', () => {
    const v = buildNightEditView(base());
    expect(v).toMatchObject({
      date: '2026-10-20',
      title: 'Notte del 20 ottobre',
      dateLabel: 'martedì 20 ottobre',
      eveningLabel: 'Sera di lunedì 19 ottobre',
      status: 'mancante',
      statusWord: 'Mancante',
      bedTime: null,
      wakeTime: null,
      bedProvenanceWord: 'Mancante',
      wakeProvenanceWord: 'Mancante',
      durationText: '—',
      quality: null,
      energy: null,
      tiredness: null,
      mood: null,
      dayNote: '',
      napText: null,
      backHref: '/storico?m=2026-10&d=2026-10-20',
    });
    expectSerializable(v);
  });

  it('notte stimata: orari locali e provenienza stimato', () => {
    const night = makeNight('2026-10-20', '23:48', '07:20', { status: 'stimata', prov: 'stimato' });
    const v = buildNightEditView(base({ night }));
    expect(v).toMatchObject({
      status: 'stimata',
      statusWord: 'Stimata',
      bedTime: '23:48',
      wakeTime: '07:20',
      bedProvenanceWord: 'Stimato',
      wakeProvenanceWord: 'Stimato',
      durationText: '7h 32m',
    });
  });

  it('notte confermata con voti', () => {
    const night = makeNight('2026-10-20', '00:30', '08:00', { quality: 4, energy: 2 });
    const v = buildNightEditView(base({ night }));
    expect(v).toMatchObject({ status: 'confermata', bedTime: '00:30', wakeTime: '08:00', quality: 4, energy: 2 });
    expect(v.bedProvenanceWord).toBe('Confermato');
  });

  it('cambio ora legale (25 ott 2026): gli orari restano quelli locali', () => {
    const night = makeNight('2026-10-25', '23:30', '07:30');
    expect(night.bedAt.value).toBe(localToIso('2026-10-24', 23 * 60 + 30));
    const v = buildNightEditView(base({ date: '2026-10-25', today: '2026-10-25', night }));
    expect(v).toMatchObject({ bedTime: '23:30', wakeTime: '07:30' });
  });
});

describe('buildNightEditView: orari suggeriti', () => {
  it('senza storico: 23:30 / 07:30', () => {
    const v = buildNightEditView(base());
    expect(v.suggestedBedTime).toBe('23:30');
    expect(v.suggestedWakeTime).toBe('07:30');
  });

  it('con meno di 3 notti: predefiniti', () => {
    const v = buildNightEditView(base({ nights: recent(2) }));
    expect([v.suggestedBedTime, v.suggestedWakeTime]).toEqual(['23:30', '07:30']);
  });

  it('con storico: mediana (anche a cavallo di mezzanotte)', () => {
    const nights = [
      makeNight('2026-10-10', '23:00', '07:00'),
      makeNight('2026-10-11', '00:30', '08:00'),
      makeNight('2026-10-12', '23:30', '07:30'),
    ];
    const v = buildNightEditView(base({ nights }));
    expect(v.suggestedBedTime).toBe('23:30');
    expect(v.suggestedWakeTime).toBe('07:30');
    expect(buildNightEditView(base({ nights: recent(5) }))).toMatchObject({
      suggestedBedTime: '23:00',
      suggestedWakeTime: '07:00',
    });
  });

  it('ignora le notti senza orari e la notte stessa', () => {
    const nights = [...recent(2), makeNight('2026-10-13', null, null), makeNight('2026-10-20', '03:00', '11:00')];
    expect(buildNightEditView(base({ nights })).suggestedBedTime).toBe('23:30');
  });
});

describe('buildNightEditView: imprevisti e fattori', () => {
  it('chip ordinati per uso, poi i predefiniti mancanti; selected dagli slug attivi', () => {
    const v = buildNightEditView(
      base({
        exceptionTypes: [
          { slug: 'viaggio', label: 'viaggio', uses: 2 },
          { slug: 'festa', label: 'festa', uses: 5 },
        ],
        activeExceptions: ['viaggio'],
      }),
    );
    expect(v.exceptions.slice(0, 2).map((e) => e.slug)).toEqual(['festa', 'viaggio']);
    expect(v.exceptions.find((e) => e.slug === 'viaggio')?.selected).toBe(true);
    expect(v.exceptions.find((e) => e.slug === 'festa')?.selected).toBe(false);
    expect(v.exceptions.map((e) => e.slug)).toEqual(expect.arrayContaining(['malattia', 'notte-in-bianco', 'alcol']));
  });

  it('slug attivo sconosciuto: in coda con etichetta derivata', () => {
    const v = buildNightEditView(base({ activeExceptions: ['cena-di-lavoro'] }));
    const last = v.exceptions[v.exceptions.length - 1];
    expect(last).toEqual({ slug: 'cena-di-lavoro', label: 'Cena di lavoro', selected: true });
  });

  it('elenco vuoto: vecchio schema (isException + factors)', () => {
    const night = makeNight('2026-10-12', '01:30', '09:10', { isException: true, factors: ['viaggio'] });
    const v = buildNightEditView(base({ date: '2026-10-12', night }));
    expect(v.exceptions.filter((e) => e.selected).map((e) => e.slug)).toEqual(['viaggio']);
    const w = buildNightEditView(base({ date: '2026-10-12', night: makeNight('2026-10-12', '01:30', '09:10', { factors: ['viaggio'] }) }));
    expect(w.exceptions.some((e) => e.selected)).toBe(false);
  });

  it('fattori: predefiniti con selezione dal check e personalizzati selezionati in coda', () => {
    const v = buildNightEditView(
      base({
        eveningCheck: chk('2026-10-19', { factors: ['sport', 'yoga-serale'], dayNote: 'Cena tardi', tiredness: { value: 5, provenance: 'confermato' } }),
        factorLabels: { 'yoga-serale': 'Yoga serale' },
      }),
    );
    expect(v.factors.find((f) => f.slug === 'sport')?.selected).toBe(true);
    expect(v.factors.find((f) => f.slug === 'alcol')?.selected).toBe(false);
    expect(v.factors[v.factors.length - 1]).toEqual({ slug: 'yoga-serale', label: 'Yoga serale', selected: true });
    expect(v.tiredness).toBe(5);
    expect(v.mood).toBe(3);
    expect(v.dayNote).toBe('Cena tardi');
    expect(buildNightEditView(base()).factors.every((f) => !f.selected)).toBe(true);
  });
});

describe('buildNightEditView: sonnellino e navigazione', () => {
  const nap = (date: string, minutes: number): Nap => ({
    date,
    startAt: localToIso(date, 14 * 60 + minutes),
    minutes,
    provenance: 'confermato',
  });

  it('somma i sonnellini del giorno', () => {
    expect(buildNightEditView(base({ naps: [nap('2026-10-20', 20), nap('2026-10-20', 12), nap('2026-10-19', 40)] })).napText).toBe(
      'Sonnellino 32 min',
    );
    expect(buildNightEditView(base({ naps: [nap('2026-10-19', 40)] })).napText).toBeNull();
  });

  it('prev/next: oggi non ha notte dopo, ieri sì', () => {
    expect(buildNightEditView(base({ date: TODAY })).nextDate).toBeNull();
    expect(buildNightEditView(base({ date: TODAY })).prevDate).toBe('2026-10-23');
    expect(buildNightEditView(base({ date: '2026-10-23' })).nextDate).toBe(TODAY);
  });

  it('prev ai bordi: null prima del 2000', () => {
    expect(buildNightEditView(base({ date: '2000-01-01' })).prevDate).toBeNull();
    expect(buildNightEditView(base({ date: '2000-01-02' })).prevDate).toBe('2000-01-01');
  });

  it('backHref usa mese e giorno', () => {
    expect(buildNightEditView(base({ date: '2026-09-30' })).backHref).toBe('/storico?m=2026-09&d=2026-09-30');
  });
});
