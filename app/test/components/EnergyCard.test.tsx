import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EnergyCard, forecastScore, napSentence } from '../../src/components/EnergyCard';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe('EnergyCard sonnellino', () => {
  it('idle con il sonnellino di ieri', () => {
    const html = renderToStaticMarkup(
      <EnergyCard
        variant="nap"
        nap={{
          status: 'idle',
          previous: { dayLabel: 'Ieri', start: '14:05', end: '14:37', minutes: 32, total24h: '8h 04m' },
        }}
      />,
    );
    expect(html).toMatch(/^<section class="card card-yellow card-soft stack /);
    expect(html).toMatch(/<h3 id="[^"]+" class="eyebrow [^"]*">Sonnellino<\/h3>/);
    expect(text(html)).toContain(
      'Ieri: sonnellino 14:05–14:37 (32 min), con la notte fanno 8h 04m di sonno nelle 24 ore. Tocca il comando rapido quando ti sdrai.',
    );
    expect(html).toContain('<button type="button" class="btn btn-primary">Inizia sonnellino</button>');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-state="idle"');
    const labelled = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(html).toContain(`<h3 id="${labelled}"`);
  });

  it('in corso: Termina', () => {
    const html = renderToStaticMarkup(<EnergyCard variant="nap" nap={{ status: 'run', start: '14:05' }} />);
    expect(text(html)).toContain('In corso dalle 14:05.');
    expect(html).toContain('>Termina</button>');
    expect(html).not.toContain('Inizia sonnellino');
  });

  it('registrato: pulsante disabilitato e Annulla', () => {
    const html = renderToStaticMarkup(
      <EnergyCard variant="nap" nap={{ status: 'done', start: '14:05', end: '14:37', minutes: 32 }} />,
    );
    expect(text(html)).toContain('Registrato: 14:05–14:37, 32 min.');
    expect(html).toContain('<button type="button" class="btn btn-primary" disabled="">Registrato</button>');
    expect(html).toContain('<button type="button" class="btn btn-ghost">Annulla</button>');
    expect(html.match(/btn-primary/g)).toHaveLength(1);
  });

  it('dati non validi: frasi senza NaN o undefined', () => {
    const html = renderToStaticMarkup(
      <EnergyCard variant="nap" nap={{ status: 'done', start: 'undefined', end: '', minutes: Number.NaN }} />,
    );
    expect(html).not.toMatch(/NaN|undefined/);
    expect(text(html)).toContain('Registrato.');
    expect(napSentence({ status: 'run', start: '' })).toBe('In corso.');
    expect(napSentence({ status: 'idle' })).toBe('Tocca il comando rapido quando ti sdrai.');
    expect(
      napSentence({ status: 'idle', previous: { dayLabel: 'Ieri', start: '14:05', end: '14:37', minutes: Number.NaN } }),
    ).toBe('Ieri: sonnellino 14:05–14:37. Tocca il comando rapido quando ti sdrai.');
  });
});

describe('EnergyCard previsione', () => {
  const expl =
    "Se vai a letto entro le 23:55 e dormi almeno 7h 15m, nei tuoi giorni simili l'energia è stata alta 7 volte su 9.";

  it('voto con lune e Stima su N notti', () => {
    const html = renderToStaticMarkup(<EnergyCard variant="forecast" score={3.6} explanation={expl} nights={23} />);
    expect(html).toContain('<span class="badge badge-forecast">Previsione</span>');
    expect(text(html)).toContain('Domani mattina');
    expect(html).toMatch(/<p class="big big-md[^"]*">Energia 4 su 5<\/p>/);
    expect(html.match(/class="moon /g)).toHaveLength(5);
    expect(html.match(/is-on-forecast/g)).toHaveLength(1);
    expect(html).toMatch(/is-on-forecast" data-level="4"/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('aria-label="Previsione di energia"');
    expect(text(html)).toContain(`${expl} Stima su 23 notti.`);
    expect(html).toContain('data-state="stimata"');
  });

  it('sotto soglia: niente voto, frase con i numeri', () => {
    const html = renderToStaticMarkup(<EnergyCard variant="forecast" score={4} explanation={expl} nights={4} />);
    expect(text(html)).toContain('Servono almeno 10 notti. Per ora ne hai 4.');
    expect(html).not.toContain('Energia 4 su 5');
    expect(html).not.toContain('class="moon');
    expect(html).toContain('data-state="sotto-soglia"');
  });

  it('soglia personalizzata', () => {
    const html = renderToStaticMarkup(<EnergyCard variant="forecast" score={4} nights={4} minNights={3} />);
    expect(text(html)).toContain('Energia 4 su 5');
    expect(text(html)).toContain('Stima su 4 notti.');
  });

  it('voto mancante: parola Mancante, nessun numero', () => {
    const html = renderToStaticMarkup(<EnergyCard variant="forecast" score={null} nights={20} />);
    expect(html).toContain('badge badge-missing');
    expect(text(html)).toContain('Mancante');
    expect(html).not.toContain('Energia ');
    expect(html).toContain('data-state="mancante"');
  });

  it('mostra la copertura', () => {
    const html = renderToStaticMarkup(
      <EnergyCard variant="forecast" score={2} nights={12} coverage={{ used: 12, total: 14, estimated: 1 }} />,
    );
    expect(text(html)).toContain('Calcolata su 12 su 14 notti');
  });

  it('nessun NaN o undefined con numeri non validi', () => {
    const html = renderToStaticMarkup(
      <EnergyCard variant="forecast" score={Number.NaN} nights={Number.NaN} explanation="undefined" when="" />,
    );
    expect(html).not.toMatch(/NaN|undefined/);
    expect(text(html)).toContain('Servono almeno 10 notti. Per ora ne hai 0.');
    expect(forecastScore(7)).toBeNull();
    expect(forecastScore(0.6)).toBe(1);
  });
});
