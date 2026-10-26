import { describe, expect, it } from 'vitest';
import { durationStats, sleepDebt } from '../../../src/domain/sleep-balance';
import { buildNightView } from '../../../src/server/views';
import { formatHm } from '../../../src/server/views/format';
import { TODAY, buildDataset, datasetWithTonight, expectSerializable, makeNight, tonightEstimated } from './fixtures';

describe('buildNightView: stanotte stimata dai segnali', () => {
  const ds = datasetWithTonight();
  const v = buildNightView({
    today: TODAY,
    nights: ds.nights,
    events: ds.events,
    naps: ds.naps,
    eveningChecks: ds.checks,
    exceptionTypes: [
      { slug: 'viaggio', label: 'Viaggio', uses: 3 },
      { slug: 'festa', label: 'Festa', uses: 1 },
    ],
  });

  it('scheda Stanotte: durata, orari, stato e provenienza a parole', () => {
    expect(v.empty).toBe(false);
    expect(v.emptyText).toBeNull();
    expect(v.label).toBe('Stanotte');
    expect(v.dateLabel).toBe('sabato 24 ottobre');
    expect(v.status).toBe('stimata');
    expect(v.statusWord).toBe('Stimata');
    expect(v.durationMin).toBe(452);
    expect(v.durationText).toBe('7h 32m');
    expect(v.rangeText).toBe('23:48 → 07:20');
    expect(v.bed).toMatchObject({ text: '23:48', provenance: 'automatico', provenanceWord: 'Automatico' });
    expect(v.wake).toMatchObject({ text: '07:20', provenanceWord: 'Automatico' });
    expect(v.canConfirm).toBe(true);
    expect(v.confirmLabel).toBe('Conferma');
    expect(v.editLabel).toBe('Correggi orari');
    expect(v.confirmedText).toBe('Registrata. Grazie.');
    expect(v.energy).toEqual({ value: null, text: '—', provenance: 'mancante', provenanceWord: 'Mancante' });
  });

  it('barra sull’asse 21:00 → 11:00', () => {
    // 23:48 = 168 min dalle 21:00 → 20%; 452 min su 840 → 53,81%.
    expect(v.bar).toEqual({ leftPct: 20, widthPct: 53.81 });
  });

  it('spiegazione di come è stata stimata', () => {
    expect(v.explanation).toBe(
      'Inizio stimato da Riposo (23:48), fine dalla sveglia interrotta (07:20). Controlla e conferma.',
    );
  });

  it('timeline degli eventi, in ordine', () => {
    expect(v.timeline.title).toBe('La notte, in ordine');
    expect(v.timeline.items.map((i) => `${i.time} ${i.title}`)).toEqual([
      '23:41 Check serale salvato',
      '23:48 Riposo attivato',
      '07:20 Sveglia interrotta',
      '08:52 Primo uso del telefono',
    ]);
    expect(v.timeline.items.map((i) => i.kind)).toEqual(['serale', 'confermato', 'confermato', 'serale']);
    expect(v.timeline.items[0]?.origin).toBe('Comando "Sera" · stanchezza 4 su 5');
    expect(v.timeline.emptyText).toBeNull();
  });

  it('domande rapide da selectQuestions, con Salta', () => {
    expect(v.questions.length).toBeGreaterThan(0);
    expect(v.questions.length).toBeLessThanOrEqual(3);
    expect(v.questions[0]).toEqual({
      kind: 'confirm_night',
      nightDate: TODAY,
      text: 'Stanotte: a letto alle 23:48, sveglia alle 07:20. Confermi?',
      answers: [
        { value: 'conferma', label: 'Conferma' },
        { value: 'correggi', label: 'Correggi' },
      ],
      skipLabel: 'Salta',
    });
  });

  it('chip eccezioni ordinati per uso, poi i predefiniti', () => {
    expect(v.exceptions.chips.map((c) => c.slug)).toEqual(['viaggio', 'festa', 'malattia', 'notte-in-bianco', 'alcol']);
    expect(v.exceptions.chips.every((c) => !c.active)).toBe(true);
    expect(v.exceptions.addLabel).toBe('+ Aggiungi');
    expect(v.exceptions.note).toBe('Non conta nel riferimento della regolarità.');
  });

  it('pillola di regolarità e confronto con il solito', () => {
    expect(v.regularity).toEqual({
      bedText: '+13 min',
      wakeText: '+15 min',
      ok: true,
      word: 'nella tolleranza',
      text: 'Letto +13 min · Sveglia +15 min · nella tolleranza (scarti dalla mediana)',
    });
    expect(v.comparison.title).toBe('Rispetto al tuo solito');
    expect(v.comparison.hidden).toBe(false);
    expect(v.comparison.rows.map((r) => r.label)).toEqual(['Addormentamento', 'Durata', 'Regolarità']);
    expect(v.comparison.rows[0]?.text).toBe('23:48 · mediana 23:35');
    expect(v.comparison.rows[2]?.text).toMatch(/^scarto \+13 min · mediana ± \d+ min$/);
  });

  it('quattro StatTile con copertura, numeri dal dominio', () => {
    expect(v.stats.map((s) => s.label)).toEqual(['Durata media', 'Regolarità', 'Debito', 'Sonno 24 ore']);
    expect(v.stats.map((s) => s.tone)).toEqual(['blue', 'sage', 'peach', 'yellow']);
    const avg7 = durationStats(ds.nights, TODAY).avg7;
    const debt = sleepDebt(ds.nights, TODAY);
    expect(v.stats[0]?.value).toBe(formatHm(avg7.value));
    expect(v.stats[0]?.coverage.text).toBe(`Calcolata su ${avg7.coverage.used} su 7 notti`);
    expect(v.stats[0]?.coverage.marks).toHaveLength(7);
    expect(v.stats[2]?.value).toBe(formatHm(debt.value));
    expect(v.stats[1]?.value).toMatch(/^± \d+ min$/);
    expect(v.stats[1]?.note).toMatch(/^\d+ notti su \d+ nella tolleranza$/);
    expect(v.stats[1]?.coverage.text).toBe('Calcolata su 11 su 14 notti');
    // Ieri (23 ott): notte + sonnellino da comando rapido.
    expect(v.stats[3]?.note).toBe('Ieri, con sonnellino');
    expect(v.stats.every((s) => !s.hidden && s.hiddenText === null)).toBe(true);
  });

  it('è serializzabile, senza NaN né undefined', () => {
    expectSerializable(v);
  });
});

