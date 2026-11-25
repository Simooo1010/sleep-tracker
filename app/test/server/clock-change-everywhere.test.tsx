import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { nightDuration } from '../../src/domain/sleep-balance';
import { Calendar } from '../../src/components/Calendar';
import { buildChartsView, buildHistoryView, buildNightView, buildRegularityView } from '../../src/server/views';
import { clockChangesOf } from '../../src/app/storico/HistoryScreen';
import { buildDataset, makeNight } from './views/fixtures';

// Le notti già presenti sono salvate come istanti (UTC): il cambio d'ora non richiede nessuna migrazione,
// la durata è sempre la differenza reale e il segno del cambio si calcola dalla data.
describe('dati già presenti attraverso i due cambi d’ora', () => {
  it('ritorno all’ora solare 2026-10-25: 23:30 → 07:30 sono 9 ore; le notti vicine no', () => {
    expect(nightDuration(makeNight('2026-10-25', '23:30', '07:30'))).toBe(540);
    expect(nightDuration(makeNight('2026-10-24', '23:30', '07:30'))).toBe(480);
    expect(nightDuration(makeNight('2026-10-26', '23:30', '07:30'))).toBe(480);
  });

  it('passaggio all’ora legale 2026-03-29: 23:30 → 07:30 sono 7 ore', () => {
    expect(nightDuration(makeNight('2026-03-29', '23:30', '07:30'))).toBe(420);
    expect(nightDuration(makeNight('2026-03-28', '23:30', '07:30'))).toBe(480);
    expect(nightDuration(makeNight('2026-03-30', '23:30', '07:30'))).toBe(480);
  });

  it('un orario inesistente (02:30 del 29 marzo) non rompe nulla: la notte resta positiva', () => {
    const n = makeNight('2026-03-29', '23:00', '02:30');
    expect(nightDuration(n)).toBeGreaterThan(0);
  });
});

describe('Storico: giorno del cambio segnato nel calendario', () => {
  const nights = [
    ...buildDataset(30, '2026-09-27').nights.filter((n) => n.nightDate !== '2026-10-25'),
    makeNight('2026-10-25', '23:30', '07:30', { quality: 4, energy: 5 }),
  ];

  it('ottobre 2026: solo il 25 è segnato (+60), con etichetta, tag e frase nel dettaglio', () => {
    const v = buildHistoryView({ today: '2026-10-26', nights, selectedDate: '2026-10-25' });
    expect(clockChangesOf(v)).toEqual({ '2026-10-25': 60 });
    expect(v.cells.find((c) => c.day === 25)?.ariaLabel).toContain("cambio d'ora");
    expect(v.cells.find((c) => c.day === 24)?.ariaLabel).not.toContain("cambio d'ora");
    expect(v.detail?.tags).toContain("Cambio d'ora: +1 h");
    expect(v.detail?.note).toContain("In quella notte è cambiata l'ora (+1 ora). Cambio applicato");
  });

  it('marzo 2026: il 29 è segnato (−60), ora andata avanti', () => {
    const v = buildHistoryView({ today: '2026-04-02', nights: [], month: '2026-03', selectedDate: '2026-03-29' });
    expect(clockChangesOf(v)).toEqual({ '2026-03-29': -60 });
    expect(v.detail?.tags).toContain("Cambio d'ora: −1 h");
    expect(v.detail?.note).toContain('(−1 ora)');
  });

  it('il giorno del cambio è segnato anche se la notte non ha dati', () => {
    const v = buildHistoryView({ today: '2026-04-02', nights: [], month: '2026-03', selectedDate: '2026-03-29' });
    expect(v.detail?.status).toBe('mancante');
    expect(v.detail?.note).toContain('Cambio applicato');
  });

  it('segna anche i prossimi cambi (giorno futuro)', () => {
    const v = buildHistoryView({ today: '2026-10-26', nights, month: '2026-10' });
    expect(v.cells.filter((c) => c.clockShiftMin !== 0)).toHaveLength(1);
    const next = buildHistoryView({ today: '2026-03-10', nights: [], month: '2026-03' });
    const cell = next.cells.find((c) => c.day === 29);
    expect(cell).toMatchObject({ future: true, clockShiftMin: -60 });
    expect(cell?.ariaLabel).toContain("cambio d'ora");
  });

  it('il Calendar mostra il segno vettoriale, l’etichetta del giorno e la legenda', () => {
    const html = renderToStaticMarkup(
      <Calendar
        year={2026}
        month={10}
        nights={[{ date: '2026-10-25', minutes: 540, status: 'confermata' }]}
        today="2026-10-26"
        clockChanges={{ '2026-10-25': 60 }}
      />,
    );
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain("domenica 25 ottobre, 9h 00m, confermata, cambio d&#x27;ora: un&#x27;ora in più");
    expect(html).toContain('Orologio = cambio d&#x27;ora');
    const without = renderToStaticMarkup(<Calendar year={2026} month={10} nights={[]} today="2026-10-26" />);
    expect(without).not.toContain('<svg');
    expect(without).not.toContain('Orologio');
  });
});

describe('Regolarità e Grafici: nota sul cambio d’ora', () => {
  const ds = buildDataset(30, '2026-09-27');

  it('Regolarità il 25 ottobre: nota con il cambio applicato; il 24 e il 12 novembre no', () => {
    const v = buildRegularityView({ today: '2026-10-25', nights: ds.nights });
    expect(v.clockChangeNote).toBe(
      "Il 25 ottobre l'ora è tornata indietro di 1 ora. Cambio applicato: gli orari sono quelli dell'orologio, le durate sono reali.",
    );
    expect(buildRegularityView({ today: '2026-10-24', nights: ds.nights }).clockChangeNote).toBeNull();
    expect(buildRegularityView({ today: '2026-11-12', nights: ds.nights }).clockChangeNote).toBeNull();
  });

  it('Regolarità dopo il passaggio all’ora legale dice che l’ora è andata avanti', () => {
    const v = buildRegularityView({ today: '2026-04-02', nights: [] });
    expect(v.clockChangeNote).toContain("Il 29 marzo l'ora è andata avanti di 1 ora");
  });

  it('Grafici: la barra del 25 ottobre è segnata, le altre no, con la frase sotto il grafico', () => {
    const v = buildChartsView({ today: '2026-10-25', nights: ds.nights });
    const marked = v.duration.bars.filter((b) => b.clockChange);
    expect(marked.map((b) => b.nightDate)).toEqual(['2026-10-25']);
    expect(marked[0]?.title).toContain("cambio d'ora");
    expect(v.duration.clockChangeNote).toContain('Il 25 ottobre');
    const other = buildChartsView({ today: '2026-10-24', nights: ds.nights });
    expect(other.duration.clockChangeNote).toBeNull();
    expect(other.duration.bars.some((b) => b.clockChange)).toBe(false);
  });
});

describe('Notte: stanotte cambia l’ora', () => {
  it('la nota compare anche senza dati e dice che il cambio è applicato', () => {
    const v = buildNightView({ today: '2026-10-25', nights: [] });
    expect(v.clockChangeNote).toContain('Cambio d\'ora applicato');
  });
});
