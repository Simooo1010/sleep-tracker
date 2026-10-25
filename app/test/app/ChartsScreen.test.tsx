import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChartsScreen } from '../../src/app/grafici/ChartsScreen';
import {
  forecastParts,
  parseHm,
  parseSignedDecimal,
  toCorrelationRows,
  toDurationChartProps,
  toHeatmapDays,
} from '../../src/app/grafici/mapping';
import { formatDiff } from '../../src/components/CorrelationTable';
import { MemoryRepo } from '../../src/server/memory-repo';
import { loadChartsPage } from '../../src/server/pages/charts';
import { DEMO_NOW, buildDemoSeed } from '../../src/server/seed';
import type { ChartsView } from '../../src/server/views';

const NOW = new Date(DEMO_NOW);
const INSIGHTS = <p>Slot insight di prova</p>;

async function viewOf(seed = buildDemoSeed(DEMO_NOW)): Promise<ChartsView> {
  return (await loadChartsPage(new MemoryRepo(seed), NOW)).view;
}

const render = (view: ChartsView) => renderToStaticMarkup(<ChartsScreen view={view} insights={INSIGHTS} />);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('ChartsScreen con il dataset demo', () => {
  it('un solo h1 "Grafici", sezioni h2 e lo slot degli insight', async () => {
    const html = render(await viewOf());
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Grafici<\/h1>/);
    expect(html).not.toContain('<main');
    for (const t of ['Insight', 'Durata e debito', 'Giorni della settimana', 'Fattori', 'Trend', 'Domani', 'Sonnellini']) {
      expect(html).toMatch(new RegExp(`<h2[^>]*>${t}</h2>`));
    }
    expect(html).toContain('Slot insight di prova');
  });

  it('elenco di voci per telefono (ListRow) e Indietro in ogni sezione', async () => {
    const html = render(await viewOf());
    expect(html.match(/class="list-row /g)).toHaveLength(7);
    expect(html.match(/<button type="button" class="list-row/g)).toHaveLength(7);
    expect(html.match(/>Indietro<\/button>/g)).toHaveLength(7);
    // all'inizio nessuna sezione è aperta
    expect(html.match(/data-active="true"/g)).toBeNull();
    expect(html).toMatch(/data-hidden="false"/);
  });

  it('nessun pulsante pieno (pesca): la pagina è di sola lettura', async () => {
    const html = render(await viewOf());
    expect(html).not.toContain('btn-primary');
    expect(html).not.toMatch(/<input|<form|<textarea/);
  });

  it('mostra DurationChart, Heatmap, CorrelationTable, trend, previsione e sonnellini', async () => {
    const html = render(await viewOf());
    expect(html).toContain('Durata e debito, ultime 14 notti');
    expect(html).toContain('Giorni della settimana');
    expect(html).toContain('Cosa si lega a qualità, energia e umore');
    expect(html).toContain('Trend mensile');
    expect(html).toContain('Previsione di energia');
    expect(html).toMatch(/Stima su \d+ nott[ei]/);
    expect(html).toContain('Ultimi sonnellini');
    expect(html).toContain('Frequenza');
    expect(html).toContain('Durata media');
    expect(html).toContain('Orario tipico');
  });

  it('la previsione dice "Stima su N notti" una volta sola', async () => {
    const html = render(await viewOf());
    const section = html.slice(html.indexOf('data-variant="forecast"'));
    const end = section.indexOf('</section>');
    expect(section.slice(0, end).match(/Stima su \d+ nott[ei]/g)).toHaveLength(1);
  });

  it('ogni grafico ha un riassunto testuale per i lettori di schermo', async () => {
    const html = render(await viewOf());
    expect(html).toMatch(/role="img" aria-label="Durata delle ultime 14 notti/);
    expect(html).toMatch(/<table[^>]*>\s*<caption[^>]*>Durata e debito, ultime 14 notti: durata per notte/);
    expect(html).toMatch(/<caption[^>]*>Giorni della settimana: ultime 4 settimane/);
    expect(html).toMatch(/role="region" aria-label="Cosa si lega/);
    expect(html).toMatch(/role="img" aria-label="Trend mensile, ultimi 6 mesi: /);
  });

  it('la copertura è sempre visibile e i numeri sono scritti', async () => {
    const html = render(await viewOf());
    expect(html).toMatch(/Calcolata su <strong>\d+ su 14 notti<\/strong>/);
    expect(html).toMatch(/Calcolata su <strong>\d+ su 28 notti<\/strong>/);
    expect(html).toMatch(/Calcolata su <strong>\d+ su \d+ notti<\/strong>/);
  });

  it('testi in italiano, nessun NaN, undefined, null o punto esclamativo', async () => {
    const html = render(await viewOf());
    const t = text(html);
    expect(t).not.toMatch(/NaN|undefined|\bnull\b|Infinity|\[object/);
    expect(t).not.toContain('!');
    expect(t).not.toMatch(/\bcosts?\b|\bsleep debt\b/i);
  });

  it('nessun linguaggio causale: le correlazioni sono indizi', async () => {
    const t = text(render(await viewOf()));
    expect(t).not.toMatch(/\bcausa\b|\bcausato\b|\bprovoca\b|\bdipende dal\b/i);
    // "cause" compare solo nella negazione "non cause"
    for (const m of t.matchAll(/\bcause\b/gi)) {
      expect(t.slice(Math.max(0, (m.index ?? 0) - 4), m.index)).toBe('non ');
    }
    expect(t).toContain('Sono indizi, non cause.');
  });

  it('gli accenti dei dati hanno sempre anche una parola (provenienza dei sonnellini)', async () => {
    const view = await viewOf();
    const html = render(view);
    for (const n of view.naps.list) expect(html).toContain(n.provenanceWord);
  });
});

describe('ChartsScreen sotto soglia e vuota', () => {
  it('poche notti: frasi di soglia al posto delle correlazioni, nessun numero inventato', async () => {
    const seed = buildDemoSeed(DEMO_NOW);
    const view = await viewOf({ ...seed, nights: (seed.nights ?? []).slice(-5), checks: [], naps: [] });
    const html = render(view);
    const t = text(html);
    expect(view.correlations.hidden).toBe(true);
    expect(t).toMatch(/Servono almeno 14 notti\. Per ora ne hai \d+\./);
    expect(view.forecast.hidden).toBe(true);
    expect(t).toMatch(/Servono almeno \d+ notti con energia\. Per ora ne hai \d+\./);
    expect(t).toContain('Nessun sonnellino negli ultimi 14 giorni.');
    expect(t).not.toMatch(/NaN|undefined|\bnull\b/);
    expect(html).not.toContain('btn-primary');
  });

  it('nessuna notte: frase calma, insight comunque visibile, nessun elenco', async () => {
    const view = await viewOf({});
    const html = render(view);
    expect(view.empty).toBe(true);
    expect(html).toContain('I grafici compaiono dopo le prime notti registrate. Nessuna fretta.');
    expect(html).toContain('Slot insight di prova');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).not.toContain('list-row');
    expect(text(html)).not.toMatch(/NaN|undefined|\bnull\b/);
  });
});

describe('mapping dalla view ai componenti', () => {
  it('parseHm e parseSignedDecimal', () => {
    expect(parseHm('7h 32m')).toBe(452);
    expect(parseHm('1h 05m')).toBe(65);
    expect(parseHm('7h12')).toBe(432);
    expect(parseHm('Media 7 notti 7h 12m')).toBe(432);
    expect(parseHm('—')).toBeNull();
    expect(parseSignedDecimal('+0,6')).toBe(0.6);
    expect(parseSignedDecimal('−0,8')).toBe(-0.8);
    expect(parseSignedDecimal('0,0')).toBe(0);
    expect(parseSignedDecimal('—')).toBeNull();
  });

  it('DurationChart: 14 notti con durata, medie, debito e obiettivo coerenti con la view', async () => {
    const view = await viewOf();
    const props = toDurationChartProps(view.duration);
    expect(props.nights).toHaveLength(14);
    expect(props.targetMin).toBe(450);
    expect(props.avg7Min).not.toBeNull();
    for (const [i, n] of props.nights.entries()) {
      const bar = view.duration.bars[i];
      expect(n.provenance === 'mancante').toBe(bar?.status === 'mancante');
      expect(n.durationMin === null).toBe(bar?.status === 'mancante');
    }
  });

  it('Heatmap: sette righe da quattro celle', async () => {
    const days = toHeatmapDays((await viewOf()).heatmap);
    expect(days).toHaveLength(7);
    expect(days.every((r) => r.length === 4)).toBe(true);
  });

  it('CorrelationTable: il numero riletto si riscrive identico al testo della view', async () => {
    const view = await viewOf();
    const rows = toCorrelationRows(view.correlations);
    expect(rows.length).toBe(view.correlations.rows.length);
    for (const [i, row] of rows.entries()) {
      for (const cell of view.correlations.rows[i]?.cells ?? []) {
        const v = row[cell.outcome];
        if (cell.text === '—') expect(v).toBeNull();
        else expect(formatDiff(v as number)).toBe(cell.text);
      }
    }
  });

  it('forecastParts toglie la frase "Stima su N notti" ripetuta dal componente', async () => {
    const view = await viewOf();
    const { explanation, nights } = forecastParts(view.forecast);
    expect(explanation).not.toMatch(/Stima su/);
    expect(nights).toBe(view.forecast.coverage.used);
    expect(forecastParts({ ...view.forecast, explanation: null }).explanation).toBeUndefined();
  });
});
