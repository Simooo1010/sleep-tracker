import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MISSING_TIME_TEXT, TimeInput, suggestedLabel } from '../../src/components/TimeInput';

const noop = () => {};

describe('TimeInput', () => {
  it('campo orario nativo a 24 ore, passo di un minuto, con etichetta collegata', () => {
    const html = renderToStaticMarkup(<TimeInput label="Sono andato a letto" value="23:48" onChange={noop} />);
    expect(html).toContain('type="time"');
    expect(html).toContain('step="60"');
    expect(html).toContain('value="23:48"');
    const id = /<input[^>]*id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<label for="${id}"`);
    expect(html).toContain('>Sono andato a letto</label>');
    expect(html).not.toContain(MISSING_TIME_TEXT);
    expect(html).not.toContain('aria-describedby');
    expect(html).not.toMatch(/NaN|undefined|null/);
  });

  it('valore mancante: campo vuoto, parola `Mancante` collegata con aria-describedby', () => {
    const html = renderToStaticMarkup(<TimeInput label="Mi sono svegliato" value={null} onChange={noop} />);
    expect(html).toContain('value=""');
    expect(html).toContain('>Mancante</p>');
    const missingId = /<p id="([^"]+)"[^>]*>Mancante/.exec(html)?.[1];
    expect(missingId).toBeTruthy();
    expect(html).toContain(`aria-describedby="${missingId}"`);
    expect(html).not.toContain('<button');
  });

  it('con suggerimento e valore mancante: pulsante secondario `Usa 23:30`', () => {
    const html = renderToStaticMarkup(
      <TimeInput label="Letto" value={null} onChange={noop} suggested="23:30" />,
    );
    expect(suggestedLabel('23:30')).toBe('Usa 23:30');
    expect(html).toContain('>Usa 23:30</button>');
    expect(html).toContain('btn-secondary');
    expect(html).not.toContain('btn-primary');
  });

  it('con un valore il suggerimento non compare', () => {
    const html = renderToStaticMarkup(
      <TimeInput label="Letto" value="00:10" onChange={noop} suggested="23:30" />,
    );
    expect(html).not.toContain('Usa 23:30');
    expect(html).not.toContain('Mancante');
  });

  it('suggerimento non valido: nessun pulsante', () => {
    const html = renderToStaticMarkup(<TimeInput label="Letto" value={null} onChange={noop} suggested="25:99" />);
    expect(html).not.toContain('<button');
  });

  it('hint e disabled sono collegati al campo', () => {
    const html = renderToStaticMarkup(
      <TimeInput label="Letto" value="23:00" onChange={noop} hint="Ora locale" disabled />,
    );
    expect(html).toContain('>Ora locale</p>');
    expect(html).toMatch(/aria-describedby="[^"]*-hint"/);
    expect(html).toContain('disabled=""');
  });
});
