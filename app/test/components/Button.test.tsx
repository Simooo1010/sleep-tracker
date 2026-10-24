import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Button } from '../../src/components/Button';

const noJunk = (html: string) => expect(html).not.toMatch(/NaN|undefined|null|!/);

describe('Button', () => {
  it('di base è secondario, type="button" e testo italiano', () => {
    const html = renderToStaticMarkup(<Button>Indietro</Button>);
    expect(html).toBe('<button type="button" class="btn btn-secondary">Indietro</button>');
    noJunk(html);
  });

  it.each([
    ['primary', 'btn-primary', 'Conferma'],
    ['soft', 'btn-soft', 'Avanti'],
    ['secondary', 'btn-secondary', 'Indietro'],
    ['ghost', 'btn-ghost', 'Correggi orari'],
  ] as const)('variante %s usa la classe %s', (variant, cls, label) => {
    const html = renderToStaticMarkup(<Button variant={variant}>{label}</Button>);
    expect(html).toContain(`class="btn ${cls}"`);
    expect(html).toContain(`>${label}<`);
    noJunk(html);
  });

  it('pulsante finale grande a larghezza piena', () => {
    const html = renderToStaticMarkup(
      <Button variant="primary" size="lg" block>
        Vado a dormire
      </Button>,
    );
    expect(html).toContain('class="btn btn-primary btn-lg btn-block"');
    expect(html).toContain('Vado a dormire');
  });

  it('pulsante tondo: aria-label obbligatorio e segno nascosto ai lettori', () => {
    const html = renderToStaticMarkup(
      <Button variant="round" aria-label="Anticipa di 5 minuti">
        −
      </Button>,
    );
    expect(html).toContain('class="btn btn-round"');
    expect(html).toContain('aria-label="Anticipa di 5 minuti"');
    expect(html).toContain('<span aria-hidden="true">−</span>');
    noJunk(html);
  });

  it('disabilitato con attributo nativo', () => {
    const html = renderToStaticMarkup(<Button disabled>Registrata</Button>);
    expect(html).toContain('disabled=""');
    expect(html).toContain('Registrata');
  });

  it('rispetta type e className passati', () => {
    const html = renderToStaticMarkup(
      <Button variant="primary" type="submit" className="extra">
        Conferma
      </Button>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain('class="btn btn-primary extra"');
  });
});
