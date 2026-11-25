import { describe, expect, it } from 'vitest';

import { MemoryRepo } from '../../../src/server/memory-repo';
import { loadAnalysisPage, parseAnalysisPeriod } from '../../../src/server/pages/analysis';
import { DEMO_NOW, buildDemoSeed } from '../../../src/server/seed';
import { expectSerializable } from '../views/fixtures';

const NOW = new Date(DEMO_NOW);

describe('parseAnalysisPeriod', () => {
  it('accetta 7, 14 e 30', () => {
    expect(parseAnalysisPeriod('7')).toBe(7);
    expect(parseAnalysisPeriod('14')).toBe(14);
    expect(parseAnalysisPeriod('30')).toBe(30);
    expect(parseAnalysisPeriod(' 30 ')).toBe(30);
  });

  it('default 14 per valori assenti o non validi', () => {
    for (const raw of [undefined, '', 'abc', '0', '-7', '7.5', '15', '1e1', '3O', []]) {
      expect(parseAnalysisPeriod(raw)).toBe(14);
    }
  });

  it('con più valori usa il primo', () => {
    expect(parseAnalysisPeriod(['30', '7'])).toBe(30);
    expect(parseAnalysisPeriod(['x', '7'])).toBe(14);
  });
});

describe('loadAnalysisPage', () => {
  it('con il dataset demo: tutte le sezioni hanno dati', async () => {
    const { today, period, view } = await loadAnalysisPage(new MemoryRepo(buildDemoSeed(DEMO_NOW)), NOW, 14);
    expect(today).toBe('2026-10-24');
    expect(period).toBe(14);
    expect(view.empty).toBe(false);
    expect(view.nights.points).toHaveLength(14);
    expect(view.score.hidden).toBe(false);
    expect(view.causes.hidden).toBe(false);
    expect(view.actions.length).toBeGreaterThanOrEqual(2);
    expect(view.forecast.hidden).toBe(false);
    expectSerializable(view);
  });

  it.each([7, 14, 30] as const)('periodo %i', async (p) => {
    const { period, view } = await loadAnalysisPage(new MemoryRepo(buildDemoSeed(DEMO_NOW)), NOW, p);
    expect(period).toBe(p);
    expect(view.period).toBe(p);
    expect(view.nights.points).toHaveLength(p);
    expect(view.coverage.window).toBe(p);
  });

  it('legge abbastanza storico per la deriva (6 settimane)', async () => {
    const { view } = await loadAnalysisPage(new MemoryRepo(buildDemoSeed(DEMO_NOW)), NOW, 7);
    // Il dataset demo ha una deriva lenta del letto: con meno di 3 settimane lette non comparirebbe.
    expect(view.actions.find((a) => a.id === 'anticipa-letto')?.why).toMatch(/in \d settimane/);
  });

  it('con un repo vuoto: view vuota, nessun errore', async () => {
    const { today, view } = await loadAnalysisPage(new MemoryRepo(), NOW, 14);
    expect(today).toBe('2026-10-24');
    expect(view.empty).toBe(true);
    expect(view.emptyText).toMatch(/nessuna fretta/);
    expectSerializable(view);
  });

  it('la data di oggi segue il fuso Europe/Rome, non UTC', async () => {
    const { today } = await loadAnalysisPage(new MemoryRepo(), new Date('2026-10-24T23:30:00Z'), 14);
    expect(today).toBe('2026-10-25');
  });

  it("usa l'obiettivo delle impostazioni e ignora valori non validi", async () => {
    const seed = buildDemoSeed(DEMO_NOW);
    const custom = await loadAnalysisPage(new MemoryRepo({ ...seed, settings: { target_sleep_minutes: 480 } }), NOW, 14);
    expect(custom.view.nights.targetMin).toBe(480);
    const bad = await loadAnalysisPage(new MemoryRepo({ ...seed, settings: { target_sleep_minutes: -5 } }), NOW, 14);
    expect(bad.view.nights.targetMin).toBe(450);
  });

  it('un periodo non valido arrivato a runtime torna a 14', async () => {
    const { period } = await loadAnalysisPage(new MemoryRepo(), NOW, 21 as unknown as 14);
    expect(period).toBe(14);
  });
});
