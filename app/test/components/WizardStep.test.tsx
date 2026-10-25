import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WizardStep } from '../../src/components/WizardStep';

const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('WizardStep', () => {
  it('mostra etichetta, domanda e barra di avanzamento accessibile', () => {
    const html = renderToStaticMarkup(
      <WizardStep step={2} total={4} question="Com'è il tuo umore?">
        <button type="button">Sereno</button>
      </WizardStep>,
    );
    expect(html).toMatch(/^<section class="card /);
    expect(text(html)).toContain('Check serale · domanda 2 di 4');
    expect(html).toMatch(/<h2 id="[^"]+" tabindex="-1" class="heading-lg [^"]*">Com&#x27;è il tuo umore\?<\/h2>/);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuemax="4"');
    expect(html).toContain('aria-valuetext="Domanda 2 di 4"');
    expect(html.match(/<i /g)).toHaveLength(4);
    expect(html.match(/<i class="on"/g)).toHaveLength(2);
    expect(html).toContain('role="group"');
    expect(text(html)).toContain('Sereno');
  });

  it('collega sezione e gruppo al titolo del passo', () => {
    const html = renderToStaticMarkup(<WizardStep step={1} total={4} question="Quanto sei stanco?" />);
    const id = html.match(/<h2 id="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html.match(new RegExp(`aria-labelledby="${id}"`, 'g'))).toHaveLength(2);
  });

  it('sul primo passo non mostra Indietro', () => {
    const html = renderToStaticMarkup(<WizardStep step={1} total={4} question="Quanto sei stanco?" />);
    expect(text(html)).not.toContain('Indietro');
    expect(html).toContain('class="btn btn-soft btn-lg');
    expect(text(html)).toContain('Avanti');
    expect(html).not.toContain('btn-primary');
  });

  it('nei passi intermedi mostra Indietro e Avanti, senza pulsanti pieni', () => {
    const html = renderToStaticMarkup(<WizardStep step={3} total={4} question="Cosa è successo oggi?" />);
    expect(html).toContain('class="btn btn-secondary btn-lg"');
    expect(text(html)).toContain('Indietro');
    expect(text(html)).toContain('Avanti');
    expect(html).not.toContain('btn-primary');
  });

  it('sull’ultimo passo Vado a dormire è l’unico pulsante pieno', () => {
    const html = renderToStaticMarkup(<WizardStep step={4} total={4} question="Hai fatto un sonnellino?" />);
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(text(html)).toContain('Vado a dormire');
    expect(text(html)).not.toContain('Avanti');
    expect(text(html)).toContain('Salva il check e avvia il Comando che attiva Riposo.');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html.match(/<i class="on"/g)).toHaveLength(4);
  });

  it('dopo l’invio mostra la conferma al posto dei pulsanti', () => {
    const html = renderToStaticMarkup(
      <WizardStep step={4} total={4} question="Hai fatto un sonnellino?" confirmation="Buonanotte. Check salvato." />,
    );
    expect(html).toContain('role="status"');
    expect(text(html)).toContain('Buonanotte. Check salvato.');
    expect(html).not.toContain('<button');
  });

  it('con valori non validi resta coerente, senza NaN né undefined', () => {
    const html = renderToStaticMarkup(<WizardStep step={Number.NaN} total={Number.NaN} question="Domanda" />);
    expect(html).not.toMatch(/NaN|undefined|null/);
    expect(text(html)).toContain('domanda 1 di 1');
    const over = renderToStaticMarkup(<WizardStep step={9} total={4} question="Domanda" headingLevel={1} />);
    expect(text(over)).toContain('domanda 4 di 4');
    expect(over).toContain('<h1 ');
    expect(text(over)).toContain('Vado a dormire');
  });
});
