import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Cover } from '../../src/components/Cover';

const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('Cover', () => {
  const html = renderToStaticMarkup(<Cover />);

  it('ha il nome come titolo e la frase del marchio', () => {
    expect(html).toMatch(/<h1 [^>]*>Sleep<br\/>Tracker<\/h1>/);
    expect(text(html)).toContain('Stima da sola. Chiede solo una conferma.');
  });

  it('disegna quattro blocchi e cinque fasi lunari in SVG decorativo', () => {
    expect(html).toContain('viewBox="0 0 960 340"');
    expect(html).toMatch(/<svg [^>]*aria-hidden="true"/);
    expect(html.match(/<rect /g)).toHaveLength(4);
    expect(html.match(/<circle /g)).toHaveLength(5);
    expect(html.match(/<path /g)).toHaveLength(4);
    expect(html).not.toMatch(/<img|\.png/);
  });

  it('accetta frase e livello del titolo, senza NaN né undefined', () => {
    const other = renderToStaticMarkup(<Cover tagline="" headingLevel={2} />);
    expect(other).toContain('<h2 ');
    expect(other).not.toMatch(/<p[ >]/);
    expect(html + other).not.toMatch(/NaN|undefined|null/);
  });
});
