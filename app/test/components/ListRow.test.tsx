import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ListRow } from '../../src/components/ListRow';

const clean = (html: string) => expect(html).not.toMatch(/NaN|undefined|\bnull\b|!/);

describe('ListRow', () => {
  it('pulsante con puntino, titolo, sintesi e chevron decorativi', () => {
    const html = renderToStaticMarkup(<ListRow title="Deriva della media" summary="+42 min in 5 settimane" accent="peach" onOpen={() => {}} />);
    expect(html).toMatch(/^<button type="button" class="list-row [^"]+">/);
    expect(html).toMatch(/<span class="dot [^"]*peach[^"]*" aria-hidden="true"><\/span>/);
    expect(html).toContain('<span class="tx"><span class="tt">Deriva della media</span><span class="ss">+42 min in 5 settimane</span></span>');
    expect(html).toContain('<svg class="');
    expect(html).toContain('viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"></path></svg>');
    clean(html);
  });

  it('link quando c’è href, accento predefinito blu', () => {
    const html = renderToStaticMarkup(<ListRow title="Confronto tra notti" summary="14 notti" href="#confronto" />);
    expect(html).toMatch(/^<a class="list-row [^"]+" href="#confronto">/);
    expect(html).toMatch(/class="dot [^"]*blue/);
    expect(html).not.toContain('<button');
    clean(html);
  });

  it('senza sintesi: nessuna riga vuota', () => {
    const html = renderToStaticMarkup(<ListRow title="Sonnellino" summary="" accent="yellow" />);
    expect(html).not.toContain('class="ss"');
    expect(html).toMatch(/class="dot [^"]*yellow/);
    clean(html);
  });
});
