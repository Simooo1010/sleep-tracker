// Data-sufficiency thresholds: sections below threshold are removed BEFORE
// reaching the AI or the rules engine, so no insight is generated on thin data.
import type { InsightCategory, InsightStats } from './schema.ts';

export const THRESHOLDS = {
  durationNights: 5,
  debtNights: 5,
  regularityNights: 7,
  driftNights: 14,
  driftOverDays: 14,
  weekdayNights: 4,
  weekendNights: 2,
  napDays: 7,
  napCount: 3,
  correlationNights: 14,
  correlationMinAbsR: 0.3,
  lowCoverageShare: 0.6,
} as const;

export type SectionKey = 'duration' | 'debt' | 'regularity' | 'drift' | 'weekdayWeekend' | 'naps' | 'correlations' | 'dayContext';

export const categoryToSection: Record<InsightCategory, SectionKey | null> = {
  coverage: null,
  duration: 'duration',
  debt: 'debt',
  regularity: 'regularity',
  drift: 'drift',
  weekday_weekend: 'weekdayWeekend',
  naps: 'naps',
  correlation: 'correlations',
  day_context: 'dayContext',
};

export function applyThresholds(stats: InsightStats): { eligible: InsightStats; hidden: SectionKey[] } {
  const t = THRESHOLDS;
  const hidden: SectionKey[] = [];
  const e: InsightStats = { ...stats };

  const drop = (key: SectionKey) => {
    if (e[key] !== undefined) hidden.push(key);
    delete e[key];
  };

  if (e.duration && e.duration.nights < t.durationNights) drop('duration');
  if (e.debt && e.debt.nights < t.debtNights) drop('debt');
  if (e.regularity && e.regularity.nights < t.regularityNights) drop('regularity');
  if (e.drift && (e.drift.nights < t.driftNights || e.drift.overDays < t.driftOverDays)) drop('drift');
  if (e.weekdayWeekend && (e.weekdayWeekend.weekdayNights < t.weekdayNights || e.weekdayWeekend.weekendNights < t.weekendNights)) {
    drop('weekdayWeekend');
  }
  if (e.naps && (e.naps.days < t.napDays || e.naps.count < t.napCount)) drop('naps');
  if (e.correlations) {
    const ok = e.correlations.filter((c) => c.n >= t.correlationNights && Math.abs(c.r) >= t.correlationMinAbsR);
    if (ok.length === 0) drop('correlations');
    else e.correlations = ok;
  }
  // Optional context: never "hidden for thin data"; an empty list is simply absent.
  if (e.dayContext && e.dayContext.length === 0) delete e.dayContext;
  return { eligible: e, hidden };
}

export function coverageOf(stats: InsightStats) {
  const inWindow = Math.max(stats.nights.inWindow, 0);
  const withData = Math.min(stats.nights.withData, inWindow || stats.nights.withData);
  return {
    nightsWithData: withData,
    nightsInWindow: inWindow,
    windowDays: stats.windowDays,
    share: inWindow > 0 ? Math.round((withData / inWindow) * 100) / 100 : 0,
  };
}

export function confidenceFor(nights: number): 'low' | 'medium' | 'high' {
  if (nights >= 21) return 'high';
  if (nights >= 10) return 'medium';
  return 'low';
}
