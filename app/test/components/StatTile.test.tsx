import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StatTile } from '../../src/components/StatTile';

const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('StatTile', () => {
  it('mostra etichetta, valore, nota e la classe dell’accento', () => {
    const html = renderToStaticMarkup(<StatTile label="Durata media" value="7h 18m" note="14 notti" tone="blue" />);
    expect(html).toContain('class="tile tile-blue"');
    expect(html).toContain('<div class="k">Durata media</div>');
    expect(html).toContain('<div class="v">7h 18m</div>');
    expect(html).toContain('<div class="n">14 notti</div>');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Durata media"');
    expect(html).toContain('data-state="calcolata"');
  });

  it.each(['blue', 'sage', 'peach', 'yellow'] as const)('variante %s', (tone) => {
    const html = renderToStaticMarkup(<StatTile label="Regolarità" value="± 24 min" tone={tone} />);
    expect(html).toContain(`tile-${tone}`);
  });

  it('mostra la copertura sotto il valore', () => {
    const html = renderToStaticMarkup(
      <StatTile label="Regolarità" value="± 24 min" tone="sage" coverage={{ used: 9, total: 14, estimated: 2 }} />,
    );
    expect(text(html)).toContain('Calcolata su 9 su 14 notti');
    expect(html).toContain('class="coverage');
    expect(html.match(/<i/g)).toHaveLength(14);
  });

  it('sotto soglia nasconde il valore e scrive quante notti servono', () => {
    const html = renderToStaticMarkup(
      <StatTile label="Regolarità" value="± 24 min" note="9 notti su 14" tone="sage" coverage={{ used: 9, total: 14 }} minNights={14} />,
    );
    expect(text(html)).toContain('Servono almeno 14 notti. Per ora ne hai 9.');
    expect(html).not.toContain('± 24 min');
    expect(html).not.toContain('class="v"');
    expect(html).toContain('data-state="sotto-soglia"');
  });

  it('valore mancante: parola Mancante, mai zero', () => {
    const html = renderToStaticMarkup(<StatTile label="Debito" value={null} tone="peach" />);
    expect(html).toContain('badge badge-missing');
    expect(text(html)).toContain('Mancante');
    expect(html).not.toContain('class="v"');
    expect(html).toContain('data-state="mancante"');
  });

  it('valore stimato: badge Stimato con la parola', () => {
    const html = renderToStaticMarkup(<StatTile label="Sonno 24 ore" value="7h 49m" tone="yellow" provenance="stimato" />);
    expect(html).toContain('badge badge-estimated');
    expect(text(html)).toContain('Stimato');
    expect(html).toContain('<div class="v">7h 49m</div>');
    expect(html).toContain('data-state="stimato"');
  });

  it('provenienza automatica e confermata scritte come parola', () => {
    expect(renderToStaticMarkup(<StatTile label="A" value="1h" tone="blue" provenance="automatico" />)).toContain(
      '>Automatico<',
    );
    expect(renderToStaticMarkup(<StatTile label="A" value="1h" tone="blue" provenance="confermato" />)).toContain(
      '>Confermato<',
    );
  });

  it('non mostra mai NaN o undefined', () => {
    const html = renderToStaticMarkup(
      <StatTile
        label="Punto medio"
        value="NaNh undefinedm"
        note="undefined"
        tone="blue"
        coverage={{ used: Number.NaN, total: 14 }}
      />,
    );
    expect(html).not.toMatch(/NaN|undefined/);
    expect(text(html)).toContain('Mancante');
    expect(text(html)).toContain('Calcolata su 0 su 14 notti');
  });
});
