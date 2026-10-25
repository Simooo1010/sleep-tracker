import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SignalRow } from '../../src/components/SignalRow';

const clean = (html: string) => expect(html).not.toMatch(/NaN|undefined|\bnull\b|!/);

describe('SignalRow', () => {
  it('attivo con ultimo evento', () => {
    const html = renderToStaticMarkup(
      <SignalRow
        name="Sveglia interrotta"
        description={'Comando automatico · invia "wake", coincide con l’alzata'}
        lastEvent="oggi 07:20"
        status="attivo"
      />,
    );
    expect(html).toMatch(/^<div class="signal [^"]+"><div class="[^"]+"><span class="nm [^"]+">Sveglia interrotta<\/span><span class="badge badge-ok">Attivo<\/span><\/div>/);
    expect(html).toContain('<p class="caption muted ');
    expect(html).toContain('invia &quot;wake&quot;');
    expect(html).toContain('Ultimo segnale: </span>oggi 07:20</p>');
    clean(html);
  });

  it('da configurare e senza segnali: frase neutra', () => {
    const html = renderToStaticMarkup(
      <SignalRow name="Sonnellino rapido" description="Comando inizio/fine" lastEvent={null} status="da-configurare" />,
    );
    expect(html).toContain('<span class="badge badge-out">Da configurare</span>');
    expect(html).toContain('ancora nessun segnale');
    clean(html);
  });

  it('inattivo in parola e come voce di elenco', () => {
    const html = renderToStaticMarkup(
      <SignalRow name="Stima di riserva" description="Dai giorni simili" lastEvent="  " status="inattivo" as="li" />,
    );
    expect(html.startsWith('<li class="signal ')).toBe(true);
    expect(html).toContain('<span class="badge badge-missing">Inattivo</span>');
    expect(html).toContain('ancora nessun segnale');
    clean(html);
  });
});
