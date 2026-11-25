import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  NightsTrend,
  TREND_MAX_DELAY_MS,
  TREND_STAGGER_MS,
  barDelayMs,
  labelStep,
  trendPct,
  trendScale,
} from '../../../src/components/analysis';
import { nights, point, text } from './fixtures';

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('NightsTrend', () => {
  it('una barra per notte, linea obiettivo, caption, media e copertura', () => {
    const html = renderToStaticMarkup(<NightsTrend nights={nights(14)} />);
    expect(html).toContain('data-state="visibile"');
    expect(count(html, /data-status="confermata"/g)).toBe(14);
    expect(text(html)).toContain('3 notti su 14 fuori orario');
    expect(text(html)).toContain('Media 7h 10m');
    expect(text(html)).toContain('Obiettivo 7h 30m');
    expect(text(html)).toContain('Calcolata su 14 su 14 notti');
    expect(html).toContain('class="coverage');
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('elenco accessibile con il summary di ogni notte; il grafico è decorativo', () => {
    const data = nights(7);
    const html = renderToStaticMarkup(<NightsTrend nights={data} />);
    for (const p of data.points) expect(html).toContain(`<li>${p.summary}</li>`);
    expect(html).toMatch(/<div class="[^"]*chart[^"]*" aria-hidden="true"/);
  });

  it('stimata tratteggiata, mancante punteggiata, outlier con ▲, eccezione con puntino', () => {
    const data = nights(7, {
      points: [
        point(0, { status: 'stimata' }),
        point(1, { status: 'mancante', durationMin: null }),
        point(2, { outlier: true }),
        point(3, { exception: true }),
        point(4),
        point(5),
        point(6),
      ],
    });
    const html = renderToStaticMarkup(<NightsTrend nights={data} />);
    expect(html).toContain('is-estimated');
    expect(html).toMatch(/data-status="mancante"[^>]*><div class="[^"]*missing/);
    expect(html).toContain('data-outlier="si"');
    expect(count(html, /▲/g)).toBe(2); // barra + legenda
    expect(text(html)).toContain('Fuori orario');
    expect(text(html)).toContain('Eccezione');
    expect(text(html)).toContain('Stimata');
    expect(text(html)).toContain('Mancante');
  });

  it('nessun outlier né eccezioni: la legenda non li nomina', () => {
    const t = text(renderToStaticMarkup(<NightsTrend nights={nights(7)} />));
    expect(t).not.toContain('Fuori orario');
    expect(t).not.toContain('Eccezione');
  });

  it('30 barre: etichette solo ogni 7, l’ultima sempre presente', () => {
    const data = nights(30);
    const html = renderToStaticMarkup(<NightsTrend nights={data} />);
    expect(html).toContain('data-density="alta"');
    expect(count(html, /class="[^"]*dayText/g)).toBe(5);
    expect(html).toContain(`>${data.points[29]?.label}</span>`);
  });

  it('nascosto: scheda con hiddenText e copertura, nessuna barra', () => {
    const html = renderToStaticMarkup(
      <NightsTrend nights={nights(4, { hidden: true, hiddenText: 'Servono almeno 7 notti. Per ora ne hai 4.' })} />,
    );
    expect(html).toContain('data-state="nascosto"');
    expect(text(html)).toContain('Servono almeno 7 notti. Per ora ne hai 4.');
    expect(html).not.toContain('data-status=');
  });

  it('animazione: stagger ≤ 30 ms e ritardo totale ≤ 300 ms (con 300 ms di crescita ≤ 600 ms)', () => {
    for (const n of [7, 14, 30]) {
      for (let i = 1; i < n; i += 1) expect(barDelayMs(i, n) - barDelayMs(i - 1, n)).toBeLessThanOrEqual(TREND_STAGGER_MS + 1);
      expect(barDelayMs(n - 1, n)).toBeLessThanOrEqual(TREND_MAX_DELAY_MS);
    }
    expect(barDelayMs(0, 1)).toBe(0);
  });

  it('helper di scala', () => {
    expect(labelStep(7)).toBe(1);
    expect(labelStep(14)).toBe(2);
    expect(labelStep(30)).toBe(7);
    const s = trendScale([point(0, { durationMin: 700 })], 450);
    expect(s).toBeGreaterThanOrEqual(700);
    expect(trendPct(700, s)).toBeLessThan(100);
    expect(trendPct(Number.NaN, s)).toBe(0);
  });
});
