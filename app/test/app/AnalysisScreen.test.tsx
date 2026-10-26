import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AnalysisScreen, forecastScoreText, periodLabel } from '../../src/app/analisi/AnalysisScreen';
import { MemoryRepo } from '../../src/server/memory-repo';
import { loadAnalysisPage } from '../../src/server/pages/analysis';
import { DEMO_NOW, buildDemoSeed } from '../../src/server/seed';
import type { AnalysisPeriod, AnalysisView } from '../../src/server/views/analysis-types';

const NOW = new Date(DEMO_NOW);
const NARRATIVE = <p>Slot racconto di prova</p>;

async function viewOf(seed = buildDemoSeed(DEMO_NOW), period: AnalysisPeriod = 14): Promise<AnalysisView> {
  return (await loadAnalysisPage(new MemoryRepo(seed), NOW, period)).view;
}

const render = (view: AnalysisView) => renderToStaticMarkup(<AnalysisScreen view={view} narrative={NARRATIVE} />);
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
const periodLinks = (html: string) => html.match(/<a [^>]*href="\?periodo=\d+"[^>]*>[^<]*<\/a>/g) ?? [];

describe('AnalysisScreen con il dataset demo', () => {
  it('un solo h1 "Analisi", nessun <main>, sezioni h2 nell’ordine previsto', async () => {
    const html = render(await viewOf());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Analisi<\/h1>/);
    expect(html).not.toContain('<main');
    const titles = ['Le tue notti', 'Perché', 'Cosa cambiare', 'Domani', 'Il racconto', 'Su quali dati'];
    const pos = titles.map((t) => html.search(new RegExp(`<h2[^>]*>${t}</h2>`)));
    expect(pos.every((i) => i >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(html).toContain('Slot racconto di prova');
  });

  it('scena e frase di sintesi prima del punteggio, punteggio prima del selettore', async () => {
    const view = await viewOf();
    const t = text(render(view));
    const headline = t.indexOf(view.headline);
    const score = t.indexOf(view.score.word);
    const periods = t.indexOf('7 notti 14 notti 30 notti');
    const nights = t.indexOf('Le tue notti');
    expect(headline).toBeGreaterThan(0);
    expect(headline).toBeLessThan(score);
    expect(score).toBeLessThan(periods);
    expect(periods).toBeLessThan(nights);
  });

  it('nessun pulsante pieno e nessun modulo: pagina di sola lettura', async () => {
    const html = render(await viewOf());
    expect(html).not.toContain('btn-primary');
    expect(html).not.toMatch(/<input|<form|<textarea|<button/);
  });

  it('selettore del periodo: tre link, solo quello scelto con aria-current', async () => {
    for (const p of [7, 14, 30] as const) {
      const html = render(await viewOf(undefined, p));
      const links = periodLinks(html);
      expect(links).toHaveLength(3);
      expect(links.map((l) => text(l).trim())).toEqual(['7 notti', '14 notti', '30 notti']);
      const current = links.filter((l) => l.includes('aria-current="page"'));
      expect(current).toHaveLength(1);
      expect(current[0]).toContain(`href="?periodo=${p}"`);
    }
  });

  it('testi senza NaN, undefined, null, Infinity o punti esclamativi', async () => {
    for (const p of [7, 14, 30] as const) {
      const t = text(render(await viewOf(undefined, p)));
      expect(t).not.toMatch(/NaN|undefined|\bnull\b|Infinity|\[object/);
      expect(t).not.toContain('!');
    }
  });

  it('mostra cause, azioni numerate e copertura', async () => {
    const view = await viewOf();
    const html = render(view);
    for (const c of view.causes.items) expect(text(html)).toContain(c.title);
    for (const a of view.actions) expect(text(html)).toContain(a.title);
    expect(html).toMatch(/Calcolata su <strong>\d+ su \d+ notti<\/strong>/);
    expect(text(html)).toContain('Tratteggiato: stimata');
  });

  it('ogni blocco ha l’entrata scaglionata (animazione gestita dal CSS)', async () => {
    const html = render(await viewOf());
    expect(html.match(/--enter-i:\d+/g)?.length).toBeGreaterThanOrEqual(8);
  });
});

describe('AnalysisScreen sotto soglia e vuota', () => {
  it('sezioni nascoste: frasi calme al posto dei numeri', async () => {
    const base = await viewOf();
    const view: AnalysisView = {
      ...base,
      causes: { hidden: true, hiddenText: 'Servono almeno 14 notti. Per ora ne hai 5.', items: [] },
      forecast: { hidden: true, hiddenText: 'Servono almeno 3 notti con energia. Per ora ne hai 1.', score: null, label: '', explanation: '' },
    };
    const html = render(view);
    const t = text(html);
    expect(t).toContain('Servono almeno 14 notti. Per ora ne hai 5.');
    expect(t).toContain('Servono almeno 3 notti con energia. Per ora ne hai 1.');
    expect(html).toMatch(/data-state="sotto-soglia"/);
    expect(t).not.toMatch(/\d,\d su 5/);
    expect(t).not.toMatch(/NaN|undefined|\bnull\b/);
  });

  it('pochi dati reali: nessun testo rotto', async () => {
    const seed = buildDemoSeed(DEMO_NOW);
    const view = await viewOf({ ...seed, nights: (seed.nights ?? []).slice(-3), checks: [], naps: [] }, 7);
    const t = text(render(view));
    expect(t).not.toMatch(/NaN|undefined|\bnull\b|Infinity/);
  });

  it('nessuna notte: stato vuoto calmo con il selettore, un solo h1', async () => {
    const view = await viewOf({});
    expect(view.empty).toBe(true);
    const html = render(view);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(text(html)).toContain(view.emptyText);
    expect(html).toMatch(/data-state="vuoto"/);
    expect(html).toMatch(/role="status"/);
    expect(periodLinks(html)).toHaveLength(3);
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('btn-primary');
    expect(text(html)).not.toMatch(/NaN|undefined|\bnull\b/);
  });
});

describe('helper', () => {
  it('periodLabel e forecastScoreText', () => {
    expect(periodLabel(7)).toBe('7 notti');
    expect(forecastScoreText(2.64)).toBe('2,6 su 5');
    expect(forecastScoreText(9)).toBe('5,0 su 5');
    expect(forecastScoreText(null)).toBeNull();
    expect(forecastScoreText(Number.NaN)).toBeNull();
  });
});
