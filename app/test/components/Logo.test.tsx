import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Logo } from '../../src/components/Logo';

const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('Logo', () => {
  it('mostra il segno vettoriale su tessera bianca con testo alternativo', () => {
    const html = renderToStaticMarkup(<Logo />);
    expect(html).toContain('class="icon-tile');
    expect(html).toContain('src="/mark.svg"');
    expect(html).toContain('alt="Sleep Tracker"');
    expect(text(html)).toBe('');
    expect(html).not.toMatch(/\.png/);
  });

  it('con il nome il segno diventa decorativo e il nome è in serif', () => {
    const html = renderToStaticMarkup(<Logo withName size="lg" />);
    expect(html).toContain('alt=""');
    expect(html).toMatch(/<span class="serif [^"]*">Sleep Tracker<\/span>/);
    expect(text(html)).toBe('Sleep Tracker');
  });

  it('accetta tutte le misure senza NaN né undefined', () => {
    for (const size of ['sm', 'md', 'lg', 'xl'] as const) {
      const html = renderToStaticMarkup(<Logo size={size} className="extra" />);
      expect(html).not.toMatch(/NaN|undefined|null/);
      expect(html).toContain('extra');
    }
  });
});
