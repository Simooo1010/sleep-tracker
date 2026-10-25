import { describe, expect, it } from 'vitest';
import { computeBaseline } from '../../../src/domain/baseline';
import { regularityStats } from '../../../src/domain/deviations';
import { computeSocialJetlag } from '../../../src/domain/social-jetlag';
import { buildRegularityView } from '../../../src/server/views';
import { formatSignedMin } from '../../../src/server/views/format';
import { TODAY, buildDataset, datasetWithTonight, expectSerializable, makeNight } from './fixtures';

describe('buildRegularityView: 30 notti con buchi ed eccezioni', () => {
  const ds = datasetWithTonight();
  const v = buildRegularityView({ today: TODAY, nights: ds.nights });
  const baseline = computeBaseline(ds.nights, TODAY);
  const reg = regularityStats(ds.nights, baseline.value!, TODAY);

  it('riferimento: mediana a 14 giorni', () => {
    expect(v.baseline).toMatchObject({ hidden: false, hiddenText: null, bedText: '23:35', wakeText: '07:05' });
    expect(v.baseline.coverage.text).toBe('Calcolata su 11 su 14 notti');
  });

  it('14 notti + stanotte, con scarti OK/Fuori a parole', () => {
    expect(v.rows).toHaveLength(15);
    expect(v.rows[0]?.nightDate).toBe('2026-10-10');
    expect(v.rows[0]?.dayLabel).toBe('S 10');
    const today = v.rows[14];
    expect(today).toMatchObject({ dayLabel: 'Oggi', isToday: true, status: 'stimata', statusWord: 'Stimata' });
    expect(today).toMatchObject({ devText: '+13 / +15', bedDevText: '+13 min', toleranceWord: 'OK', tolerance: 'ok' });
    const gap = v.rows.find((r) => r.nightDate === '2026-10-14');
    expect(gap).toMatchObject({ status: 'mancante', statusWord: 'Mancante', bar: null, durationText: '—', toleranceWord: '—' });
    const missing = v.rows.find((r) => r.nightDate === '2026-10-18');
    expect(missing).toMatchObject({ status: 'mancante', bar: null, devText: '—' });
    const exc = v.rows.find((r) => r.nightDate === '2026-10-12');
    expect(exc).toMatchObject({ isException: true, tolerance: 'eccezione', toleranceWord: 'Eccezione' });
    expect(exc?.bar).not.toBeNull(); // visibile, ma fuori dal riferimento
    const out = v.rows.find((r) => r.nightDate === '2026-10-10');
    expect(out).toMatchObject({ toleranceWord: 'Fuori', devText: '+69 / +61' });
    expect(v.rows.every((r) => r.devText === '—' || r.devText.includes(' / '))).toBe(true);
  });

  it('fasce di tolleranza ±30 min e tacche delle ore', () => {
    expect(v.bands).not.toBeNull();
    expect(v.bands?.bedMedianText).toBe('23:35');
    expect(v.bands?.bedWidthPct).toBeCloseTo((60 / 840) * 100, 1);
    expect(v.bands?.wakeWidthPct).toBeCloseTo((60 / 840) * 100, 1);
    expect(v.ticks.map((t) => t.label)).toEqual(['21', '00', '03', '06', '09']);
    expect(v.ticks.map((t) => t.pct)).toEqual([0, 21.43, 42.86, 64.29, 85.71]);
  });

  it('copertura "N su 14 notti" e titolo', () => {
    const tol = reg.withinTolerance.value!;
    expect(v.headline.big).toBe(`${tol.count} su ${tol.of}`);
    expect(v.headline.big).toBe('8 su 11');
    expect(v.headline.coverage.shortText).toBe('11 su 14 notti');
    expect(v.headline.coverage.marks).toHaveLength(14);
    expect(v.headline.excludedText).toBe('1 eccezione esclusa');
    expect(v.headline.driftChip).toBe('Deriva −10 min in 3 settimane');
  });

  it('cinque StatTile', () => {
    expect(v.tiles.map((t) => t.label)).toEqual([
      'Scarto letto',
      'Scarto sveglia',
      'Nella tolleranza',
      'Punto medio',
      'Social jet lag',
    ]);
    expect(v.tiles[0]?.value).toBe(`± ${Math.round(reg.stdBed.value!)} min`);
    expect(v.tiles[2]?.value).toBe('8 su 11');
    expect(v.tiles[3]?.value).toMatch(/^0[0-9]:[0-5][0-9]$/);
    const sjl = computeSocialJetlag(ds.nights, TODAY).value!;
    expect(v.tiles[4]?.value).toBe(formatSignedMin(sjl.sjlMin));
    expect(v.tiles.every((t) => !t.hidden)).toBe(true);
  });

  it('deriva: sei settimane, badge e frase', () => {
    expect(v.drift.hidden).toBe(false);
    expect(v.drift.badge).toBe('−10 min in 3 settimane');
    expect(v.drift.exceeds).toBe(false);
    expect(v.drift.bars.map((b) => b.label)).toEqual(['5 sett. fa', '4', '3', '2', '1', 'Ora']);
    expect(v.drift.bars[5]?.current).toBe(true);
    expect(v.drift.bars[0]?.valueText).toBe('—'); // settimana senza abbastanza notti: resta mancante
    expect(v.drift.text).toBe('La mediana del tuo orario di letto si è spostata da 23:40 a 23:30.');
  });

  it('feriali contro weekend e social jet lag', () => {
    expect(v.weekWeekend.hidden).toBe(false);
    expect(v.weekWeekend.rows.map((r) => r.label)).toEqual(['Letto', 'Sveglia', 'Punto medio']);
    expect(v.weekWeekend.sjlText).toBe(`Social jet lag ${v.tiles[4]?.value}`);
    expect(v.weekWeekend.note).toBe('Weekend = notti di venerdì e sabato.');
    expect(v.weekWeekend.coverage.text).toMatch(/^Calcolata su \d+ su 28 notti$/);
  });

  it('serializzabile', () => {
    expectSerializable(v);
  });
});

