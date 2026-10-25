import { describe, expect, it } from 'vitest';
import {
  formatAxisClock,
  formatClock,
  formatClockMinutes,
  formatCoverage,
  formatCoverageShort,
  formatDayInitial,
  formatDayMonth,
  formatDecimal,
  formatHm,
  formatHmCompact,
  formatLongDate,
  formatMinutes,
  formatMonthYear,
  formatPlusMinus,
  formatRange,
  formatRelativeDay,
  formatScore,
  formatShortDate,
  formatSignedDecimal,
  formatSignedMin,
  formatSignedNumber,
  formatWhen,
  nightStatusWord,
  provenanceWord,
} from '../../../src/server/views/format';

describe('durate', () => {
  it('minuti → "7h 32m"', () => {
    expect(formatHm(452)).toBe('7h 32m');
    expect(formatHm(65)).toBe('1h 05m');
    expect(formatHm(40)).toBe('0h 40m');
    expect(formatHm(0)).toBe('0h 00m');
    expect(formatHm(451.6)).toBe('7h 32m');
    expect(formatHm(-65)).toBe('−1h 05m');
  });
  it('mancante resta mancante', () => {
    expect(formatHm(null)).toBe('—');
    expect(formatHm(Number.NaN)).toBe('—');
    expect(formatHmCompact(null)).toBe('—');
    expect(formatMinutes(null)).toBe('—');
  });
  it('compatta e in minuti', () => {
    expect(formatHmCompact(432)).toBe('7h12');
    expect(formatHmCompact(480)).toBe('8h00');
    expect(formatMinutes(32)).toBe('32 min');
  });
});

describe('orari Europe/Rome', () => {
  it('ISO → HH:MM in ora legale e solare', () => {
    expect(formatClock('2026-10-24T21:48:00.000Z')).toBe('23:48'); // CEST
    expect(formatClock('2026-10-25T06:20:00.000Z')).toBe('07:20'); // CET dopo il cambio
    expect(formatClock('2026-10-25T00:30:00.000Z')).toBe('02:30'); // prima occorrenza
    expect(formatClock('2026-10-25T01:30:00.000Z')).toBe('02:30'); // seconda occorrenza
    expect(formatClock(null)).toBe('—');
    expect(formatClock('non-una-data')).toBe('—');
  });
  it('intervallo con freccia', () => {
    expect(formatRange('2026-10-23T21:48:00.000Z', '2026-10-24T05:20:00.000Z')).toBe('23:48 → 07:20');
    expect(formatRange('2026-10-23T21:48:00.000Z', null)).toBe('23:48 → —');
  });
  it('minuti e asse del letto', () => {
    expect(formatClockMinutes(435)).toBe('07:15');
    expect(formatClockMinutes(1500)).toBe('01:00');
    expect(formatClockMinutes(-30)).toBe('23:30');
    expect(formatAxisClock(330)).toBe('23:30');
    expect(formatAxisClock(400)).toBe('00:40');
    expect(formatAxisClock(347.5)).toBe('23:48');
    expect(formatAxisClock(null)).toBe('—');
  });
});

describe('scarti e decimali', () => {
  it('scarto con segno meno tipografico U+2212', () => {
    expect(formatSignedMin(12)).toBe('+12 min');
    expect(formatSignedMin(-8)).toBe('−8 min');
    expect(formatSignedMin(-8).charCodeAt(0)).toBe(0x2212);
    expect(formatSignedMin(0)).toBe('0 min');
    expect(formatSignedMin(-0.3)).toBe('0 min');
    expect(formatSignedMin(null)).toBe('—');
    expect(formatSignedNumber(8)).toBe('+8');
    expect(formatSignedNumber(-12)).toBe('−12');
    expect(formatSignedNumber(0)).toBe('0');
  });
  it('decimali con la virgola', () => {
    expect(formatSignedDecimal(0.6)).toBe('+0,6');
    expect(formatSignedDecimal(-0.8)).toBe('−0,8');
    expect(formatSignedDecimal(0)).toBe('0,0');
    expect(formatSignedDecimal(-0.04)).toBe('0,0');
    expect(formatDecimal(3.44)).toBe('3,4');
    expect(formatDecimal(-0.01)).toBe('0,0');
    expect(formatPlusMinus(24.4)).toBe('± 24 min');
    expect(formatScore(4)).toBe('4 su 5');
    expect(formatScore(null)).toBe('—');
  });
});

describe('date in italiano', () => {
  it('per esteso minuscola', () => {
    expect(formatLongDate('2026-10-24')).toBe('sabato 24 ottobre');
    expect(formatLongDate('2026-10-25')).toBe('domenica 25 ottobre');
    expect(formatLongDate('2026-01-05')).toBe('lunedì 5 gennaio');
    expect(formatDayMonth('2026-10-06')).toBe('6 ottobre');
    expect(formatShortDate('2026-10-23')).toBe('ven 23 ott');
    expect(formatDayInitial('2026-10-21')).toBe('M 21');
    expect(formatMonthYear('2026-10')).toBe('ottobre 2026');
  });
  it('giorno relativo', () => {
    expect(formatRelativeDay('2026-10-24', '2026-10-24')).toBe('oggi');
    expect(formatRelativeDay('2026-10-23', '2026-10-24')).toBe('ieri');
    expect(formatRelativeDay('2026-10-20', '2026-10-24')).toBe('mar');
    expect(formatRelativeDay('2026-10-10', '2026-10-24')).toBe('10 ott');
    expect(formatWhen('2026-10-24T05:20:00.000Z', '2026-10-24')).toBe('oggi 07:20');
    expect(formatWhen('2026-10-23T21:48:00.000Z', '2026-10-24')).toBe('ieri 23:48');
  });
});

describe('parole e copertura', () => {
  it('provenienza e stato', () => {
    expect(provenanceWord('automatico')).toBe('Automatico');
    expect(provenanceWord('mancante')).toBe('Mancante');
    expect(nightStatusWord('stimata')).toBe('Stimata');
  });
  it('copertura', () => {
    expect(formatCoverage({ used: 12, window: 14 })).toBe('Calcolata su 12 su 14 notti');
    expect(formatCoverage({ used: 3, window: 14 }, 'giorni')).toBe('Calcolata su 3 su 14 giorni');
    expect(formatCoverage({ used: 1, window: 1 })).toBe('Calcolata su 1 notte');
    expect(formatCoverage({ used: 0, window: 1 })).toBe('Nessuna notte disponibile');
    expect(formatCoverageShort({ used: 9, window: 14 })).toBe('9 su 14 notti');
  });
});
