import { describe, expect, it } from 'vitest';

import {
  AXIS_SPAN_MIN,
  axisPct,
  bandSpan,
  bedToAxis,
  formatBedClock,
  formatClock,
  formatDuration,
  formatSigned,
  nightSpan,
  wakeToAxis,
} from '../../src/components/chartGeometry';

describe('asse 21:00 → 11:00', () => {
  it('converte letto (dalle 18:00) e sveglia (dalla mezzanotte) in minuti sull’asse', () => {
    expect(AXIS_SPAN_MIN).toBe(840);
    expect(bedToAxis(180)).toBe(0); // 21:00
    expect(bedToAxis(330)).toBe(150); // 23:30
    expect(bedToAxis(400)).toBe(220); // 00:40
    expect(wakeToAxis(0)).toBe(180); // 00:00
    expect(wakeToAxis(660)).toBe(840); // 11:00
  });

  it('minuti → percentuale con clamp fuori asse', () => {
    expect(axisPct(0)).toBe(0);
    expect(axisPct(420)).toBe(50);
    expect(axisPct(180)).toBe(21.43);
    expect(axisPct(-60)).toBe(0);
    expect(axisPct(2000)).toBe(100);
    expect(axisPct(Number.NaN)).toBeNull();
  });
});

describe('nightSpan', () => {
  it('posiziona una notte che attraversa la mezzanotte', () => {
    // 23:30 → 07:20: asse 150 → 620
    expect(nightSpan(330, 440)).toEqual({ left: 17.86, width: 55.95, clippedStart: false, clippedEnd: false });
  });

  it('notte tutta dopo la mezzanotte', () => {
    // 01:00 → 09:00: asse 240 → 720
    expect(nightSpan(420, 540)).toEqual({ left: 28.57, width: 57.14, clippedStart: false, clippedEnd: false });
  });

  it('taglia ai bordi gli orari fuori asse', () => {
    // 20:00 → 12:30: asse −60 → 930
    const s = nightSpan(120, 750);
    expect(s).toEqual({ left: 0, width: 100, clippedStart: true, clippedEnd: true });
  });

  it('se la sveglia cadrebbe prima del letto la sposta al giorno dopo', () => {
    // letto 03:00 (asse 360), sveglia 02:00 (asse 300) → giorno dopo, fuori asse a destra
    const s = nightSpan(540, 120);
    expect(s?.left).toBeCloseTo(42.86, 2);
    expect(s?.width).toBeCloseTo(57.14, 2);
    expect(s?.clippedEnd).toBe(true);
  });

  it('dati mancanti o non finiti → null, mai NaN', () => {
    expect(nightSpan(null, 440)).toBeNull();
    expect(nightSpan(330, null)).toBeNull();
    expect(nightSpan(Number.NaN, 440)).toBeNull();
    expect(nightSpan(330, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('bandSpan', () => {
  it('mediana ± 30 min', () => {
    // centro 23:00 = asse 120 → 90..150
    expect(bandSpan(120)).toEqual({ left: 10.71, width: 7.15, clippedStart: false, clippedEnd: false });
  });
  it('taglia la fascia al bordo dell’asse', () => {
    expect(bandSpan(10)).toEqual({ left: 0, width: 4.76, clippedStart: true, clippedEnd: false });
    expect(bandSpan(null)).toBeNull();
  });
});

describe('formattazione', () => {
  it('scarto con segno e meno tipografico U+2212', () => {
    expect(formatSigned(12)).toBe('+12');
    expect(formatSigned(-8)).toBe('−8');
    expect(formatSigned(-0.3)).toBe('0');
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(null)).toBeNull();
    expect(formatSigned(Number.NaN)).toBeNull();
  });

  it('orari e durate', () => {
    expect(formatClock(1428)).toBe('23:48');
    expect(formatClock(1440 + 40)).toBe('00:40');
    expect(formatClock(-20)).toBe('23:40');
    expect(formatBedClock(330)).toBe('23:30');
    expect(formatBedClock(400)).toBe('00:40');
    expect(formatDuration(452)).toBe('7h 32m');
    expect(formatDuration(65)).toBe('1h 05m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(-10)).toBe('0m');
    expect(formatDuration(Number.NaN)).toBeNull();
  });
});
