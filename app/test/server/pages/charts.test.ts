import { describe, expect, it } from 'vitest';

import { MemoryRepo } from '../../../src/server/memory-repo';
import { loadChartsPage } from '../../../src/server/pages/charts';
import { DEMO_NOW, buildDemoSeed } from '../../../src/server/seed';

const NOW = new Date(DEMO_NOW);

describe('loadChartsPage', () => {
  it('con il dataset demo: oggi è sabato 24 ottobre e tutte le sezioni hanno dati', async () => {
    const repo = new MemoryRepo(buildDemoSeed(DEMO_NOW));
    const { today, view } = await loadChartsPage(repo, NOW);
    expect(today).toBe('2026-10-24');
    expect(view.empty).toBe(false);
    expect(view.duration.bars).toHaveLength(14);
    expect(view.duration.hidden).toBe(false);
    expect(view.heatmap.hidden).toBe(false);
    expect(view.correlations.hidden).toBe(false);
    expect(view.monthly.hidden).toBe(false);
    expect(view.monthly.bars.length).toBeGreaterThan(0);
    expect(view.forecast.hidden).toBe(false);
    expect(view.naps.hidden).toBe(false);
  });

  it('con un repo vuoto: view vuota, nessun errore', async () => {
    const { today, view } = await loadChartsPage(new MemoryRepo(), NOW);
    expect(today).toBe('2026-10-24');
    expect(view.empty).toBe(true);
    expect(view.emptyText).toMatch(/Nessuna fretta/);
  });

  it('la data di oggi segue il fuso Europe/Rome, non UTC', async () => {
    const { today } = await loadChartsPage(new MemoryRepo(), new Date('2026-10-24T23:30:00Z'));
    expect(today).toBe('2026-10-25');
  });

  it('usa l’obiettivo delle impostazioni e ignora valori non validi', async () => {
    const seed = buildDemoSeed(DEMO_NOW);
    const custom = await loadChartsPage(new MemoryRepo({ ...seed, settings: { target_sleep_minutes: 480 } }), NOW);
    expect(custom.view.duration.targetText).toBe('Linea tratteggiata = obiettivo 8h 00m');
    const bad = await loadChartsPage(new MemoryRepo({ ...seed, settings: { target_sleep_minutes: -5 } }), NOW);
    expect(bad.view.duration.targetText).toBe('Linea tratteggiata = obiettivo 7h 30m');
  });

  it('legge il trend dei sei mesi dalle notti più vecchie di 60 giorni', async () => {
    const repo = new MemoryRepo(buildDemoSeed(DEMO_NOW));
    const { view } = await loadChartsPage(repo, NOW);
    expect(view.monthly.bars).toHaveLength(6);
  });
});
