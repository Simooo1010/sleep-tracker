import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AnalysisScene, SCENE_FALLBACK_LABEL } from '../../../src/components/analysis';
import type { SceneKey } from '../../../src/server/views/analysis-types';

const KEYS: SceneKey[] = ['recupero', 'regolare', 'debito', 'deriva', 'pochi-dati'];

describe('AnalysisScene', () => {
  it.each(KEYS)('scena %s: SVG vettoriale con role img e aria-label', (key) => {
    const label = `Descrizione ${key}`;
    const html = renderToStaticMarkup(<AnalysisScene scene={{ key, label }} />);
    expect(html).toContain(`data-scene="${key}"`);
    expect(html).toMatch(/<svg[^>]*role="img"/);
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('viewBox="0 0 320 180"');
    expect(html).not.toMatch(/<img|NaN|undefined/);
  });

  it('ogni scena disegna qualcosa di diverso', () => {
    const shapes = KEYS.map((key) =>
      renderToStaticMarkup(<AnalysisScene scene={{ key, label: 'x' }} />).replace(/data-scene="[^"]+"/, ''),
    );
    expect(new Set(shapes).size).toBe(KEYS.length);
  });

  it('etichetta vuota o sporca: usa la descrizione di riserva', () => {
    const html = renderToStaticMarkup(<AnalysisScene scene={{ key: 'debito', label: ' undefined ' }} />);
    expect(html).toContain(`aria-label="${SCENE_FALLBACK_LABEL.debito}"`);
    expect(html).not.toContain('undefined');
  });

  it('chiave sconosciuta: ricade su pochi-dati', () => {
    const scene = { key: 'boh' as SceneKey, label: 'Cielo' };
    expect(renderToStaticMarkup(<AnalysisScene scene={scene} />)).toContain('data-scene="pochi-dati"');
  });
});
