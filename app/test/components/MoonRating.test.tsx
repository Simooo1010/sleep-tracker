import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  MOON_PHASE_NAMES,
  MoonRating,
  SCORES,
  moonAriaLabel,
  moonFraction,
  moonPhasePath,
  nextScore,
  toScore,
} from '../../src/components/MoonRating';

const noop = () => {};

function clean(html: string) {
  expect(html).not.toMatch(/NaN|undefined|null/);
}

describe('MoonRating: logica pura', () => {
  it('mappa voto → fase lunare (luna nuova … luna piena)', () => {
    expect(SCORES.map(moonFraction)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(MOON_PHASE_NAMES[1]).toBe('luna nuova');
    expect(MOON_PHASE_NAMES[5]).toBe('luna piena');
    expect(moonPhasePath(1)).toBe('');
    expect(moonPhasePath(2)).toBe('M12 2A10 10 0 0 1 12 22A5 10 0 0 0 12 2Z');
    expect(moonPhasePath(3)).toBe('M12 2A10 10 0 0 1 12 22Z');
    expect(moonPhasePath(4)).toBe('M12 2A10 10 0 0 1 12 22A5 10 0 0 1 12 2Z');
    expect(moonPhasePath(5)).toBe('M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20');
  });

  it('frecce con giro, Home e Fine', () => {
    expect(nextScore(3, 'ArrowRight')).toBe(4);
    expect(nextScore(3, 'ArrowDown')).toBe(4);
    expect(nextScore(3, 'ArrowLeft')).toBe(2);
    expect(nextScore(3, 'ArrowUp')).toBe(2);
    expect(nextScore(5, 'ArrowRight')).toBe(1);
    expect(nextScore(1, 'ArrowLeft')).toBe(5);
    expect(nextScore(4, 'Home')).toBe(1);
    expect(nextScore(2, 'End')).toBe(5);
    expect(nextScore(2, 'Enter')).toBeNull();
  });

  it('toScore accetta solo interi 1–5', () => {
    expect(toScore(3)).toBe(3);
    for (const v of [0, 6, 2.5, Number.NaN, null, undefined, '3']) expect(toScore(v)).toBeNull();
  });

  it('etichette accessibili', () => {
    expect(moonAriaLabel('energy', 3)).toBe('Energia 3 di 5');
    expect(moonAriaLabel('tired', 1)).toBe('Stanchezza 1 di 5');
  });
});

describe('MoonRating: markup', () => {
  it('energia: radiogroup con 5 radio, selezione gialla e tabindex mobile', () => {
    const html = renderToStaticMarkup(<MoonRating kind="energy" value={4} onChange={noop} />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Energia di questa mattina"');
    expect(html.match(/role="radio"/g)).toHaveLength(5);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(4);
    expect(html).toMatch(/class="moon is-on-energy"[^>]*aria-label="Energia 4 di 5"|aria-checked="true" aria-label="Energia 4 di 5"[^>]*class="moon is-on-energy"/);
    expect(html).toContain('class="moons"');
    expect(html).not.toContain('is-on-tired');
    expect(html).not.toContain('moon-scale');
    // luna nuova senza parte illuminata, le altre quattro sì
    expect(html.match(/class="lit"/g)).toHaveLength(4);
    clean(html);
  });

  it('stanchezza: selezione azzurra ed estremi della scala', () => {
    const html = renderToStaticMarkup(<MoonRating kind="tired" value={2} onChange={noop} />);
    expect(html).toContain('aria-label="Stanchezza di stasera"');
    expect(html).toContain('moon is-on-tired');
    expect(html).toContain('aria-label="Stanchezza 2 di 5"');
    expect(html).toContain('class="moon-scale');
    expect(html).toContain('Per niente');
    expect(html).toContain('Esausto');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    clean(html);
  });

  it('vuoto: nessuna selezione, il focus entra dalla prima luna', () => {
    const html = renderToStaticMarkup(<MoonRating kind="energy" value={null} onChange={noop} />);
    expect(html).not.toContain('aria-checked="true"');
    expect(html).not.toContain('is-on-');
    expect(html).toMatch(/tabindex="0"[^>]*data-score="1"|data-score="1"[^>]*tabindex="0"|tabindex="0" data-score="1"/);
    clean(html);
  });

  it('valore non valido trattato come vuoto, mai NaN', () => {
    const html = renderToStaticMarkup(<MoonRating kind="energy" value={Number.NaN as never} onChange={noop} />);
    expect(html).not.toContain('aria-checked="true"');
    clean(html);
  });

  it('dimensione lg e distribuzione su telefono aggiungono classi locali', () => {
    const base = renderToStaticMarkup(<MoonRating kind="tired" value={3} onChange={noop} />);
    const big = renderToStaticMarkup(<MoonRating kind="tired" value={3} onChange={noop} size="lg" spread />);
    expect(big.length).toBeGreaterThan(base.length);
    clean(big);
  });

  it('previsione in sola lettura: immagine con etichetta e parola Stimata', () => {
    const html = renderToStaticMarkup(<MoonRating kind="forecast" value={4} estimated />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Previsione di energia per domani: 4 di 5, stimata"');
    expect(html).toContain('moon is-on-forecast');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('role="radio"');
    expect(html).toContain('Stimata');
    clean(html);
  });

  it('sola lettura mancante: la parola Mancante, nessuna luna accesa', () => {
    const html = renderToStaticMarkup(<MoonRating kind="forecast" value={null} />);
    expect(html).toContain('Mancante');
    expect(html).toContain(': mancante');
    expect(html).not.toContain('is-on-');
    clean(html);
  });

  it('italiano senza punti esclamativi', () => {
    const html = renderToStaticMarkup(<MoonRating kind="tired" value={5} onChange={noop} label="Quanto sei stanco" />);
    expect(html).toContain('aria-label="Quanto sei stanco"');
    expect(html).not.toContain('!');
  });
});
