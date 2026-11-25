import { describe, expect, it } from 'vitest';

import { clockChangeShiftMin, clockChangeText } from '../../src/domain/clock-change';

describe('clockChangeShiftMin', () => {
  it('ritorno all’ora solare: la notte è 1 ora più lunga (+60)', () => {
    expect(clockChangeShiftMin('2026-10-25')).toBe(60);
    expect(clockChangeShiftMin('2027-10-31')).toBe(60);
    expect(clockChangeShiftMin('2028-10-29')).toBe(60);
  });

  it('passaggio all’ora legale: la notte è 1 ora più corta (−60)', () => {
    expect(clockChangeShiftMin('2026-03-29')).toBe(-60);
    expect(clockChangeShiftMin('2027-03-28')).toBe(-60);
    expect(clockChangeShiftMin('2028-03-26')).toBe(-60);
  });

  it('le notti vicine non hanno cambio', () => {
    for (const d of ['2026-10-24', '2026-10-26', '2026-03-28', '2026-03-30', '2026-01-15', '2026-07-15']) {
      expect(clockChangeShiftMin(d)).toBe(0);
    }
  });

  it('esattamente due notti l’anno hanno un cambio', () => {
    let n = 0;
    for (let day = 0; day < 365; day++) {
      const d = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      if (clockChangeShiftMin(d) !== 0) n++;
    }
    expect(n).toBe(2);
  });
});

describe('clockChangeText', () => {
  it('senza cambio non c’è testo', () => {
    expect(clockChangeText(0, 'stanotte')).toBeNull();
    expect(clockChangeText(0, 'quella')).toBeNull();
    expect(clockChangeText(0, 'stasera')).toBeNull();
  });

  it('frasi per le tre situazioni, senza NaN/undefined', () => {
    for (const shift of [60, -60]) {
      for (const when of ['stanotte', 'quella', 'stasera'] as const) {
        const t = clockChangeText(shift, when);
        expect(t).toMatch(/1 ora/);
        expect(t).not.toMatch(/NaN|undefined|null/);
      }
    }
    expect(clockChangeText(60, 'quella')).toBe("In quella notte è cambiata l'ora (+1 ora). Cambio applicato: la durata mostrata è quella reale.");
    expect(clockChangeText(-60, 'quella')).toBe("In quella notte è cambiata l'ora (−1 ora). Cambio applicato: la durata mostrata è quella reale.");
  });
});
