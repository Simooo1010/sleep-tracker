import { describe, expect, it } from 'vitest';

import {
  CENTER_X,
  HORIZON_Y,
  TRACK_R,
  WINDOW_MIN,
  angleFor,
  arcPath,
  clampWindow,
  formatAxisClock,
  formatClock,
  pointOnArc,
  splitDuration,
  trackPath,
  wakeToAxis,
} from '../../src/components/coverGeometry';

describe('coverGeometry', () => {
  it('maps the 18:00-12:00 window onto 0-180 degrees', () => {
    expect(angleFor(0)).toBe(0);
    expect(angleFor(WINDOW_MIN / 2)).toBe(90);
    expect(angleFor(WINDOW_MIN)).toBe(180);
    expect(angleFor(-50)).toBe(0);
    expect(angleFor(5000)).toBe(180);
    expect(angleFor(Number.NaN)).toBe(0);
  });

  it('puts the track ends on the horizon and the middle at the top', () => {
    expect(pointOnArc(0)).toEqual({ x: CENTER_X - TRACK_R, y: HORIZON_Y });
    expect(pointOnArc(WINDOW_MIN)).toEqual({ x: CENTER_X + TRACK_R, y: HORIZON_Y });
    expect(pointOnArc(WINDOW_MIN / 2)).toEqual({ x: CENTER_X, y: HORIZON_Y - TRACK_R });
  });

  it('reproduces the spec track path', () => {
    expect(trackPath()).toBe('M20 210A155 155 0 0 1 330 210');
  });

  it('never uses the large-arc flag and never goes backwards', () => {
    expect(arcPath(0, 900)).toContain('155 155 0 0 1');
    expect(arcPath(600, 100)).toBe(arcPath(600, 600));
  });

  it('converts wake and bed times to clock strings', () => {
    expect(wakeToAxis(420)).toBe(780);
    expect(formatAxisClock(348)).toBe('23:48');
    expect(formatAxisClock(wakeToAxis(420))).toBe('07:00');
    expect(formatClock(-30)).toBe('23:30');
    expect(formatClock(1450)).toBe('00:10');
    expect(clampWindow(-1)).toBe(0);
  });

  it('splits durations', () => {
    expect(splitDuration(432)).toEqual({ hours: 7, minutes: 12 });
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});
