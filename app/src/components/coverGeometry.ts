/**
 * Geometry of the "Orizzonte" arc scene (Cover). Pure functions, no DOM.
 *
 * Time conventions are the domain ones (see chartGeometry.ts):
 * - bed: minutes from 18:00 local of the evening (23:48 -> 348);
 * - wake: minutes from local midnight (07:00 -> 420).
 * The visible window is 18:00 -> 12:00 (18 h) mapped onto the 180 deg track:
 * angle = (t - 18:00) / 18 h * 180 deg, 0 deg at the left end of the horizon.
 */

/** Window length: 18:00 -> 12:00. */
export const WINDOW_MIN = 18 * 60;
/** Minutes from 18:00 to midnight. */
export const EVENING_MIN = 6 * 60;

/** Scene viewBox (350 wide; the horizon sits 6 units above the bottom edge). */
export const VIEW_W = 350;
export const VIEW_H = 216;
export const HORIZON_Y = 210;
export const CENTER_X = 175;
export const TRACK_R = 155;
/** Inner track radius for naps (reserved for a later step). */
export const INNER_R = 120;

export interface Point {
  x: number;
  y: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Clamps a minute offset (from 18:00) into the visible window. */
export function clampWindow(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.min(WINDOW_MIN, Math.max(0, minutes));
}

/** Angle in degrees (0 = left end of the horizon, 180 = right end) for a minute offset from 18:00. */
export function angleFor(minutes: number): number {
  return (clampWindow(minutes) / WINDOW_MIN) * 180;
}

/** Converts a wake time (minutes from midnight) to minutes from 18:00. */
export function wakeToAxis(wakeMinutes: number): number {
  return wakeMinutes + EVENING_MIN;
}

/** Point on the circle of radius `r` for a minute offset from 18:00. */
export function pointOnArc(minutes: number, r: number = TRACK_R): Point {
  const rad = (angleFor(minutes) * Math.PI) / 180;
  return { x: round(CENTER_X - r * Math.cos(rad)), y: round(HORIZON_Y - r * Math.sin(rad)) };
}

/** SVG path of the arc between two minute offsets (left to right over the top). */
export function arcPath(fromMin: number, toMin: number, r: number = TRACK_R): string {
  const a = clampWindow(fromMin);
  const b = clampWindow(Math.max(fromMin, toMin));
  const p1 = pointOnArc(a, r);
  const p2 = pointOnArc(b, r);
  // The whole window spans exactly 180 deg, so no sub-arc is ever larger than a half circle: large-arc flag is 0.
  return `M${p1.x} ${p1.y}A${r} ${r} 0 0 1 ${p2.x} ${p2.y}`;
}

/** The whole track, from 18:00 to 12:00. */
export function trackPath(r: number = TRACK_R): string {
  return arcPath(0, WINDOW_MIN, r);
}

/** "07:05" from minutes since midnight (wraps around 24 h). */
export function formatClock(minutesFromMidnight: number): string {
  const m = ((Math.round(minutesFromMidnight) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Clock time for a minute offset from 18:00. */
export function formatAxisClock(axisMinutes: number): string {
  return formatClock(axisMinutes + 18 * 60);
}

/** Splits a duration into whole hours and remaining minutes, for "7 h 12". */
export function splitDuration(totalMinutes: number): { hours: number; minutes: number } {
  const t = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(t / 60), minutes: t % 60 };
}
