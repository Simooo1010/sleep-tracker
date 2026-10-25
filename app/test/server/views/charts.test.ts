import { describe, expect, it } from 'vitest';
import { computeCorrelations } from '../../../src/domain/correlations';
import { DEFAULT_FACTORS } from '../../../src/domain/questions';
import { durationStats, sleepDebt } from '../../../src/domain/sleep-balance';
import { buildChartsView } from '../../../src/server/views';
import { formatHm } from '../../../src/server/views/format';
import { TODAY, datasetWithTonight, expectSerializable, makeNight } from './fixtures';

describe('buildChartsView: dataset completo', () => {
  const ds = datasetWithTonight();
  const v = buildChartsView({ today: TODAY, nights: ds.nights, naps: ds.naps, eveningChecks: ds.checks });

  it('DurationChart: 14 notti, obiettivo, chip con medie e debito', () => {
    expect(v.empty).toBe(false);
    expect(v.duration.bars).toHaveLength(14);
    expect(v.duration.bars[0]?.nightDate).toBe('2026-10-11');
    expect(v.duration.bars[13]).toMatchObject({ dayLabel: '24', status: 'stimata', durationText: '7h 32m' });
    expect(v.duration.bars[13]?.title).toBe('24 ottobre · 7h 32m');
    const gap = v.duration.bars.find((b) => b.nightDate === '2026-10-14');
    expect(gap).toMatchObject({ status: 'mancante', heightPct: 10, band: null, title: '14 ottobre · mancante' });
    expect(v.duration.targetPct).toBe(83.33);
    expect(v.duration.targetText).toBe('Linea tratteggiata = obiettivo 7h 30m');
    const ds7 = durationStats(ds.nights, TODAY);
    const debt = sleepDebt(ds.nights, TODAY);
    expect(v.duration.chips.map((c) => c.text)).toEqual([
      `Media 7 notti ${formatHm(ds7.avg7.value)}`,
      `Media del mese ${formatHm(ds7.avgMonth.value)}`,
      `Debito accumulato ${formatHm(debt.value)}`,
      'Obiettivo 7h 30m',
    ]);
    expect(v.duration.coverage.text).toBe('Calcolata su 12 su 14 notti');
  });

  it('Heatmap: sette righe Lun–Dom, quattro celle con la durata scritta', () => {
    expect(v.heatmap.rows.map((r) => r.dayLabel)).toEqual(['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']);
    expect(v.heatmap.rows.every((r) => r.cells.length === 4)).toBe(true);
    for (const r of v.heatmap.rows) {
      for (const c of r.cells) expect(c.text === '—' || /^\d+h\d\d$/.test(c.text)).toBe(true);
    }
    const mar = v.heatmap.rows[1];
    expect(mar?.cells.find((c) => c.nightDate === '2026-10-06')).toMatchObject({ text: '—', status: 'mancante', band: null });
    expect(v.heatmap.legend).toContain('Tratteggio = stimata');
  });

  it('CorrelationTable: segno e virgola, "ne servono 5", indizi non cause', () => {
    const corr = computeCorrelations(ds.nights, ds.checks, [...DEFAULT_FACTORS]);
    expect(v.correlations.hidden).toBe(false);
    expect(v.correlations.columns.map((c) => c.label)).toEqual(['Qualità', 'Energia', 'Umore']);
    expect(v.correlations.rows.map((r) => r.label)).toEqual([
      'Schermo a letto',
      'Sport',
      'Giornata stressante',
      'Cena tardi',
      'Alcol',
      'Mal di testa',
    ]);
    const screen = v.correlations.rows[0]!;
    expect(screen.enough).toBe(true);
    expect(screen.countText).toBe(`10 notti su ${corr.coverage.used}`);
    const q = corr.value!.find((c) => c.factor === 'schermo-a-letto' && c.outcome === 'quality')!;
    expect(screen.cells[0]?.text).toBe(
      q.diff === 0 ? '0,0' : `${q.diff! < 0 ? '−' : '+'}${Math.abs(q.diff!).toFixed(1).replace('.', ',')}`,
    );
    expect(screen.cells.every((c) => /^([+−]\d,\d|0,0)$/.test(c.text))).toBe(true);
    const dinner = v.correlations.rows.find((r) => r.factor === 'cena-tardi')!;
    expect(dinner).toMatchObject({ enough: false, countText: '0 notti, ne servono 5' });
    expect(dinner.cells.map((c) => c.text)).toEqual(['—', '—', '—']);
    expect(dinner.cells.every((c) => c.tone === 'neutral')).toBe(true);
    expect(v.correlations.footnote).toBe('Sono indizi, non cause.');
    expect(JSON.stringify(v.correlations)).not.toMatch(/causa|provoca|colpa/);
  });

  it('trend mensile: sei mesi, mancanti a "—"', () => {
    expect(v.monthly.bars.map((b) => b.label)).toEqual(['mag', 'giu', 'lug', 'ago', 'set', 'ott']);
    expect(v.monthly.bars[0]).toMatchObject({ valueText: '—', nights: 0, heightPct: 0 });
    expect(v.monthly.bars[5]?.current).toBe(true);
    expect(v.monthly.bars[5]?.valueText).toMatch(/^\d+h\d\d$/);
  });

  it('previsione di energia: stima su N notti, mai certezza', () => {
    expect(v.forecast.hidden).toBe(false);
    expect(v.forecast.badge).toBe('Previsione');
    expect(v.forecast.kicker).toBe('Domani mattina');
    expect(v.forecast.scoreText).toMatch(/^Energia [1-5] su 5$/);
    expect(v.forecast.moon).toBe(Math.round(v.forecast.score!));
    expect(v.forecast.explanation).toMatch(
      /^Nei tuoi giorni simili l'energia è stata in media \d,\d su 5 \((bassa|media|alta)\)\. Stima su \d+ notti\.$/,
    );
  });

  it('sonnellini: statistiche e lista', () => {
    expect(v.naps.tiles.map((t) => t.label)).toEqual(['Frequenza', 'Durata media', 'Orario tipico', 'Effetto sul letto']);
    expect(v.naps.tiles[0]?.value).toMatch(/^\d+ su 14$/);
    expect(v.naps.tiles[0]?.coverage.text).toBe('Calcolata su 14 su 14 giorni');
    expect(v.naps.tiles[1]?.value).toMatch(/^\d+ min$/);
    expect(v.naps.tiles[2]?.value).toMatch(/^1[45]:\d\d$/);
    expect(v.naps.list.length).toBeLessThanOrEqual(5);
    const fromCheck = v.naps.list.find((n) => n.date === '2026-10-21');
    expect(fromCheck).toMatchObject({ rangeText: 'Orario non noto', durationText: '30 min', provenanceWord: 'Confermato' });
    const real = v.naps.list.find((n) => n.provenanceWord === 'Automatico');
    expect(real?.rangeText).toMatch(/^\d\d:\d\d–\d\d:\d\d$/);
  });

  it('serializzabile', () => {
    expectSerializable(v);
  });
});

