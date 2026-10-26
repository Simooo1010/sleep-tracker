import { describe, expect, it } from 'vitest';
import type { EveningCheck } from '../../../src/domain/types';
import { buildHistoryView, dayNoteFor } from '../../../src/server/views';
import { TODAY, buildDataset, datasetWithTonight, expectSerializable, makeNight } from './fixtures';

describe('buildHistoryView: ottobre 2026', () => {
  const ds = datasetWithTonight();
  const v = buildHistoryView({ today: TODAY, nights: ds.nights, naps: ds.naps });

  it('griglia del mese L–D con celle vuote iniziali e giorni futuri disabilitati', () => {
    expect(v.title).toBe('ottobre 2026');
    expect(v.weekdays).toEqual(['L', 'M', 'M', 'G', 'V', 'S', 'D']);
    // 1 ottobre 2026 è giovedì: tre celle vuote prima.
    expect(v.cells.slice(0, 3).every((c) => c.date === null && c.disabled)).toBe(true);
    expect(v.cells).toHaveLength(3 + 31);
    const day = (d: number) => v.cells.find((c) => c.day === d)!;
    expect(day(6)).toMatchObject({ shortText: '—', status: 'mancante', band: null, future: false });
    expect(day(18)).toMatchObject({ shortText: '—', status: 'mancante' });
    expect(day(24)).toMatchObject({ shortText: '7h32', status: 'stimata', band: 'blue', selected: true, isToday: true });
    expect(day(25)).toMatchObject({ shortText: '', status: null, future: true, disabled: true, band: null });
    expect(day(24).ariaLabel).toBe('Notte del 24 ottobre: 7h 32m, stimata');
    expect(v.cells.filter((c) => c.date !== null && !c.future).every((c) => c.shortText === '—' || /^\d+h\d\d$/.test(c.shortText))).toBe(true);
    expect(v.prevMonth).toBe('2026-09');
    expect(v.nextMonth).toBeNull();
    expect(v.legend).toBe('Verde 8h+ · Azzurro 7–8h · Pesca meno di 7h · Tratteggio = stimata · Punti = mancante');
  });

  it('dettaglio della notte selezionata (default: oggi)', () => {
    expect(v.selectedDate).toBe(TODAY);
    expect(v.detail).toEqual({
      date: TODAY,
      title: 'Notte del 24 ottobre',
      dateLabel: 'sabato 24 ottobre',
      durationText: '7h 32m',
      rangeText: '23:48 → 07:20',
      status: 'stimata',
      statusWord: 'Stimata',
      bedProvenanceWord: 'Automatico',
      wakeProvenanceWord: 'Automatico',
      note: 'Orari stimati dai segnali. Conferma per renderli definitivi.',
      tags: ['Notte del weekend'],
      dayNote: null,
    });
  });

  it('nota della giornata: dal check della sera prima, con la parola "Nota"', () => {
    const checks = [
      { date: '2026-10-23', tiredness: { value: 3, provenance: 'confermato' }, mood: { value: 3, provenance: 'confermato' }, factors: [], napMinutesToday: { value: null, provenance: 'mancante' }, dayNote: '  Cena fuori con amici  ' },
      { date: '2026-10-24', tiredness: { value: 3, provenance: 'confermato' }, mood: { value: 3, provenance: 'confermato' }, factors: [], napMinutesToday: { value: null, provenance: 'mancante' }, dayNote: '   ' },
    ] as EveningCheck[];
    const w = buildHistoryView({ today: TODAY, nights: ds.nights, naps: ds.naps, selectedDate: '2026-10-24', eveningChecks: checks });
    expect(w.detail?.dayNote).toEqual({ label: 'Nota · giornata del 23 ottobre', text: 'Cena fuori con amici' });
    // La sera del 24 ha solo spazi: la notte del 25 non esiste ancora e un testo vuoto non è una nota.
    expect(dayNoteFor('2026-10-25', checks)).toBeNull();
    expect(dayNoteFor('2026-10-20', checks)).toBeNull();
    expect(dayNoteFor('2026-10-24', [])).toBeNull();
  });

  it('la nota compare anche se la notte è mancante', () => {
    const checks = [
      { date: '2026-10-13', tiredness: { value: null, provenance: 'mancante' }, mood: { value: null, provenance: 'mancante' }, factors: [], napMinutesToday: { value: null, provenance: 'mancante' }, dayNote: 'Giornata di lavoro lunga' },
    ] as EveningCheck[];
    const gap = buildHistoryView({ today: TODAY, nights: ds.nights, selectedDate: '2026-10-14', eveningChecks: checks });
    expect(gap.detail?.statusWord).toBe('Mancante');
    expect(gap.detail?.dayNote?.text).toBe('Giornata di lavoro lunga');
  });

  it('notte confermata con voti, fattori e sonnellino', () => {
    const w = buildHistoryView({ today: TODAY, nights: ds.nights, naps: ds.naps, selectedDate: '2026-10-23' });
    expect(w.detail?.statusWord).toBe('Confermata');
    expect(w.detail?.note).toBe('Orari confermati da te la mattina dopo.');
    expect(w.detail?.tags[0]).toMatch(/^Qualità [1-5] su 5$/);
    expect(w.detail?.tags[1]).toMatch(/^Energia [1-5] su 5$/);
    expect(w.detail?.tags).toContain('Giorno feriale');
    expect(w.detail?.tags.some((t) => /^Sonnellino \d+ min$/.test(t))).toBe(true);
    expect(w.detail?.tags.some((t) => /^Sonno 24 ore \d+h \d\dm$/.test(t))).toBe(true);
  });

  it('notte mancante ed eccezione', () => {
    const gap = buildHistoryView({ today: TODAY, nights: ds.nights, selectedDate: '2026-10-14' });
    expect(gap.detail).toMatchObject({
      durationText: '—',
      rangeText: 'Nessun dato',
      statusWord: 'Mancante',
      note: 'Nessun segnale ricevuto. Puoi inserire gli orari a mano o lasciare la stima dei giorni vicini.',
      tags: [],
    });
    const exc = buildHistoryView({ today: TODAY, nights: ds.nights, selectedDate: '2026-10-12' });
    expect(exc.detail?.tags).toEqual(expect.arrayContaining(['Eccezione', 'Viaggio']));
    expect(exc.detail?.note).toContain('non conta nel riferimento della regolarità');
    const future = buildHistoryView({ today: TODAY, nights: ds.nights, selectedDate: '2026-10-28' });
    expect(future.selectedDate).toBeNull();
    expect(future.detail).toBeNull();
  });

  it('mese passato: si seleziona l’ultimo giorno', () => {
    const sep = buildHistoryView({ today: TODAY, nights: ds.nights, month: '2026-09' });
    expect(sep.title).toBe('settembre 2026');
    expect(sep.selectedDate).toBe('2026-09-30');
    expect(sep.nextMonth).toBe('2026-10');
    expect(sep.cells.filter((c) => c.date === null)).toHaveLength(1); // 1 settembre 2026 è martedì
    expect(sep.cells.filter((c) => c.date !== null && c.shortText !== '—')).toHaveLength(6);
  });

  it('serializzabile', () => {
    expectSerializable(v);
  });
});