describe('buildNightView: casi particolari', () => {
  it('sveglia mancante: resta mancante, la frase parla solo dell’inizio', () => {
    const { events } = tonightEstimated();
    const night = makeNight(TODAY, '23:48', null, { status: 'stimata', prov: 'automatico' });
    const ds = buildDataset();
    const v = buildNightView({
      today: TODAY,
      nights: [...ds.nights.filter((n) => n.nightDate !== TODAY), night],
      events: events.filter((e) => e.type === 'bedtime_candidate'),
    });
    expect(v.explanation).toBe('Inizio stimato da Riposo (23:48). Controlla e conferma.');
    expect(v.durationText).toBe('—');
    expect(v.durationMin).toBeNull();
    expect(v.wake).toEqual({ iso: null, text: '—', provenance: 'mancante', provenanceWord: 'Mancante' });
    expect(v.rangeText).toBe('23:48 → —');
    expect(v.bar).toBeNull();
    expect(v.regularity).toBeNull();
    expectSerializable(v);
  });

  it('orari dai giorni simili: frase e timeline "da confermare"', () => {
    const ds = buildDataset();
    const night = makeNight(TODAY, '23:35', '07:10', { status: 'stimata', prov: 'stimato' });
    const v = buildNightView({ today: TODAY, nights: [...ds.nights.filter((n) => n.nightDate !== TODAY), night], events: [] });
    expect(v.explanation).toBe(
      'Inizio stimato dai giorni simili (23:35), fine stimata dai giorni simili (07:10). Controlla e conferma.',
    );
    expect(v.bed.provenanceWord).toBe('Stimato');
    expect(v.timeline.items.map((i) => [i.time, i.title, i.kind])).toEqual([
      ['23:35', 'Inizio stimato', 'da-confermare'],
      ['07:10', 'Risveglio stimato', 'da-confermare'],
    ]);
    expectSerializable(v);
  });

  it('notte confermata: niente conferma da chiedere, domanda sull’energia', () => {
    const ds = buildDataset();
    const night = makeNight(TODAY, '23:40', '07:15', { quality: 4 });
    const v = buildNightView({ today: TODAY, nights: [...ds.nights.filter((n) => n.nightDate !== TODAY), night] });
    expect(v.confirmed).toBe(true);
    expect(v.canConfirm).toBe(false);
    expect(v.statusWord).toBe('Confermata');
    expect(v.explanation).toBe('Orari confermati da te.');
    expect(v.quality.text).toBe('4 su 5');
    expect(v.questions.some((q) => q.kind === 'confirm_night')).toBe(false);
    const energy = v.questions.find((q) => q.kind === 'energy');
    expect(energy?.text).toBe('Energia stamattina? (1–5)');
    expect(energy?.answers.map((a) => a.label)).toEqual(['1', '2', '3', '4', '5']);
    expectSerializable(v);
  });

  it('nessun dato: empty, testi dedicati, statistiche nascoste senza errori', () => {
    const v = buildNightView({ today: TODAY, nights: [] });
    expect(v.empty).toBe(true);
    expect(v.emptyText).toBe(
      'Per stanotte non è arrivato nessun segnale. Puoi inserire gli orari a mano, oppure lasciarla mancante.',
    );
    expect(v.status).toBe('mancante');
    expect(v.statusWord).toBe('Mancante');
    expect(v.durationText).toBe('—');
    expect(v.canConfirm).toBe(false);
    expect(v.timeline.items).toEqual([]);
    expect(v.timeline.emptyText).toBe('Nessun segnale per questa notte.');
    expect(v.questions).toEqual([]);
    expect(v.comparison).toMatchObject({ hidden: true, hiddenText: 'Servono almeno 5 notti. Per ora ne hai 0.', rows: [] });
    expect(v.stats.every((s) => s.hidden && s.value === '—' && typeof s.hiddenText === 'string')).toBe(true);
    expect(v.stats[2]?.hiddenText).toBe('Servono almeno 3 notti. Per ora ne hai 0.');
    expect(v.stats[3]?.coverage.text).toBe('Nessuna notte disponibile');
    expectSerializable(v);
  });

  it('cambio d’ora 2026-10-25: durata reale, orari locali', () => {
    const ds = buildDataset(30, '2026-09-26'); // ultima notte = 25 ottobre
    const night = makeNight('2026-10-25', '23:30', '07:30', { status: 'stimata', prov: 'automatico' });
    const v = buildNightView({
      today: '2026-10-25',
      nights: [...ds.nights.filter((n) => n.nightDate !== '2026-10-25'), night],
    });
    expect(v.dateLabel).toBe('domenica 25 ottobre');
    expect(v.rangeText).toBe('23:30 → 07:30');
    expect(v.durationMin).toBe(540); // un'ora in più: si torna all'ora solare
    expect(v.durationText).toBe('9h 00m');
    expectSerializable(v);
  });
});

