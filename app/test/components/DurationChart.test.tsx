import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  DurationChart,
  debtText,
  describeDurationChart,
  durationPct,
  isMissingNight,
  type DurationChartProps,
  type DurationNight,
} from '../../src/components/DurationChart';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const D = [445, 462, 438, 471, null, 420, 455, 430, 478, 447, 452, 425, 440, 452];
const nights: DurationNight[] = D.map((d, i) => ({
  label: String(10 + i),
  durationMin: d,
  provenance: d === null ? 'mancante' : i === 2 || i === 9 ? 'stimato' : i === 13 ? 'automatico' : 'confermato',
}));
const props: DurationChartProps = { nights, avg7Min: 446, avgMonthMin: 447, debtMin: 65 };

describe('funzioni pure', () => {
  it('altezza proporzionale a 540 min con clamp', () => {
    expect(durationPct(450)).toBe(83.33);
    expect(durationPct(540)).toBe(100);
    expect(durationPct(700)).toBe(100);
    expect(durationPct(-5)).toBe(0);
    expect(durationPct(null)).toBeNull();
    expect(durationPct(Number.NaN)).toBeNull();
  });
  it('debito gentile e mancante con la parola', () => {
    expect(debtText(65)).toBe('Debito 1h 05m');
    expect(debtText(0)).toBe('Nessun debito');
    expect(debtText(null)).toBe('Debito Mancante');
  });
  it('mancante se manca la durata o la provenienza è mancante', () => {
    expect(isMissingNight({ durationMin: null, provenance: 'confermato' })).toBe(true);
    expect(isMissingNight({ durationMin: 400, provenance: 'mancante' })).toBe(true);
    expect(isMissingNight({ durationMin: 400, provenance: 'stimato' })).toBe(false);
  });
});

describe('DurationChart', () => {
  const html = renderToStaticMarkup(<DurationChart {...props} />);

  it('riassunto accessibile e tabella nascosta', () => {
    expect(html).toContain('role="img"');
    expect(html).toContain(`aria-label="${esc(describeDurationChart(props))}"`);
    expect(describeDurationChart(props)).toBe(
      "Durata delle ultime 14 notti, obiettivo 7h 30m. 7 sotto l'obiettivo, 1 mancante. Media 7 notti 7h 26m, media del mese 7h 27m, debito 1h 05m.",
    );
    expect(html.match(/<tr>/g)).toHaveLength(15);
  });

  it('una barra per notte, stimate tratteggiate, mancante punteggiata', () => {
    expect(html.match(/class="vbar[ "]/g)).toHaveLength(13);
    expect(html.match(/vbar [^"]*is-estimated/g)).toHaveLength(2);
    expect(html).toContain('height:82.41%');
    expect(html).toContain('height:10%');
    expect(text(html)).toContain('Mancante');
  });

  it('linea obiettivo e quattro chip', () => {
    expect(html).toContain('bottom:83.33%');
    const t = text(html);
    expect(t).toContain('Media 7 notti 7h 26m');
    expect(t).toContain('Media del mese 7h 27m');
    expect(t).toContain('Debito 1h 05m');
    expect(t).toContain('Obiettivo 7h 30m');
    expect(t).toContain('Linea tratteggiata = obiettivo 7h 30m');
    expect(html).toContain('badge badge-estimated');
    expect(html).toContain('badge badge-ok');
  });

  it('medie e debito mancanti restano mancanti, mai NaN', () => {
    const h = renderToStaticMarkup(
      <DurationChart
        nights={[{ label: '1', durationMin: Number.NaN, provenance: 'confermato' }]}
        avg7Min={null}
        avgMonthMin={Number.NaN}
        debtMin={null}
        targetMin={Number.NaN}
      />,
    );
    expect(h).not.toMatch(/NaN|undefined|Infinity/);
    expect(text(h)).toContain('Media 7 notti Mancante');
    expect(text(h)).toContain('Debito Mancante');
    expect(text(h)).toContain('Obiettivo 7h 30m');
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });
});
