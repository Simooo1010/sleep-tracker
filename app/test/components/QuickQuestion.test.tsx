import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QuickQuestion, YES_NO, normalizeAnswers, progressLabel } from '../../src/components/QuickQuestion';

const noop = () => {};

describe('QuickQuestion: logica pura', () => {
  it('normalizeAnswers: massimo tre, niente Salta, vuoti o duplicati', () => {
    expect(normalizeAnswers(YES_NO)).toEqual([...YES_NO]);
    const out = normalizeAnswers([
      { value: 'a', label: 'Nessuno' },
      { value: 'b', label: ' ' },
      { value: 'skip', label: 'salta' },
      { value: 'a', label: 'Doppio' },
      { value: 'c', label: '15 min' },
      { value: 'd', label: '30 min' },
      { value: 'e', label: '1 ora' },
    ]);
    expect(out.map((a) => a.value)).toEqual(['a', 'c', 'd']);
  });

  it('progressLabel', () => {
    expect(progressLabel(1, 2)).toBe('Domanda rapida · 1 di 2');
    expect(progressLabel()).toBeNull();
    expect(progressLabel(3, 2)).toBeNull();
    expect(progressLabel(0, 2)).toBeNull();
    expect(progressLabel(Number.NaN, 2)).toBeNull();
  });
});

describe('QuickQuestion: markup', () => {
  it('domanda, risposte Sì/No come chip e Salta sempre presente', () => {
    const html = renderToStaticMarkup(
      <QuickQuestion question="Ieri sera hai fatto sport?" onAnswer={noop} onSkip={noop} current={1} total={2} />,
    );
    expect(html).toContain('class="card qq"');
    expect(html).toContain('class="q ');
    expect(html).toContain('class="a"');
    expect(html).toContain('Ieri sera hai fatto sport?');
    expect(html).toContain('>Sì<');
    expect(html).toContain('>No<');
    expect(html).toContain('>Salta<');
    expect(html.match(/class="chip/g)).toHaveLength(3);
    expect(html).toContain('Domanda rapida · 1 di 2');
    expect(html).toContain('eyebrow');
    expect(html).not.toMatch(/NaN|undefined|null/);
  });

  it('ARIA: sezione e gruppo etichettati dalla domanda, aria-live, aria-pressed', () => {
    const html = renderToStaticMarkup(<QuickQuestion question="Ti sei svegliato di notte?" onAnswer={noop} onSkip={noop} />);
    const id = /<p id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<section aria-labelledby="${id}"`);
    expect(html).toContain(`role="group" aria-labelledby="${id}"`);
    expect(html).toContain('aria-live="polite"');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html.match(/type="button"/g)).toHaveLength(3);
  });

  it('senza avanzamento non mostra il contatore', () => {
    const html = renderToStaticMarkup(<QuickQuestion question="Hai fatto un sonnellino oggi?" onAnswer={noop} onSkip={noop} />);
    expect(html).not.toContain('Domanda rapida');
    expect(html).not.toContain('eyebrow');
  });

  it('risposta già data: chip is-on e aria-pressed', () => {
    const html = renderToStaticMarkup(
      <QuickQuestion question="Ieri sera hai fatto sport?" onAnswer={noop} onSkip={noop} selected="si" />,
    );
    expect(html).toMatch(/class="chip is-on" aria-pressed="true">Sì</);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('risposte personalizzate (massimo tre) e Salta aggiunto una sola volta', () => {
    const html = renderToStaticMarkup(
      <QuickQuestion
        question="Sonnellino oggi?"
        answers={[
          { value: 'none', label: 'Nessuno' },
          { value: '15', label: '15 min' },
          { value: 'skip', label: 'Salta' },
          { value: '30', label: '30 min' },
          { value: '60', label: '1 ora' },
        ]}
        onAnswer={noop}
        onSkip={noop}
      />,
    );
    expect(html).toContain('Nessuno');
    expect(html).toContain('30 min');
    expect(html).not.toContain('1 ora');
    expect(html.match(/Salta/g)).toHaveLength(1);
    expect(html.match(/class="chip/g)).toHaveLength(4);
  });

  it('vuoto: senza risposte resta comunque Salta', () => {
    const html = renderToStaticMarkup(<QuickQuestion question="Domanda" answers={[]} onAnswer={noop} onSkip={noop} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('>Salta<');
    expect(html).not.toContain('!');
  });
});