describe('buildNightView: chip eccezioni da night_exceptions', () => {
  const ds = datasetWithTonight();
  const base = { today: TODAY, nights: ds.nights, events: ds.events, naps: ds.naps, eveningChecks: ds.checks };

  it('activeExceptions accende i chip anche se la notte non ha gli slug in factors', () => {
    const v = buildNightView({ ...base, activeExceptions: ['alcol'] });
    expect(v.exceptions.chips.filter((c) => c.active).map((c) => c.slug)).toEqual(['alcol']);
  });

  it('slug personalizzati: etichetta dai tipi, ordine per uses; quelli ignoti in coda', () => {
    const v = buildNightView({
      ...base,
      exceptionTypes: [
        { slug: 'trasloco', label: 'Trasloco', uses: 4 },
        { slug: 'viaggio', label: 'Viaggio', uses: 2 },
      ],
      activeExceptions: ['trasloco', 'esame-orale'],
    });
    const slugs = v.exceptions.chips.map((c) => c.slug);
    expect(slugs.slice(0, 2)).toEqual(['trasloco', 'viaggio']);
    expect(slugs[slugs.length - 1]).toBe('esame-orale');
    expect(v.exceptions.chips.find((c) => c.slug === 'esame-orale')).toMatchObject({ label: 'Esame orale', active: true });
    expect(v.exceptions.chips.filter((c) => c.active).map((c) => c.slug)).toEqual(['trasloco', 'esame-orale']);
  });

  it('senza activeExceptions vale il vecchio schema (isException + factors), come nel seed demo', () => {
    const nights = ds.nights.map((n) => (n.nightDate === TODAY ? { ...n, isException: true, factors: ['festa'] } : n));
    const v = buildNightView({ ...base, nights });
    expect(v.exceptions.chips.filter((c) => c.active).map((c) => c.slug)).toEqual(['festa']);
  });
});
