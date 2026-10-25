import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CorrelationTable,
  MINUS,
  correlationTone,
  formatDiff,
  occurrencesLabel,
  type CorrelationRow,
} from '../../src/components/CorrelationTable';

describe('formatDiff', () => {
  it('segno sempre scritto, virgola decimale, meno U+2212', () => {
    expect(formatDiff(0.6)).toBe('+0,6');
    expect(formatDiff(-0.8)).toBe('−0,8');
    expect(formatDiff(-0.8).charCodeAt(0)).toBe(0x2212);
    expect(formatDiff(1.24)).toBe('+1,2');
    expect(formatDiff(-1.25)).toBe('−1,3');
    expect(formatDiff(0.25)).toBe('+0,3');
  });

  it('zero senza segno e mai "−0,0"', () => {
    expect(formatDiff(0)).toBe('0,0');
    expect(formatDiff(-0.04)).toBe('0,0');
    expect(formatDiff(0.04)).toBe('0,0');
  });

  it('nessun trattino ASCII', () => {
    expect(formatDiff(-0.3)).not.toContain('-');
  });
});

describe('correlationTone', () => {
  it('soglie ±0,3 incluse', () => {
    expect(correlationTone(0.3)).toBe('pos');
    expect(correlationTone(0.29)).toBe('pos'); // mostrato "+0,3"
    expect(correlationTone(0.24)).toBe('neu');
    expect(correlationTone(-0.3)).toBe('neg');
    expect(correlationTone(-0.2)).toBe('neu');
    expect(correlationTone(0)).toBe('neu');
    expect(correlationTone(null)).toBe('few');
    expect(correlationTone(Number.NaN)).toBe('few');
  });

  it('robusto agli errori in virgola mobile', () => {
    expect(correlationTone(0.1 + 0.2)).toBe('pos');
    expect(correlationTone(-(0.1 + 0.2))).toBe('neg');
  });
});

describe('occurrencesLabel', () => {
  it('"N notti su M" oppure "ne servono 5"', () => {
    expect(occurrencesLabel(8, 21)).toBe('8 notti su 21');
    expect(occurrencesLabel(5, 21)).toBe('5 notti su 21');
    expect(occurrencesLabel(4, 21)).toBe('4 notti, ne servono 5');
    expect(occurrencesLabel(1, 21)).toBe('1 notte, ne servono 5');
  });
});

const rows: CorrelationRow[] = [
  { factor: 'Schermo a letto', occurrences: 8, quality: -0.8, energy: -0.4, mood: -0.3 },
  { factor: 'Sport', occurrences: 9, quality: 0.7, energy: 0.9, mood: 0.4 },
  { factor: 'Cena tardi', occurrences: 5, quality: -0.1, energy: 0, mood: 0.1 },
  { factor: 'Alcol', occurrences: 2, quality: 0.9, energy: -1, mood: 0.5 },
];

describe('CorrelationTable', () => {
  const html = renderToStaticMarkup(<CorrelationTable rows={rows} nights={21} />);

  it('celle con segno, numero e tono del design system', () => {
    expect(html).toContain(`>${MINUS}0,8<`);
    expect(html).toContain('>+0,9<');
    expect(html).toContain('>0,0<');
    expect(html).toContain('class="c neg"');
    expect(html).toContain('class="c pos"');
    expect(html).toContain('class="c neu"');
  });

  it('fattore sotto 5 occorrenze: grigio con "—" e "ne servono 5", valori nascosti', () => {
    expect(html).toContain('2 notti, ne servono 5');
    expect(html.match(/class="c few"/g)).toHaveLength(3);
    expect(html).not.toContain('>+0,5<');
  });

  it('copertura per fattore e nota senza linguaggio causale', () => {
    expect(html).toContain('8 notti su 21');
    expect(html).toContain('Sono indizi, non cause.');
    expect(html).not.toMatch(/causa |provoca|colpa/i);
  });

  it('struttura accessibile e scorrimento orizzontale', () => {
    expect(html).toContain('role="table"');
    expect(html.match(/role="columnheader"/g)).toHaveLength(4);
    expect(html.match(/role="rowheader"/g)).toHaveLength(4);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Qualità');
    expect(html).toContain('Energia');
    expect(html).toContain('Umore');
  });

  it('sotto 14 notti non mostra la tabella e dice quante ne mancano', () => {
    const h = renderToStaticMarkup(<CorrelationTable rows={rows} nights={13} />);
    expect(h).not.toContain('role="table"');
    expect(h).toContain('Servono almeno 14 notti. Per ora ne hai 13.');
    expect(renderToStaticMarkup(<CorrelationTable rows={rows} nights={14} />)).toContain('role="table"');
  });
});
