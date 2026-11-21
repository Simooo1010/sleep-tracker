import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Cover } from '../../src/components/Cover';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// bed 23:48 -> 348 min from 18:00; wake 07:00 -> 420 min from midnight.
const ready = (
  <Cover
    bed={{ minutes: 348, provenance: 'stimato' }}
    wake={{ minutes: 420, provenance: 'automatico' }}
    deltaText="8 min sotto la tua mediana di 14 giorni"
  />
);

describe('Cover (arc scene)', () => {
  const html = renderToStaticMarkup(ready);

  it('writes duration, times, provenance words and the delta sentence', () => {
    const t = text(html);
    expect(t).toContain('7 h 12');
    expect(t).toContain('23:48 a letto');
    expect(t).toContain('sveglia 07:00');
    expect(t).toContain('Stimato');
    expect(t).toContain('Automatico');
    expect(t).toContain('8 min sotto la tua mediana di 14 giorni');
  });

  it('exposes a text alternative for the arc', () => {
    expect(html).toMatch(/<svg [^>]*role="img"/);
    expect(html).toContain('a letto alle 23:48, sveglia alle 07:00, 7 ore e 12 minuti');
  });

  it('draws a dashed estimated segment only when the bed time is estimated', () => {
    expect(html).toContain('arcDashed');
    const confirmed = renderToStaticMarkup(
      <Cover bed={{ minutes: 348, provenance: 'confermato' }} wake={{ minutes: 420, provenance: 'automatico' }} />,
    );
    expect(confirmed).not.toContain('arcDashed');
    expect(text(confirmed)).toContain('Confermato');
  });

  it('shows only the track and a sentence when empty or loading', () => {
    const empty = renderToStaticMarkup(<Cover state="empty" />);
    expect(text(empty)).toContain('Ancora nessuna notte');
    expect(empty).not.toContain('moonDisc');
    expect(empty).toContain('track');
    const loading = renderToStaticMarkup(<Cover state="loading" />);
    expect(loading).not.toContain('moonDisc');
    expect(text(loading)).toContain('Carico la notte');
  });

  it('treats an invalid night (wake before bed) as empty, with no NaN', () => {
    const bad = renderToStaticMarkup(
      <Cover bed={{ minutes: 900, provenance: 'stimato' }} wake={{ minutes: 60, provenance: 'automatico' }} />,
    );
    expect(bad).not.toContain('moonDisc');
    expect(html + bad).not.toMatch(/NaN|undefined|null/);
  });
});
