import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  Heatmap,
  durationBand,
  formatDuration,
  heatmapCellClass,
  type HeatmapCell,
} from '../../src/components/Heatmap';

const c = (minutes: number | null, status: HeatmapCell['status'] = 'confermata'): HeatmapCell => ({ minutes, status });

describe('durationBand', () => {
  it('soglie esatte: 419 pesca, 420 azzurro, 479 azzurro, 480 salvia', () => {
    expect(durationBand(419)).toBe('peach');
    expect(durationBand(420)).toBe('blue');
    expect(durationBand(479)).toBe('blue');
    expect(durationBand(480)).toBe('sage');
    expect(durationBand(0)).toBe('peach');
    expect(durationBand(600)).toBe('sage');
  });

  it('arrotonda come il testo mostrato', () => {
    expect(durationBand(419.6)).toBe('blue');
    expect(durationBand(479.4)).toBe('blue');
  });
});

describe('formatDuration', () => {
  it('scrive "7h 32m" con minuti a due cifre', () => {
    expect(formatDuration(452)).toBe('7h 32m');
    expect(formatDuration(425)).toBe('7h 05m');
    expect(formatDuration(480)).toBe('8h 00m');
    expect(formatDuration(59)).toBe('0h 59m');
  });

  it('valori non validi diventano "—"', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('heatmapCellClass', () => {
  it('fasce, stimata e mancante', () => {
    expect(heatmapCellClass(c(485))).toBe('cell cell-8');
    expect(heatmapCellClass(c(430))).toBe('cell cell-7');
    expect(heatmapCellClass(c(400, 'stimata'))).toBe('cell cell-6 cell-est');
    expect(heatmapCellClass(c(null, 'mancante'))).toBe('cell cell-miss');
    expect(heatmapCellClass(c(450, 'mancante'))).toBe('cell cell-miss');
  });
});

describe('Heatmap', () => {
  const days: HeatmapCell[][] = [
    [c(455), c(485), c(440), c(468)],
    [c(430), c(460), c(475), c(450)],
    [c(445), c(410, 'stimata'), c(455), c(438)],
    [c(470), c(432), c(490), c(465)],
    [c(400), c(415), c(390, 'stimata'), c(418)],
    [c(405), c(425), c(410), c(420)],
    [c(450), c(null, 'mancante'), c(465)],
  ];
  const html = renderToStaticMarkup(<Heatmap days={days} />);

  it('sette righe da lunedì a domenica con nomi completi per i lettori di schermo', () => {
    expect(html.match(/<th scope="row"/g)).toHaveLength(7);
    for (const d of ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']) {
      expect(html).toContain(d);
    }
    expect(html).toContain('Lun');
    expect(html).toContain('Dom');
  });

  it('ogni cella scrive la durata: il colore non è l’unica informazione', () => {
    expect(html).toContain('7h 35m');
    expect(html).toContain('8h 05m');
    expect(html).toContain('6h 30m');
    expect(html.match(/<td/g)).toHaveLength(28);
  });

  it('stimata tratteggiata e dichiarata, mancante punteggiata con "—"; righe corte completate', () => {
    expect(html).toContain('cell cell-6 cell-est');
    expect(html).toContain(', stimata');
    expect(html.match(/cell cell-miss/g)).toHaveLength(3); // 2 celle + legenda
    expect(html).toContain('—');
    expect(html).toContain(', mancante');
  });

  it('legenda con le tre fasce e i segni di stato', () => {
    expect(html).toContain('8h o più');
    expect(html).toContain('7h–8h');
    expect(html).toContain('Meno di 7h');
    expect(html).toContain('Tratteggio = stimata');
    expect(html).toContain('Punti = mancante');
    expect(html).toContain('Ultime 4 settimane, dalla più vecchia.');
  });

  it('usa le classi del design system', () => {
    expect(html).toContain('class="card stack');
    expect(html).toContain('eyebrow');
  });

  it('etichette di colonna personalizzabili', () => {
    const h = renderToStaticMarkup(<Heatmap days={days} weekLabels={['3 settimane fa']} />);
    expect(h).toContain('3 settimane fa');
    expect(h).toContain('Settimana 2');
  });
});
