import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SessionCard } from '../../src/components/SessionCard';

const noop = () => {};
const EXPLANATION = 'Inizio stimato da Riposo (23:48). Controlla e conferma.';

function clean(html: string) {
  expect(html).not.toMatch(/NaN|undefined|\bnull\b|!/);
}

describe('SessionCard', () => {
  it('stimata: barra tratteggiata, badge Stimata, spiegazione e Conferma piena', () => {
    const html = renderToStaticMarkup(
      <SessionCard
        status="stimata"
        duration="7h 32m"
        bedtime="23:48"
        wakeTime="07:20"
        explanation={EXPLANATION}
        onConfirm={noop}
        onCorrect={noop}
        onUndo={noop}
      />,
    );
    expect(html).toMatch(/^<section class="card [^"]+" aria-labelledby="([^"]+)"><h2 id="\1" class="eyebrow [^"]+">Stanotte<\/h2>/);
    expect(html).toContain('<p class="big big-lg');
    expect(html).toContain('>7h 32m</p>');
    expect(html.match(/class="big /g)).toHaveLength(1);
    expect(html).toContain('<div class="night-bar is-estimated" aria-hidden="true"></div>');
    expect(html).toContain('Letto 23:48, sveglia 07:20');
    expect(html).toContain('<span class="badge badge-estimated">Stimata</span>');
    expect(html).toContain(EXPLANATION);
    expect(html).toContain('<button type="button" class="btn btn-primary btn-lg btn-block">Conferma</button>');
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toContain('>Correggi orari</button>');
    expect(html).not.toContain('Annulla');
    expect(html).not.toContain('Registrata');
    clean(html);
  });

  it('confermata: barra piena, Registrata con Annulla, nessun pulsante pieno', () => {
    const html = renderToStaticMarkup(
      <SessionCard
        status="confermata"
        duration="7h 32m"
        bedtime="23:48"
        wakeTime="07:20"
        explanation="Orari confermati da te alle 08:52."
        regularity={{ text: 'Letto +8 min', inTolerance: true }}
        onConfirm={noop}
        onUndo={noop}
      />,
    );
    expect(html).toContain('<div class="night-bar" aria-hidden="true"></div>');
    expect(html).toContain('<span class="badge badge-confirmed">Confermata</span>');
    expect(html).toContain('<span class="badge badge-ok">Letto +8 min · OK</span>');
    expect(html).toMatch(/role="status"><span>Registrata\. Grazie\.<\/span><button type="button" class="btn btn-ghost [^"]+">Annulla<\/button>/);
    expect(html).not.toContain('btn-primary');
    expect(html).not.toContain('Conferma<');
    clean(html);
  });

  it('regolarità fuori tolleranza è scritta in parola', () => {
    const html = renderToStaticMarkup(
      <SessionCard status="confermata" duration="6h 10m" regularity={{ text: 'Letto +48 min', inTolerance: false }} />,
    );
    expect(html).toContain('<span class="badge badge-out">Letto +48 min · Fuori</span>');
    expect(html).toContain('Registrata. Grazie.');
    expect(html).not.toContain('Annulla');
    clean(html);
  });

  it('mancante: resta mancante, nessun numero inventato, tono neutro', () => {
    const html = renderToStaticMarkup(<SessionCard status="mancante" duration="0h 00m" onConfirm={noop} onCorrect={noop} />);
    expect(html).toContain('<div class="night-bar is-missing" aria-hidden="true"></div>');
    expect(html).toContain('<span class="badge badge-missing">Mancante</span>');
    expect(html).toContain('Durata mancante');
    expect(html).not.toContain('0h 00m');
    expect(html).toContain('Letto mancante, sveglia mancante');
    expect(html).toContain('Nessun segnale per questa notte.');
    expect(html).toContain('>Aggiungi orari</button>');
    expect(html).not.toContain('btn-primary');
    clean(html);
  });

  it('dimensioni, titolo e slot del voto di energia', () => {
    const xl = renderToStaticMarkup(
      <SessionCard status="stimata" duration="7h 32m" size="xl" title="Notte di venerdì">
        <div className="moons">voto</div>
      </SessionCard>,
    );
    expect(xl).toContain('<p class="big big-xl">7h 32m</p>');
    expect(xl).toContain('>Notte di venerdì</h2>');
    expect(xl).toContain('<div class="moons">voto</div>');
    expect(xl).not.toContain('<button');
    const lg = renderToStaticMarkup(<SessionCard status="stimata" duration="7h 32m" size="lg" />);
    expect(lg).toContain('<p class="big big-lg">7h 32m</p>');
    clean(xl);
    clean(lg);
  });
});
