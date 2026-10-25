import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InsightsResult } from '../../src/server/insights';
import { MemoryRepo } from '../../src/server/memory-repo';

const loadInsights = vi.fn<(...args: unknown[]) => Promise<InsightsResult>>();
vi.mock('@/server/insights', () => ({ loadInsights: (...args: unknown[]) => loadInsights(...args) }));

import { InsightsSection, updatedLabelOf } from '../../src/app/grafici/InsightsSection';

const NOW = new Date('2026-10-24T08:30:00+02:00');
const repo = new MemoryRepo();

async function renderSection(): Promise<string> {
  const element = (await InsightsSection({ repo, now: NOW })) as ReactElement | null;
  return element === null ? '' : renderToStaticMarkup(element);
}

const RESULT: InsightsResult = {
  source: 'rules',
  updatedAt: '2026-10-24T06:30:00.000Z',
  nightsUsed: 22,
  items: [
    { title: 'Il tuo orario è stabile.', body: 'Negli ultimi giorni letto e sveglia restano vicini alla mediana.' },
    { title: 'Un debito piccolo, facile da chiudere.', body: 'Questa settimana mancano circa 40 minuti.' },
  ],
};

beforeEach(() => {
  loadInsights.mockReset();
});

describe('InsightsSection', () => {
  it('una InsightCard per ogni item, con badge Regole e orario in Europe/Rome', async () => {
    loadInsights.mockResolvedValue(RESULT);
    const html = await renderSection();
    expect(html.match(/<article /g)).toHaveLength(2);
    expect(html.match(/badge-rules/g)).toHaveLength(2);
    expect(html).not.toContain('badge-ai');
    expect(html).toContain('Il tuo orario è stabile.');
    // 06:30 UTC = 08:30 a Roma (ora legale)
    expect(html).toContain('aggiornato alle 08:30');
    expect(html).toMatch(/Calcolata su <strong>22 su 30 notti<\/strong>/);
    expect(html).not.toMatch(/NaN|undefined/);
    expect(loadInsights).toHaveBeenCalledWith(repo, NOW);
  });

  it('origine AI: badge AI', async () => {
    loadInsights.mockResolvedValue({ ...RESULT, source: 'ai' });
    const html = await renderSection();
    expect(html.match(/badge-ai/g)).toHaveLength(2);
    expect(html).not.toContain('badge-rules');
  });

  it('copertura limitata a 30 notti', async () => {
    loadInsights.mockResolvedValue({ ...RESULT, nightsUsed: 45 });
    expect(await renderSection()).toMatch(/<strong>30 su 30 notti<\/strong>/);
  });

  it('nessun item: frase calma, nessuna card', async () => {
    loadInsights.mockResolvedValue({ ...RESULT, items: [] });
    const html = await renderSection();
    expect(html).not.toContain('<article');
    expect(html).toContain('Per ora non ho indizi da mostrarti.');
  });

  it('se loadInsights lancia: non mostra niente', async () => {
    loadInsights.mockRejectedValue(new Error('gateway giù'));
    expect(await renderSection()).toBe('');
  });

  it('updatedLabelOf: orario valido o frase generica', () => {
    expect(updatedLabelOf('2026-10-24T06:30:00.000Z')).toBe('aggiornato alle 08:30');
    expect(updatedLabelOf('non una data')).toBe('aggiornato di recente');
  });
});