describe('buildChartsView: sotto soglia e vuoto', () => {
  it('poche notti: correlazioni e previsione nascoste con il motivo', () => {
    const nights = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].map((d) =>
      makeNight(d, '23:30', '06:40', { quality: 3, energy: 3 }),
    );
    const v = buildChartsView({ today: TODAY, nights });
    expect(v.empty).toBe(false);
    expect(v.correlations).toMatchObject({ hidden: true, rows: [], hiddenText: 'Servono almeno 14 notti. Per ora ne hai 5.' });
    expect(v.forecast).toMatchObject({
      hidden: true,
      scoreText: 'Energia —',
      hiddenText: 'Servono almeno 10 notti con energia. Per ora ne hai 5.',
    });
    // 7h 10m < 7h 30m: il debito c'è ed è scritto.
    expect(v.duration.chips[2]?.text).toBe('Debito accumulato 1h 40m');
    expect(v.duration.bars[13]?.band).toBe('blue');
    expect(v.naps.emptyText).toBe('Nessun sonnellino negli ultimi 14 giorni.');
    expect(v.naps.tiles[1]).toMatchObject({ hidden: true, value: '—', hiddenText: 'Nessun sonnellino negli ultimi 14 giorni.' });
    expectSerializable(v);
  });

  it('nessun dato: empty e testo dedicato', () => {
    const v = buildChartsView({ today: TODAY, nights: [] });
    expect(v.empty).toBe(true);
    expect(v.emptyText).toBe('I grafici compaiono dopo le prime notti registrate. Nessuna fretta.');
    expect(v.duration.hidden).toBe(true);
    expect(v.duration.chips.map((c) => c.text)).toEqual([
      'Media 7 notti —',
      'Media del mese —',
      'Debito accumulato —',
      'Obiettivo 7h 30m',
    ]);
    expect(v.heatmap.hidden).toBe(true);
    expect(v.monthly.hidden).toBe(true);
    expectSerializable(v);
  });
});
