import { describe, expect, it } from 'vitest';

import { MemoryRepo } from '../../../src/server/memory-repo';
import {
  isValidDay,
  isValidMonth,
  loadHistoryPage,
  monthBounds,
  parseHistoryParams,
} from '../../../src/server/pages/history';
import { DEMO_NOW, buildDemoSeed } from '../../../src/server/seed';

const NOW = new Date(DEMO_NOW);
const TODAY = '2026-10-24';

describe('isValidMonth / isValidDay', () => {
  it('mesi ben formati', () => {
    expect(isValidMonth('2026-10')).toBe(true);
    expect(isValidMonth('2026-01')).toBe(true);
    expect(isValidMonth('2026-12')).toBe(true);
  });

  it('mesi malformati', () => {
    for (const m of ['2026-13', '2026-00', '2026-1', '26-10', '2026/10', '2026-10-01', 'ottobre', '', ' 2026-10', '1999-12', undefined, null, 5]) {
      expect(isValidMonth(m)).toBe(false);
    }
  });

  it('giorni reali, anno bisestile incluso', () => {
    expect(isValidDay('2024-02-29')).toBe(true);
    expect(isValidDay('2000-02-29')).toBe(true);
    expect(isValidDay('2026-02-28')).toBe(true);
    expect(isValidDay('2026-02-29')).toBe(false);
    expect(isValidDay('2100-02-29')).toBe(false);
    expect(isValidDay('2026-04-31')).toBe(false);
    expect(isValidDay('2026-10-00')).toBe(false);
    expect(isValidDay('2026-10-32')).toBe(false);
    expect(isValidDay('2026-10-5')).toBe(false);
    expect(isValidDay('')).toBe(false);
    expect(isValidDay(undefined)).toBe(false);
  });

  it('limiti del mese', () => {
    expect(monthBounds('2026-10')).toEqual({ first: '2026-10-01', last: '2026-10-31' });
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthBounds('2024-02')).toEqual({ first: '2024-02-01', last: '2024-02-29' });
    expect(monthBounds('2026-12').last).toBe('2026-12-31');
  });
});

describe('parseHistoryParams', () => {
  it('senza parametri: mese corrente, nessun giorno scelto', () => {
    expect(parseHistoryParams({}, TODAY)).toEqual({ month: '2026-10' });
  });

  it('mese e giorno validi', () => {
    expect(parseHistoryParams({ m: '2026-09', d: '2026-09-15' }, TODAY)).toEqual({ month: '2026-09', selectedDate: '2026-09-15' });
    expect(parseHistoryParams({ d: '2026-10-10' }, TODAY)).toEqual({ month: '2026-10', selectedDate: '2026-10-10' });
    expect(parseHistoryParams({ m: '2026-10', d: '2026-10-24' }, TODAY)).toEqual({ month: '2026-10', selectedDate: '2026-10-24' });
  });

  it('mese malformato: si usa il mese corrente', () => {
    for (const m of ['2026-13', 'abc', '2026-9', '', '2026-10-01']) {
      expect(parseHistoryParams({ m }, TODAY)).toEqual({ month: '2026-10' });
    }
  });

  it('mese nel futuro: ignorato', () => {
    expect(parseHistoryParams({ m: '2026-11' }, TODAY)).toEqual({ month: '2026-10' });
    expect(parseHistoryParams({ m: '2030-01', d: '2030-01-05' }, TODAY)).toEqual({ month: '2026-10' });
  });

  it('giorno nel futuro: ignorato, anche nel mese corrente', () => {
    expect(parseHistoryParams({ d: '2026-10-25' }, TODAY)).toEqual({ month: '2026-10' });
    expect(parseHistoryParams({ d: '2026-10-31' }, TODAY)).toEqual({ month: '2026-10' });
  });

  it('giorno fuori dal mese mostrato: ignorato', () => {
    expect(parseHistoryParams({ m: '2026-09', d: '2026-10-03' }, TODAY)).toEqual({ month: '2026-09' });
    expect(parseHistoryParams({ d: '2026-09-30' }, TODAY)).toEqual({ month: '2026-10' });
  });

  it('giorno inesistente: ignorato (anno non bisestile)', () => {
    expect(parseHistoryParams({ m: '2026-02', d: '2026-02-29' }, TODAY)).toEqual({ month: '2026-02' });
    expect(parseHistoryParams({ m: '2026-04', d: '2026-04-31' }, TODAY)).toEqual({ month: '2026-04' });
  });

  it('29 febbraio di un anno bisestile passato è valido', () => {
    expect(parseHistoryParams({ m: '2024-02', d: '2024-02-29' }, TODAY)).toEqual({ month: '2024-02', selectedDate: '2024-02-29' });
  });

  it('oggi a cavallo di mezzanotte: il futuro dipende da oggi, non dal mese', () => {
    expect(parseHistoryParams({ m: '2026-11', d: '2026-11-01' }, '2026-11-01')).toEqual({ month: '2026-11', selectedDate: '2026-11-01' });
  });
});

