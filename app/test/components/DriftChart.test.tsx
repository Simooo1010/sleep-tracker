import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  DriftChart,
  describeDriftChart,
  driftExceeds,
  driftHeights,
  driftLabels,
  driftSentence,
  formatDriftBadge,
  type DriftChartProps,
} from '../../src/components/DriftChart';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 23:04, 23:13, 23:24, 23:34, 23:42, 23:46 (minuti dalle 18:00)
const W = [304, 313, 324, 334, 342, 346];
const props: DriftChartProps = { weeklyBedMin: W, shiftMin: 42, spanWeeks: 5 };

describe('funzioni pure', () => {
  it('etichette', () => {
    expect(driftLabels(6)).toEqual(['5 sett. fa', '4', '3', '2', '1', 'Ora']);
    expect(driftLabels(1)).toEqual(['Ora']);
    expect(driftLabels(0)).toEqual([]);
  });

  it('altezze proporzionali allo scostamento dalla prima mediana', () => {
    const h = driftHeights(W);
    expect(h[0]).toBe(20);
    expect(h[5]).toBe(80);
    expect(h[2]).toBeCloseTo(20 + (60 * 20) / 42, 2);
  });

  it('scala minima pari alla tolleranza e deriva negativa', () => {
    expect(driftHeights([300, 306])).toEqual([20, 32]);
    const neg = driftHeights([340, 320, 300]);
    expect(neg).toEqual([80, 50, 20]);
  });

  it('settimane mancanti restano null', () => {
    expect(driftHeights([null, 300, null, 330])).toEqual([null, 20, null, 80]);
    expect(driftHeights([null, null])).toEqual([null, null]);
  });

  it('badge con segno vero e singolare', () => {
    expect(formatDriftBadge(42, 5)).toBe('+42 min in 5 settimane');
    expect(formatDriftBadge(-35, 1)).toBe('−35 min in 1 settimana');
    expect(formatDriftBadge(null, 5)).toBeNull();
    expect(formatDriftBadge(10, Number.NaN)).toBeNull();
  });

  it('supera la tolleranza oltre ± 30', () => {
    expect(driftExceeds({ shiftMin: 42 })).toBe(true);
    expect(driftExceeds({ shiftMin: -30 })).toBe(false);
    expect(driftExceeds({ shiftMin: 10, exceeds: true })).toBe(true);
    expect(driftExceeds({ shiftMin: null })).toBe(false);
  });

  it('frase sotto il grafico', () => {
    expect(driftSentence(props)).toBe(
      'La mediana del tuo orario di letto si è spostata da 23:04 a 23:46. È oltre la tolleranza di ± 30 min.',
    );
    expect(driftSentence({ weeklyBedMin: [304, 304], shiftMin: 0, spanWeeks: 1 })).toBe(
      'La mediana del tuo orario di letto è rimasta alle 23:04. È entro la tolleranza di ± 30 min.',
    );
    expect(driftSentence({ weeklyBedMin: [304, null], shiftMin: null, spanWeeks: null })).toContain('servono almeno');
  });
});

describe('DriftChart', () => {
  const html = renderToStaticMarkup(<DriftChart {...props} />);

  it('riassunto accessibile', () => {
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${esc(describeDriftChart(props))}"`);
    expect(describeDriftChart(props)).toContain('Deriva +42 min in 5 settimane');
    expect(describeDriftChart(props)).toContain('5 sett. fa: 23:04');
    expect(describeDriftChart(props)).toContain('Ora: 23:46');
  });

  it('sei barre, l’ultima in pesca, badge fuori tolleranza', () => {
    expect(html.match(/class="vbar[ "]/g)).toHaveLength(6);
    expect(html.match(/is-now/g)).toHaveLength(1);
    expect(html).toContain('badge badge-out');
    const t = text(html);
    expect(t).toContain('+42 min in 5 settimane');
    expect(t).toContain('23:04');
    expect(t).toContain('5 sett. fa');
    expect(t).toContain('Ora');
  });

  it('badge OK entro tolleranza', () => {
    const h = renderToStaticMarkup(<DriftChart weeklyBedMin={[304, 310]} shiftMin={6} spanWeeks={1} />);
    expect(h).toContain('badge badge-ok');
    expect(text(h)).toContain('+6 min in 1 settimana');
  });

  it('settimane mancanti con la parola, mai NaN', () => {
    const h = renderToStaticMarkup(
      <DriftChart weeklyBedMin={[null, 304, Number.NaN, 320, null, 346]} shiftMin={42} spanWeeks={4} />,
    );
    expect(h).not.toMatch(/NaN|undefined|Infinity/);
    expect(h.match(/class="vbar[ "]/g)).toHaveLength(3);
    expect(text(h).match(/Mancante/g)).toHaveLength(3);
    const none = renderToStaticMarkup(<DriftChart weeklyBedMin={[null, null]} shiftMin={null} spanWeeks={null} />);
    expect(none).not.toMatch(/NaN|undefined|Infinity/);
    expect(none).toContain('badge badge-missing');
    expect(text(none)).toContain('servono almeno due settimane');
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });
});