describe('buildRegularityView: sotto soglia e vuoto', () => {
  it('poche notti: stati nascosti con "Servono almeno N notti. Per ora ne hai M."', () => {
    const nights = [
      makeNight('2026-10-21', '23:30', '07:10'),
      makeNight('2026-10-22', '23:40', '07:05'),
      makeNight('2026-10-23', '23:20', '07:00'),
    ];
    const v = buildRegularityView({ today: TODAY, nights });
    expect(v.empty).toBe(false);
    expect(v.baseline).toMatchObject({ hidden: true, hiddenText: 'Servono almeno 5 notti. Per ora ne hai 3.', bedText: '—' });
    expect(v.headline).toMatchObject({ hidden: true, big: '—', hiddenText: 'Servono almeno 5 notti. Per ora ne hai 3.' });
    expect(v.bands).toBeNull();
    expect(v.tiles.slice(0, 4).every((t) => t.hidden && t.hiddenText === 'Servono almeno 5 notti. Per ora ne hai 3.')).toBe(
      true,
    );
    expect(v.tiles[4]?.hiddenText).toBe(
      'Servono almeno 3 notti nel weekend e 5 nei giorni feriali. Per ora ne hai 0 e 3.',
    );
    expect(v.drift).toMatchObject({ hidden: true, bars: [], hiddenText: 'Servono almeno 3 settimane di dati. Per ora ne hai 1.' });
    expect(v.weekWeekend.hidden).toBe(true);
    expect(v.rows.filter((r) => r.bar !== null)).toHaveLength(3);
    expect(v.rows.every((r) => r.toleranceWord === '—')).toBe(true);
    expectSerializable(v);
  });

  it('nessuna notte: empty e testo dedicato', () => {
    const v = buildRegularityView({ today: TODAY, nights: [] });
    expect(v.empty).toBe(true);
    expect(v.emptyText).toBe('Ancora nessuna notte con orari. Le barre compaiono dalla prima notte registrata.');
    expect(v.rows).toHaveLength(15);
    expect(v.rows.every((r) => r.status === 'mancante')).toBe(true);
    expectSerializable(v);
  });

  it('cambio d’ora: la notte del 25 ottobre resta coerente', () => {
    const ds = buildDataset(30, '2026-09-27'); // fino al 26 ottobre, include la notte del 25
    const nights = [
      ...ds.nights.filter((n) => n.nightDate !== '2026-10-25'),
      makeNight('2026-10-25', '23:30', '07:30'),
    ];
    const v = buildRegularityView({ today: '2026-10-26', nights });
    const dst = v.rows.find((r) => r.nightDate === '2026-10-25');
    expect(dst?.durationText).toBe('9h 00m');
    // Sull'orologio la barra va dalle 23:30 alle 07:30: 480 min di asse.
    expect(dst?.bar?.widthPct).toBeCloseTo((480 / 840) * 100, 1);
    expect(dst?.bedDevText).toMatch(/^([+−]\d+|0) min$/);
    expectSerializable(v);
  });
});