describe('buildHistoryView: vuoto e cambio d’ora', () => {
  it('mese senza notti: empty, celle mancanti, nessun errore', () => {
    const v = buildHistoryView({ today: TODAY, nights: [], month: '2026-08' });
    expect(v.empty).toBe(true);
    expect(v.emptyText).toBe('Nessuna notte registrata in questo mese.');
    expect(v.detail?.rangeText).toBe('Nessun dato');
    expect(v.cells.filter((c) => c.date !== null).every((c) => c.status === 'mancante' && c.shortText === '—')).toBe(true);
    expectSerializable(v);
  });

  it('notte del 25 ottobre (ritorno all’ora solare): 9h 00m', () => {
    const ds = buildDataset(30, '2026-09-27');
    const nights = [
      ...ds.nights.filter((n) => n.nightDate !== '2026-10-25'),
      makeNight('2026-10-25', '23:30', '07:30', { quality: 4, energy: 5 }),
    ];
    const v = buildHistoryView({ today: '2026-10-26', nights, selectedDate: '2026-10-25' });
    expect(v.cells.find((c) => c.day === 25)).toMatchObject({ shortText: '9h00', band: 'sage' });
    expect(v.detail).toMatchObject({
      dateLabel: 'domenica 25 ottobre',
      durationText: '9h 00m',
      rangeText: '23:30 → 07:30',
      tags: ['Qualità 4 su 5', 'Energia 5 su 5', 'Notte del weekend'],
    });
    expectSerializable(v);
  });
});
