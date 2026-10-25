import { describe, expect, it } from 'vitest';

import { setExceptions } from '../../../src/server/mutations';
import { MemoryRepo } from '../../../src/server/memory-repo';
import { loadNightPage } from '../../../src/server/pages/night';
import { DEMO_NOW, buildDemoSeed } from '../../../src/server/seed';

const NOW = new Date(DEMO_NOW);

describe('loadNightPage', () => {
  it('con il dataset demo: oggi è sabato 24 ottobre e stanotte è stimata', async () => {
    const repo = new MemoryRepo(buildDemoSeed(DEMO_NOW));
    const { today, view } = await loadNightPage(repo, NOW);
    expect(today).toBe('2026-10-24');
    expect(view.nightDate).toBe('2026-10-24');
    expect(view.empty).toBe(false);
    expect(view.status).toBe('stimata');
    expect(view.canConfirm).toBe(true);
    expect(view.durationMin).toBeGreaterThan(0);
    expect(view.timeline.items.length).toBeGreaterThan(0);
    expect(view.exceptions.chips.length).toBeGreaterThan(0);
    expect(view.stats).toHaveLength(4);
  });

  it('con un repo vuoto: la notte è mancante, nessun errore', async () => {
    const { today, view } = await loadNightPage(new MemoryRepo(), NOW);
    expect(today).toBe('2026-10-24');
    expect(view.empty).toBe(true);
    expect(view.status).toBe('mancante');
  });

  it('la data di oggi segue il fuso Europe/Rome, non UTC', async () => {
    // 23:30 UTC del 24 = 01:30 del 25 a Roma
    const { today } = await loadNightPage(new MemoryRepo(), new Date('2026-10-24T23:30:00Z'));
    expect(today).toBe('2026-10-25');
  });

  it('usa il target di sonno delle impostazioni e le domande già poste oggi', async () => {
    const repo = new MemoryRepo({ ...buildDemoSeed(DEMO_NOW), settings: { target_sleep_minutes: 480 } });
    await repo.logQuestion({ date: '2026-10-24', kind: 'confirm_night', nightDate: '2026-10-24', answeredOrSkipped: true });
    const { view } = await loadNightPage(repo, NOW);
    expect(view.questions.some((q) => q.kind === 'confirm_night' && q.nightDate === '2026-10-24')).toBe(false);
  });

  it('i chip scelti con setExceptions restano attivi dopo il ricaricamento (fonte: night_exceptions)', async () => {
    const repo = new MemoryRepo();
    const r = await setExceptions(repo, { nightDate: '2026-10-24', slugs: ['viaggio'] });
    expect(r.ok).toBe(true);
    const { view } = await loadNightPage(repo, NOW);
    const active = view.exceptions.chips.filter((c) => c.active).map((c) => c.slug);
    expect(active).toEqual(['viaggio']);
  });

  it('un imprevisto libero aggiunto compare come chip attivo, con l’etichetta del tipo', async () => {
    const repo = new MemoryRepo();
    await setExceptions(repo, { nightDate: '2026-10-24', slugs: ['trasloco', 'festa'] });
    const { view } = await loadNightPage(repo, NOW);
    const chip = view.exceptions.chips.find((c) => c.slug === 'trasloco');
    expect(chip).toBeDefined();
    expect(chip?.active).toBe(true);
    expect(chip?.label.toLowerCase()).toBe('trasloco');
    expect(view.exceptions.chips.filter((c) => c.active).map((c) => c.slug).sort()).toEqual(['festa', 'trasloco']);
  });

  it('togliendo tutte le eccezioni nessun chip resta attivo', async () => {
    const repo = new MemoryRepo();
    await setExceptions(repo, { nightDate: '2026-10-24', slugs: ['viaggio'] });
    await setExceptions(repo, { nightDate: '2026-10-24', slugs: [] });
    const { view } = await loadNightPage(repo, NOW);
    expect(view.exceptions.chips.some((c) => c.active)).toBe(false);
  });
});
