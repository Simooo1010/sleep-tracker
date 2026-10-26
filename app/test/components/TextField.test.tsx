import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TextField, clampText, countChars, countText } from '../../src/components/TextField';

const noop = () => {};

describe('TextField', () => {
  it('una riga: input con etichetta collegata, contatore e maxLength', () => {
    const html = renderToStaticMarkup(
      <TextField label="Altro imprevisto" value="Cena" onChange={noop} maxLength={30} />,
    );
    expect(html).toContain('<input');
    expect(html).toContain('type="text"');
    expect(html).toContain('maxLength="30"');
    const id = /<input[^>]*id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<label for="${id}"`);
    expect(html).toContain('>Altro imprevisto</label>');
    expect(html).toContain('>4 su 30<');
    expect(html).toMatch(/aria-describedby="[^"]*-count"/);
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toMatch(/NaN|undefined|null/);
  });

  it('più righe: textarea con il valore e il limite', () => {
    const html = renderToStaticMarkup(
      <TextField label="Descrivi" value="Giornata lunga" onChange={noop} maxLength={280} multiline rows={5} />,
    );
    expect(html).toContain('<textarea');
    expect(html).toContain('rows="5"');
    expect(html).toContain('maxLength="280"');
    expect(html).toContain('>Giornata lunga</textarea>');
    expect(html).toContain('>14 su 280<');
    expect(html).not.toContain('<input');
  });

  it('suggerimento, errore a parole e aria-invalid collegati al campo', () => {
    const html = renderToStaticMarkup(
      <TextField label="Nome" value="" onChange={noop} maxLength={30} hint="Facoltativo" error="Scrivi un nome." />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('>Scrivi un nome.<');
    expect(html).toContain('>Facoltativo<');
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(describedBy.split(' ')).toHaveLength(3);
  });

  it('etichetta nascosta resta nel DOM; contatore disattivabile; disabilitato', () => {
    const html = renderToStaticMarkup(
      <TextField label="Nota" value="" onChange={noop} maxLength={10} hideLabel showCount={false} disabled />,
    );
    expect(html).toContain('>Nota</label>');
    expect(html).not.toContain('su 10');
    expect(html).not.toContain('aria-describedby');
    expect(html).toContain('disabled');
  });
});

describe('conteggio dei caratteri', () => {
  it('conta i caratteri veri: un\'emoji vale uno', () => {
    expect(countChars('ciao')).toBe(4);
    expect(countChars('a😀b')).toBe(3);
    expect(countChars('')).toBe(0);
  });

  it('clampText taglia al limite senza spezzare le emoji e non tocca il testo corto', () => {
    expect(clampText('abcdef', 3)).toBe('abc');
    expect(clampText('a😀b', 2)).toBe('a😀');
    expect(clampText('ab', 5)).toBe('ab');
  });

  it('countText', () => {
    expect(countText(12, 30)).toBe('12 su 30');
  });
});
