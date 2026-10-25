import { describe, expect, it } from 'vitest';

import { MemoryRepo } from '../../../src/server/memory-repo';
import { loadRegularityPage, REGULARITY_HISTORY_DAYS } from '../../../src/server/pages/regularity';
import { buildDemoSeed, DEMO_NOW } from '../../../src/server/seed';
import type { Repo } from '../../../src/server/types';

const NOW = new Date(DEMO_NOW);

describe('loadRegularityPage con il dataset demo', () => {
  const repo = new MemoryRepo(buildDemoSeed(DEMO_NOW));

  it('oggi è sabato 24 ottobre 2026 (Europe/Rome) e la vista non è vuota', async () => {
    const { today, view } = await loadRegularityPage(repo, NOW);
    expect(today).toBe('2026-10-24');
    expect(view.empty).toBe(false);
    expect(view.emptyText).toBeNull();
    expect(view.title).toBe('Regolarità');
    expect(view.rows).toHaveLength(15);
    expect(view.rows[14]).toMatchObject({ isToday: true, dayLabel: 'Oggi', nightDate: '2026-10-24' });
    expect(view.rows.filter((r) => r.bar !== null).length).toBeGreaterThan(8);
    expect(view.baseline.hidden).toBe(false);
    expect(view.bands).not.toBeNull();
  });

  it('la deriva del letto è presente, con badge "+… min in … settimane"', async () => {
    const { view } = await loadRegularityPage(repo, NOW);
    expect(view.drift.hidden).toBe(false);
    expect(view.drift.bars).toHaveLength(6);
    expect(view.drift.badge).toMatch(/^\+\d+ min in \d+ settimane$/);
    expect(view.headline.driftChip).toBe(`Deriva ${view.drift.badge}`);
  });

  it('copertura coerente: finestra di 14 notti, segni e conteggi concordano', async () => {
    const { view } = await loadRegularityPage(repo, NOW);
    for (const c of [view.headline.coverage, view.baseline.coverage]) {
      expect(c.window).toBe(14);
      expect(c.used).toBeGreaterThan(0);
      expect(c.used).toBeLessThanOrEqual(14);
      expect(c.shortText).toBe(`${c.used} su 14 notti`);
    }
    expect(view.headline.coverage.marks).toHaveLength(14);
    const nonMissing = view.headline.coverage.marks.filter((m) => m !== 'mancante').length;
    expect(nonMissing).toBe(view.headline.coverage.used);
    expect(view.headline.big).toMatch(/^\d+ su \d+$/);
    expect(view.tiles).toHaveLength(5);
  });

  it('interroga il repo con la finestra [oggi − 60 giorni, oggi]', async () => {
    const calls: Array<[string, string]> = [];
    const spy = {
      listNights: async (from: string, to: string) => {
        calls.push([from, to]);
        return [];
      },
    } as unknown as Repo;
    const { view } = await loadRegularityPage(spy, NOW);
    expect(REGULARITY_HISTORY_DAYS).toBe(60);
    expect(calls).toEqual([['2026-08-25', '2026-10-24']]);
    expect(view.empty).toBe(true);
  });

  it('un errore del repo risale al chiamante (la pagina mostra il messaggio calmo)', async () => {
    const broken = {
      listNights: async () => {
        throw new Error('db giù');
      },
    } as unknown as Repo;
    await expect(loadRegularityPage(broken, NOW)).rejects.toThrow('db giù');
  });
});