describe('loadHistoryPage', () => {
  const repo = () => new MemoryRepo(buildDemoSeed(DEMO_NOW));

  it('senza parametri: ottobre 2026, oggi selezionato, 24 giorni passati e 7 futuri', async () => {
    const { today, view } = await loadHistoryPage(repo(), NOW, {});
    expect(today).toBe(TODAY);
    expect(view.month).toBe('2026-10');
    expect(view.title).toBe('ottobre 2026');
    expect(view.selectedDate).toBe(TODAY);
    expect(view.detail?.date).toBe(TODAY);
    expect(view.empty).toBe(false);
    expect(view.nextMonth).toBeNull();
    expect(view.prevMonth).toBe('2026-09');
    const days = view.cells.filter((c) => c.date !== null);
    expect(days).toHaveLength(31);
    expect(days.filter((c) => c.future)).toHaveLength(7);
    const past = days.filter((c) => !c.future);
    expect(past).toHaveLength(24);
    expect(past.filter((c) => c.status !== 'mancante').length).toBeGreaterThan(15);
  });

  it('mese passato: settembre 2026, ultimo giorno scelto per default, mese successivo disponibile', async () => {
    const { view } = await loadHistoryPage(repo(), NOW, { m: '2026-09' });
    expect(view.month).toBe('2026-09');
    expect(view.selectedDate).toBe('2026-09-30');
    expect(view.nextMonth).toBe('2026-10');
    expect(view.prevMonth).toBe('2026-08');
    expect(view.cells.filter((c) => c.date !== null && c.future)).toHaveLength(0);
  });

  it('giorno scelto valido: dettaglio di quella notte', async () => {
    const { view } = await loadHistoryPage(repo(), NOW, { m: '2026-09', d: '2026-09-12' });
    expect(view.selectedDate).toBe('2026-09-12');
    expect(view.detail?.date).toBe('2026-09-12');
  });

  it('parametri non validi non danno errore e tornano ai predefiniti', async () => {
    const { view } = await loadHistoryPage(repo(), NOW, { m: '2099-01', d: 'zzz' });
    expect(view.month).toBe('2026-10');
    expect(view.selectedDate).toBe(TODAY);
  });

  it('repo vuoto: mese vuoto con testo calmo, nessun errore', async () => {
    const { view } = await loadHistoryPage(new MemoryRepo(), NOW, {});
    expect(view.empty).toBe(true);
    expect(view.emptyText).toBe('Nessuna notte registrata in questo mese.');
    expect(view.detail?.status).toBe('mancante');
  });

  it('mese prima del dataset (agosto): nessuna notte, nessun errore', async () => {
    const { view } = await loadHistoryPage(repo(), NOW, { m: '2026-07' });
    expect(view.empty).toBe(true);
  });

  it('una notte-eccezione porta il tag Eccezione nel dettaglio', async () => {
    const r = repo();
    const nights = await r.listNights('2026-08-01', TODAY);
    const exc = nights.find((n) => n.isException);
    expect(exc).toBeDefined();
    const { view } = await loadHistoryPage(r, NOW, { m: exc!.nightDate.slice(0, 7), d: exc!.nightDate });
    expect(view.detail?.tags).toContain('Eccezione');
  });
});
