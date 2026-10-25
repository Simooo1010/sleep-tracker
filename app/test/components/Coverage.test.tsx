import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Coverage, safeCount, thresholdSentence } from '../../src/components/Coverage';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe('Coverage', () => {
  it('mostra la frase con i numeri e un segno per notte', () => {
    const html = renderToStaticMarkup(<Coverage used={12} total={14} estimated={1} />);
    expect(html).toContain('class="coverage');
    expect(text(html)).toContain('Calcolata su 12 su 14 notti');
    expect(html).toContain('<strong>12 su 14 notti</strong>');
    expect(html.match(/<i/g)).toHaveLength(14);
    expect(html.match(/class="est"/g)).toHaveLength(1);
    expect(html.match(/class="miss"/g)).toHaveLength(2);
    expect(html).toContain('data-state="calcolata"');
  });

  it('descrive la composizione con parole per i lettori di schermo', () => {
    const html = renderToStaticMarkup(<Coverage used={12} total={14} estimated={1} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Notti: 11 confermate o automatiche, 1 stimata, 2 mancanti"');
  });

  it('rispetta l’ordine reale dei segni', () => {
    const html = renderToStaticMarkup(<Coverage used={0} total={0} marks={['mancante', 'confermata', 'stimata']} />);
    expect(html).toMatch(/<i class="miss"><\/i><i><\/i><i class="est"><\/i>/);
    expect(text(html)).toContain('Calcolata su 2 su 3 notti');
  });

  it('sotto soglia scrive quante notti servono, senza il numero calcolato', () => {
    const html = renderToStaticMarkup(<Coverage used={9} total={14} minNights={14} />);
    expect(text(html)).toContain('Servono almeno 14 notti. Per ora ne hai 9.');
    expect(text(html)).not.toContain('Calcolata su');
    expect(html).toContain('data-state="sotto-soglia"');
    expect(html.match(/<i/g)).toHaveLength(14);
  });

  it('accetta un prefisso diverso per le previsioni', () => {
    const html = renderToStaticMarkup(<Coverage used={1} total={1} prefix="Stima su" />);
    expect(text(html)).toContain('Stima su 1 su 1 notte');
  });

  it('non mostra mai NaN o undefined con numeri non validi', () => {
    const html = renderToStaticMarkup(<Coverage used={Number.NaN} total={Number.POSITIVE_INFINITY} estimated={-3} />);
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
    expect(text(html)).toContain('Calcolata su 0 su 0 notti');
  });

  it('limita le notti usate al totale', () => {
    const html = renderToStaticMarkup(<Coverage used={20} total={14} estimated={30} />);
    expect(text(html)).toContain('14 su 14 notti');
    expect(html.match(/class="est"/g)).toHaveLength(14);
  });

  it('helper', () => {
    expect(safeCount(Number.NaN)).toBe(0);
    expect(safeCount(3.6)).toBe(4);
    expect(thresholdSentence(1, 0)).toBe('Servono almeno 1 notte. Per ora ne hai 0.');
  });
});
