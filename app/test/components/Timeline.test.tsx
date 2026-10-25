import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Timeline, type TimelineEvent } from '../../src/components/Timeline';

const EVENTS: TimelineEvent[] = [
  { id: 'a', time: '23:41', title: 'Check serale salvato', source: 'Comando "Sera" · stanchezza 4 su 5', kind: 'serale' },
  { id: 'b', time: '23:48', title: 'Riposo attivato', source: 'Comando Full Immersion', kind: 'confermato' },
  { id: 'c', time: '03:12', title: 'Possibile risveglio di circa 10 min', source: 'Movimento del telefono', kind: 'da-confermare' },
  { id: 'd', time: '07:20', title: 'Sveglia interrotta', source: 'Comando automatico · sei in piedi', kind: 'confermato' },
  { id: 'e', time: null, title: 'Primo uso del telefono', source: 'Notte ricostruita, da confermare', kind: 'da-confermare' },
];

describe('Timeline', () => {
  const html = renderToStaticMarkup(<Timeline events={EVENTS} />);

  it('sezione con titolo ed elenco ordinato', () => {
    expect(html).toMatch(/^<section class="card [^"]+" aria-labelledby="([^"]+)"><h2 id="\1" class="eyebrow [^"]+">La notte, in ordine<\/h2><ol class="[^"]+">/);
    expect(html.match(/<li class="tl">/g)).toHaveLength(5);
    expect(html.indexOf('Check serale')).toBeLessThan(html.indexOf('Sveglia interrotta'));
  });

  it('punti per tipo, binario nascosto agli screen reader, filo tranne l’ultimo', () => {
    expect(html).toContain('<div class="dot sage"></div>');
    expect(html.match(/<div class="dot"><\/div>/g)).toHaveLength(2);
    expect(html.match(/<div class="dot est"><\/div>/g)).toHaveLength(2);
    expect(html.match(/class="rail" aria-hidden="true"/g)).toHaveLength(5);
    expect(html.match(/<div class="line"><\/div>/g)).toHaveLength(4);
  });

  it('da confermare sempre in parola, senza duplicati', () => {
    expect(html).toContain('<div class="src">Movimento del telefono · da confermare</div>');
    expect(html).toContain('<div class="src">Notte ricostruita, da confermare</div>');
    expect(html.match(/da confermare/gi)).toHaveLength(2);
    expect(html).toContain('<div class="src">Comando Full Immersion</div>');
  });

  it('ora tabulare e ora mancante dichiarata', () => {
    expect(html).toMatch(/<div class="t [^"]+">23:48<\/div>/);
    expect(html).toContain('<span aria-hidden="true">—</span>');
    expect(html).toContain('Ora mancante');
    expect(html).toMatch(/<div class="title [^"]+">Riposo attivato<\/div>/);
    expect(html).not.toMatch(/NaN|undefined|\bnull\b|!/);
  });

  it('vuota: frase neutra, niente elenco', () => {
    const empty = renderToStaticMarkup(<Timeline events={[]} title="Ieri notte" />);
    expect(empty).toContain('>Ieri notte</h2>');
    expect(empty).toContain('Ancora nessun segnale per questa notte.');
    expect(empty).not.toContain('<ol');
    expect(empty).not.toMatch(/NaN|undefined|\bnull\b|!/);
  });
});
