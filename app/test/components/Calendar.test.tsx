import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  Calendar,
  addDays,
  buildMonthGrid,
  dayAriaLabel,
  dayCellClass,
  daysInMonth,
  durationBand,
  formatDayLabel,
  formatDuration,
  formatDurationCompact,
  monthTitle,
  nextFocusDate,
  weekdayIndex,
  type CalendarNight,
} from '../../src/components/Calendar';

describe('date', () => {
  it('giorno della settimana da lunedì', () => {
    expect(weekdayIndex('2026-10-26')).toBe(0); // lunedì
    expect(weekdayIndex('2026-10-24')).toBe(5); // sabato
    expect(weekdayIndex('2026-10-25')).toBe(6); // domenica
  });

  it('giorni nel mese, anno bisestile incluso', () => {
    expect(daysInMonth(2026, 10)).toBe(31);
    expect(daysInMonth(2026, 11)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });

  it('addDays attraversa mesi e anni', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('etichette in italiano', () => {
    expect(formatDayLabel('2026-10-24')).toBe('sabato 24 ottobre');
    expect(monthTitle(2026, 10)).toBe('Ottobre 2026');
  });
});

describe('buildMonthGrid', () => {
  it('ottobre 2026: inizia giovedì, 5 settimane, giorni fuori mese', () => {
    const g = buildMonthGrid(2026, 10);
    expect(g).toHaveLength(5);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g[0]?.[0]).toEqual({ date: '2026-09-28', day: 28, inMonth: false });
    expect(g[0]?.[3]).toEqual({ date: '2026-10-01', day: 1, inMonth: true });
    expect(g[4]?.[5]).toEqual({ date: '2026-10-31', day: 31, inMonth: true });
    expect(g[4]?.[6]).toEqual({ date: '2026-11-01', day: 1, inMonth: false });
    expect(g.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });

  it('ogni riga inizia di lunedì', () => {
    for (const [y, m] of [[2026, 10], [2026, 2], [2024, 2], [2026, 3], [2025, 6]] as const) {
      for (const w of buildMonthGrid(y, m)) expect(weekdayIndex(w[0]!.date)).toBe(0);
    }
  });

  it('febbraio di 28 giorni che inizia di lunedì: 4 settimane senza giorni fuori mese', () => {
    const g = buildMonthGrid(2021, 2);
    expect(g).toHaveLength(4);
    expect(g.flat().every((d) => d.inMonth)).toBe(true);
  });

  it('febbraio bisestile 2024: 29 giorni, fino a domenica 3 marzo', () => {
    const g = buildMonthGrid(2024, 2);
    expect(g.flat().filter((d) => d.inMonth)).toHaveLength(29);
    expect(g.at(-1)?.at(-1)).toEqual({ date: '2024-03-03', day: 3, inMonth: false });
  });

  it('mese di 30 giorni che inizia di domenica: 6 settimane', () => {
    const g = buildMonthGrid(2026, 11); // 1 novembre 2026 è domenica
    expect(g).toHaveLength(6);
    expect(g.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });

  it('mese di 31 giorni che inizia di sabato: 6 settimane', () => {
    const g = buildMonthGrid(2026, 8); // 1 agosto 2026 è sabato
    expect(g).toHaveLength(6);
  });
});

describe('durate', () => {
  it('fascia: 419 pesca, 420 azzurro, 479 azzurro, 480 salvia', () => {
    expect(durationBand(419)).toBe('peach');
    expect(durationBand(420)).toBe('blue');
    expect(durationBand(479)).toBe('blue');
    expect(durationBand(480)).toBe('sage');
  });

  it('"7h 32m" e forma compatta "7h32"', () => {
    expect(formatDuration(452)).toBe('7h 32m');
    expect(formatDuration(425)).toBe('7h 05m');
    expect(formatDurationCompact(452)).toBe('7h32');
    expect(formatDurationCompact(425)).toBe('7h05');
    expect(formatDuration(null)).toBe('—');
    expect(formatDurationCompact(-1)).toBe('—');
  });

  it('classi della cella', () => {
    expect(dayCellClass({ date: 'x', minutes: 490, status: 'confermata' })).toBe('cell cell-8');
    expect(dayCellClass({ date: 'x', minutes: 452, status: 'stimata' })).toBe('cell cell-7 cell-est');
    expect(dayCellClass({ date: 'x', minutes: 419, status: 'confermata' })).toBe('cell cell-6');
    expect(dayCellClass({ date: 'x', minutes: null, status: 'mancante' })).toBe('cell cell-miss');
    expect(dayCellClass(undefined)).toBe('cell cell-miss');
  });
});

describe('dayAriaLabel', () => {
  it('etichetta completa', () => {
    expect(dayAriaLabel('2026-10-24', { date: '2026-10-24', minutes: 452, status: 'confermata' })).toBe(
      'sabato 24 ottobre, 7h 32m, confermata',
    );
    expect(dayAriaLabel('2026-10-03', { date: '2026-10-03', minutes: 435, status: 'stimata' })).toBe(
      'sabato 3 ottobre, 7h 15m, stimata',
    );
    expect(dayAriaLabel('2026-10-04', undefined)).toBe('domenica 4 ottobre, mancante');
    expect(dayAriaLabel('2026-10-26', undefined, true)).toBe('lunedì 26 ottobre, giorno futuro');
  });
});

describe('nextFocusDate', () => {
  const first = '2026-10-01';
  const last = '2026-10-24';
  it('frecce: ±1 giorno, ±1 settimana', () => {
    expect(nextFocusDate('2026-10-15', 'ArrowLeft', first, last)).toBe('2026-10-14');
    expect(nextFocusDate('2026-10-15', 'ArrowRight', first, last)).toBe('2026-10-16');
    expect(nextFocusDate('2026-10-15', 'ArrowUp', first, last)).toBe('2026-10-08');
    expect(nextFocusDate('2026-10-15', 'ArrowDown', first, last)).toBe('2026-10-22');
  });

  it('Home e End: inizio e fine della settimana', () => {
    expect(nextFocusDate('2026-10-15', 'Home', first, last)).toBe('2026-10-12');
    expect(nextFocusDate('2026-10-15', 'End', first, last)).toBe('2026-10-18');
  });

  it('resta nel mese e non va nel futuro', () => {
    expect(nextFocusDate('2026-10-01', 'ArrowLeft', first, last)).toBe(first);
    expect(nextFocusDate('2026-10-03', 'ArrowUp', first, last)).toBe(first);
    expect(nextFocusDate('2026-10-20', 'ArrowDown', first, last)).toBe(last);
    expect(nextFocusDate('2026-10-24', 'ArrowRight', first, last)).toBe(last);
  });

  it('altri tasti: null', () => {
    expect(nextFocusDate('2026-10-15', 'Enter', first, last)).toBeNull();
    expect(nextFocusDate('2026-10-15', 'a', first, last)).toBeNull();
  });
});

describe('Calendar', () => {
  const nights: CalendarNight[] = [
    { date: '2026-10-01', minutes: 435, status: 'confermata' },
    { date: '2026-10-03', minutes: 462, status: 'stimata' },
    { date: '2026-10-07', minutes: null, status: 'mancante' },
    { date: '2026-10-13', minutes: 490, status: 'confermata' },
    { date: '2026-10-14', minutes: 410, status: 'confermata' },
    {
      date: '2026-10-23',
      minutes: 452,
      status: 'confermata',
      start: '23:48',
      end: '07:20',
      note: 'Inizio da Riposo, sveglia interrotta.',
      tags: ['Qualità 4 su 5', 'Energia 3 su 5', 'Notte del weekend'],
    },
    { date: '2026-10-24', minutes: 452, status: 'stimata' },
  ];
  const html = renderToStaticMarkup(
    <Calendar year={2026} month={10} nights={nights} today="2026-10-24" defaultSelectedDate="2026-10-23" />,
  );

  it('titolo, intestazioni da lunedì e griglia accessibile', () => {
    expect(html).toContain('Ottobre 2026');
    expect(html).toContain('role="grid"');
    expect(html.match(/role="columnheader"/g)).toHaveLength(7);
    expect(html).toContain('aria-label="lunedì"');
    expect(html.match(/role="row"/g)).toHaveLength(6); // intestazione + 5 settimane
  });

  it('un pulsante per ogni giorno passato, con aria-label completo', () => {
    expect(html.match(/<button/g)).toHaveLength(24);
    expect(html).toContain('aria-label="venerdì 23 ottobre, 7h 32m, confermata"');
    expect(html).toContain('aria-label="sabato 24 ottobre, 7h 32m, stimata"');
    expect(html).toContain('aria-label="mercoledì 7 ottobre, mancante"');
    expect(html).toContain('aria-label="venerdì 2 ottobre, mancante"');
  });

  it('giorni futuri disabilitati, non pulsanti', () => {
    expect(html).toContain('aria-label="domenica 25 ottobre, giorno futuro"');
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(7);
  });

  it('durata scritta in forma estesa e compatta, fasce e stati', () => {
    expect(html).toContain('8h 10m');
    expect(html).toContain('8h10');
    expect(html).toContain('cell cell-8');
    expect(html).toContain('cell cell-7 cell-est');
    expect(html).toContain('cell cell-6');
    expect(html).toContain('cell cell-miss');
  });

  it('selezione: un solo giorno selezionato e unico tabindex 0 (roving)', () => {
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(23);
    expect(html).toContain('aria-current="date"');
  });

  it('dettaglio della notte selezionata', () => {
    expect(html).toContain('venerdì 23 ottobre');
    expect(html).toContain('23:48 → 07:20');
    expect(html).toContain('badge badge-confirmed');
    expect(html).toContain('>Confermata<');
    expect(html).toContain('Qualità 4 su 5');
    expect(html).toContain('Inizio da Riposo, sveglia interrotta.');
    expect(html).toContain('aria-live="polite"');
  });

  it('legenda con parole, non solo colore', () => {
    for (const t of ['Verde 8h+', 'Azzurro 7–8h', 'Pesca meno di 7h', 'Tratteggio = stimata', 'Punti = mancante']) {
      expect(html).toContain(t);
    }
  });

  it('selezione controllata su un giorno senza dati: mancante', () => {
    const h = renderToStaticMarkup(
      <Calendar year={2026} month={10} nights={nights} today="2026-10-24" selectedDate="2026-10-02" />,
    );
    expect(h).toContain('badge badge-missing');
    expect(h).toContain('Nessun dato per questa notte.');
  });

  it('senza selezione invita a scegliere; tabindex 0 su oggi', () => {
    const h = renderToStaticMarkup(<Calendar year={2026} month={10} nights={nights} today="2026-10-24" />);
    expect(h).toContain('Scegli un giorno per vedere la notte.');
    expect(h).toMatch(/tabindex="0" aria-label="sabato 24 ottobre/);
  });

  it('mese interamente passato senza today: tutti selezionabili', () => {
    const h = renderToStaticMarkup(<Calendar year={2024} month={2} nights={[]} />);
    expect(h.match(/<button/g)).toHaveLength(29);
    expect(h).toContain('Febbraio 2024');
  });
});
