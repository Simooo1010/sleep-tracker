import { describe, expect, it } from 'vitest';
import { MemoryRepo } from '../../../src/server/memory-repo';
import { loadNightEditPage } from '../../../src/server/pages/night-edit';
import { DEMO_NOW, buildDemoSeed } from '../../../src/server/seed';
import { expectSerializable } from '../views/fixtures';

const NOW = new Date(DEMO_NOW);
const TODAY = '2026-10-24';

describe('loadNightEditPage', () => {
  const repo = () => new MemoryRepo(buildDemoSeed(DEMO_NOW));

  it('data non valida o futura: null', async () => {
    for (const d of ['', 'abc', '2026-02-30', '2026-10-5', '1999-12-31', '2026-10-25', '2027-01-01']) {
      expect(await loadNightEditPage(repo(), NOW, d)).toBeNull();
    }
  });

  it('oggi è valido: nextDate null, today restituito', async () => {
    const r = await loadNightEditPage(repo(), NOW, TODAY);
    expect(r?.today).toBe(TODAY);
    expect(r?.view.date).toBe(TODAY);
    expect(r?.view.nextDate).toBeNull();
    expect(r?.view.prevDate).toBe('2026-10-23');
    expectSerializable(r);
  });

  it('notte passata con dati: orari, suggeriti dallo storico e sera prima', async () => {
    const r0 = repo();
    const night = (await r0.listNights('2026-09-01', TODAY)).find((n) => n.status === 'confermata' && n.nightDate < '2026-10-20');
    expect(night).toBeDefined();
    const d = night!.nightDate;
    const r = await loadNightEditPage(r0, NOW, d);
    expect(r?.view.date).toBe(d);
    expect(r?.view.status).toBe('confermata');
    expect(r?.view.bedTime).toMatch(/^\d\d:\d\d$/);
    expect(r?.view.suggestedBedTime).toMatch(/^\d\d:\d\d$/);
    expect(r?.view.eveningLabel.startsWith('Sera di ')).toBe(true);
    expect(r?.view.exceptions.length).toBeGreaterThanOrEqual(5);
  });

  it('notte senza record: mancante, suggeriti dallo storico', async () => {
    const r = await loadNightEditPage(repo(), NOW, '2026-07-01');
    expect(r?.view.status).toBe('mancante');
    expect(r?.view.bedTime).toBeNull();
    expect(r?.view.durationText).toBe('—');
  });

  it('notte stimata: stato stimata', async () => {
    const r0 = repo();
    const est = (await r0.listNights('2026-09-01', TODAY)).find((n) => n.status === 'stimata');
    expect(est).toBeDefined();
    const r = await loadNightEditPage(r0, NOW, est!.nightDate);
    expect(r?.view.status).toBe('stimata');
  });

  it('repo vuoto: nessun errore, suggeriti predefiniti', async () => {
    const r = await loadNightEditPage(new MemoryRepo(), NOW, '2026-10-20');
    expect(r?.view).toMatchObject({ status: 'mancante', suggestedBedTime: '23:30', suggestedWakeTime: '07:30' });
  });

  it('imprevisti della notte letti da night_exceptions', async () => {
    const r = repo();
    await r.setNightExceptions('2026-10-20', ['festa', 'cena-fuori'], { 'cena-fuori': 'cena fuori' });
    const p = await loadNightEditPage(r, NOW, '2026-10-20');
    const sel = p?.view.exceptions.filter((e) => e.selected).map((e) => e.slug).sort();
    expect(sel).toEqual(['cena-fuori', 'festa']);
  });
});
