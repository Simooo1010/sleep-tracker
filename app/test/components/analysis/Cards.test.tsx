import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ActionCard, CauseCard, impactLevel } from '../../../src/components/analysis';
import { action, cause, text } from './fixtures';

describe('CauseCard', () => {
  it('titolo, spiegazione ed evidenza scritti, accento come sfondo soft', () => {
    const html = renderToStaticMarkup(<CauseCard cause={cause} />);
    expect(html).toMatch(/<article class="card [^"]*" aria-labelledby="cause-schermi"/);
    expect(html).toContain('id="cause-schermi"');
    const t = text(html);
    expect(t).toContain('Indizio');
    expect(t).toContain(cause.title);
    expect(t).toContain(cause.body);
    expect(t).toContain(cause.evidence);
    expect(html).toContain('data-tone="peach"');
    expect(html).not.toMatch(/<button|NaN|undefined/);
  });
});

describe('ActionCard', () => {
  it('numero d’ordine, Perché, Effetto atteso, impatto con pallini e parola', () => {
    const html = renderToStaticMarkup(<ActionCard action={action} index={2} />);
    const t = text(html);
    expect(t).toContain('Azione 2:');
    expect(t).toContain(action.title);
    expect(t).toContain('Perché');
    expect(t).toContain(action.why);
    expect(t).toContain('Effetto atteso');
    expect(t).toContain(action.expected);
    expect(t).toContain('Impatto medio');
    expect(html).toContain('data-impact="2"');
    expect(html.match(/class="[^"]*pip[^"]*"/g)).toHaveLength(3);
    expect(html.match(/class="[^"]*pip[^"]*on[^"]*"/g)).toHaveLength(2);
    expect(html).not.toMatch(/<button|NaN|undefined/);
  });

  it('dati sporchi: nessun NaN/undefined, impatto e parola di riserva', () => {
    const html = renderToStaticMarkup(
      <ActionCard action={{ ...action, impactLabel: 'undefined', impact: 7 as 1 }} index={Number.NaN} />,
    );
    expect(html).not.toMatch(/NaN|undefined/);
    expect(text(html)).toContain('Piccolo');
    expect(impactLevel(3)).toBe(3);
  });
});
