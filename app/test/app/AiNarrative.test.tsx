import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiNarrative } from '../../src/app/analisi/AiNarrative';
import type { GatewayInsightsRequest } from '../../src/server/insights';
import { MemoryRepo } from '../../src/server/memory-repo';
import { DEMO_NOW, buildDemoSeed } from '../../src/server/seed';
import type { AnalysisPeriod } from '../../src/server/views/analysis-types';

const NOW = new Date(DEMO_NOW);
const SECRET = 'bearer-narrativa-1234567890-segreto';

const GOOD_BODY = {
  summary: 'ok',
  insights: [
    { category: 'regularity', severity: 'info', title: 'Racconto dal gateway', body: 'Le tue notti sono state abbastanza regolari.', confidence: 'medium' },
    { category: 'debt', severity: 'positive', title: 'Secondo indizio', body: 'Il debito è piccolo.', confidence: 'high' },
  ],
  source: 'ai',
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function render(repo: MemoryRepo, period: AnalysisPeriod): Promise<string> {
  const element = (await AiNarrative({ repo, now: NOW, period })) as ReactElement | null;
  return element === null ? '' : renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.stubEnv('GATEWAY_URL', '');
  vi.stubEnv('GATEWAY_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AiNarrative', () => {
  it('con gateway configurato: card con badge AI e finestra del periodo nel payload', async () => {
    vi.stubEnv('GATEWAY_URL', 'https://gateway.example.test');
    vi.stubEnv('GATEWAY_SECRET', SECRET);
    const fetchFn = vi.fn(async () => jsonResponse(GOOD_BODY));
    vi.stubGlobal('fetch', fetchFn);

    const html = await render(new MemoryRepo(buildDemoSeed(DEMO_NOW)), 14);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as GatewayInsightsRequest;
    expect(body.windowDays).toBe(14);
    expect(html.match(/<article /g)).toHaveLength(2);
    expect(html.match(/badge-ai/g)).toHaveLength(2);
    expect(html).not.toContain('badge-rules');
    expect(html).toContain('Racconto dal gateway');
    expect(html).toMatch(/su 14 notti/);
    expect(html).not.toContain(SECRET);
    expect(html).not.toMatch(/NaN|undefined/);
  });

  it('senza env: card con badge Regole, nessuna chiamata', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    const html = await render(new MemoryRepo(buildDemoSeed(DEMO_NOW)), 30);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(html).toContain('<article');
    expect(html).toContain('badge-rules');
    expect(html).not.toContain('badge-ai');
    expect(html).toMatch(/su 30 notti/);
  });

  it('periodo di 7 giorni: copertura su 7 notti', async () => {
    const html = await render(new MemoryRepo(buildDemoSeed(DEMO_NOW)), 7);
    expect(html).toContain('badge-rules');
    expect(html).toMatch(/su 7 notti/);
  });

  it('errore del repo: frase calma con role="status", nessuna eccezione', async () => {
    const repo = new MemoryRepo();
    vi.spyOn(repo, 'listNights').mockRejectedValue(new Error('db giù'));
    const html = await render(repo, 14);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<article');
    expect(html).not.toContain('db giù');
  });
});
