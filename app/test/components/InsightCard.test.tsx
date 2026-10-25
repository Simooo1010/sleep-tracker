import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { InsightCard } from '../../src/components/InsightCard';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

const base = {
  title: 'Gli schermi a letto spostano la notte',
  body: 'Nelle 8 sere con schermo a letto ti sei addormentato in media 31 minuti più tardi.',
  updatedLabel: 'Stamattina',
};

describe('InsightCard', () => {
  it('insight AI: badge, aggiornamento, titolo e corpo', () => {
    const html = renderToStaticMarkup(<InsightCard {...base} origin="ai" />);
    expect(html).toMatch(/^<article class="card stack /);
    expect(html).toContain('<span class="badge badge-ai">AI</span>');
    expect(html).toContain('<span class="caption muted">Stamattina</span>');
    expect(html).toMatch(/<h3 id="[^"]+" class="serif title [^"]*">Gli schermi a letto spostano la notte<\/h3>/);
    expect(html).toContain('class="body-sm muted');
    expect(text(html)).toContain('31 minuti più tardi');
    expect(html).toContain('data-state="visibile"');
  });

  it('insight a regole: badge Regole', () => {
    const html = renderToStaticMarkup(<InsightCard {...base} origin="regole" updatedLabel="Ogni lunedì" />);
    expect(html).toContain('<span class="badge badge-rules">Regole</span>');
    expect(text(html)).toContain('Ogni lunedì');
    expect(html).toContain('data-origin="regole"');
  });

  it('collega l’articolo al titolo con aria-labelledby', () => {
    const html = renderToStaticMarkup(<InsightCard {...base} origin="ai" />);
    const labelled = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelled).toBeTruthy();
    expect(html).toContain(`<h3 id="${labelled}"`);
  });

  it('usa <time> quando c’è l’istante di aggiornamento', () => {
    const html = renderToStaticMarkup(
      <InsightCard {...base} origin="ai" updatedLabel="Aggiornato ieri" updatedAt="2026-10-24T07:00:00Z" />,
    );
    expect(html).toContain('<time class="caption muted" dateTime="2026-10-24T07:00:00Z">Aggiornato ieri</time>');
  });

  it('livello del titolo configurabile', () => {
    const html = renderToStaticMarkup(<InsightCard {...base} origin="ai" headingLevel={2} />);
    expect(html).toContain('<h2 ');
  });

  it('mostra la copertura dentro la scheda', () => {
    const html = renderToStaticMarkup(<InsightCard {...base} origin="regole" coverage={{ used: 12, total: 14 }} />);
    expect(text(html)).toContain('Calcolata su 12 su 14 notti');
  });

  it('sotto soglia: Dati insufficienti e quante notti mancano, nessun insight', () => {
    const html = renderToStaticMarkup(
      <InsightCard {...base} origin="ai" coverage={{ used: 2, total: 14 }} minNights={5} />,
    );
    expect(text(html)).toContain('Dati insufficienti');
    expect(text(html)).toContain('Servono almeno 5 notti. Per ora ne hai 2.');
    expect(html).not.toContain(base.title);
    expect(html).not.toContain('31 minuti');
    expect(html).toContain('data-state="insufficiente"');
    expect(html).toContain('badge-ai');
  });

  it('non mostra mai NaN o undefined', () => {
    const html = renderToStaticMarkup(
      <InsightCard title="Media di NaN minuti" body="undefined" origin="regole" updatedLabel="undefined" />,
    );
    expect(html).not.toMatch(/NaN|undefined/);
    expect(text(html)).toContain('Dati insufficienti');
  });

  it('niente punti esclamativi', () => {
    const html = renderToStaticMarkup(
      <InsightCard {...base} origin="ai" coverage={{ used: 2, total: 14 }} minNights={5} />,
    );
    expect(text(html)).not.toContain('!');
  });
});
