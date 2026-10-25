import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ScoreRing, scoreAriaLabel, scorePct } from '../../../src/components/analysis';
import { score, text } from './fixtures';

describe('ScoreRing', () => {
  it('visibile: numero unico display-lg, parola e testo accessibile', () => {
    const html = renderToStaticMarkup(<ScoreRing score={score()} />);
    expect(html).toContain('data-state="visibile"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Punteggio 72 su 100, buona"');
    expect(html.match(/display-lg/g)).toHaveLength(1);
    expect(text(html)).toContain('72');
    expect(text(html)).toContain('Buona');
    expect(html).toContain('--ring-offset:28');
  });

  it('tre componenti con etichetta, nota e valore scritto', () => {
    const t = text(renderToStaticMarkup(<ScoreRing score={score()} />));
    expect(t).toContain('Durata');
    expect(t).toContain('7 h 12 min di media');
    expect(t).toContain(': 80 su 100');
    expect(t).toContain('Regolarità');
    expect(t).toContain(': 65 su 100');
    expect(t).toContain('Debito');
    expect(t).toContain(': non disponibile');
  });

  it('componente senza valore: pista tratteggiata e nessun riempimento', () => {
    const html = renderToStaticMarkup(<ScoreRing score={score()} />);
    expect(html).toMatch(/data-part="debito" data-state="nascosta"/);
    expect(html.match(/data-state="visibile"/g)).toHaveLength(3); // radice + 2 componenti
  });

  it('nascosto: anello punteggiato, hiddenText e nessun numero', () => {
    const html = renderToStaticMarkup(
      <ScoreRing score={score({ hidden: true, value: null, word: '', hiddenText: 'Servono almeno 7 notti. Per ora ne hai 4.' })} />,
    );
    expect(html).toContain('data-state="nascosto"');
    expect(html).not.toContain('display-lg');
    expect(html).toContain('aria-label="Punteggio non disponibile. Servono almeno 7 notti. Per ora ne hai 4."');
    expect(text(html)).toContain('Servono almeno 7 notti. Per ora ne hai 4.');
  });

  it('valore non finito: trattato come nascosto, mai NaN', () => {
    const html = renderToStaticMarkup(
      <ScoreRing
        score={score({ value: Number.NaN, word: 'undefined', parts: [{ id: 'durata', label: 'Durata', pct: Number.NaN, note: 'NaN' }] })}
      />,
    );
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
    expect(html).toContain('data-state="nascosto"');
  });

  it('helper', () => {
    expect(scorePct(101.4)).toBe(100);
    expect(scorePct(-3)).toBe(0);
    expect(scorePct(null)).toBeNull();
    expect(scoreAriaLabel(40, 'Da sistemare', false, '')).toBe('Punteggio 40 su 100, da sistemare');
  });
});
