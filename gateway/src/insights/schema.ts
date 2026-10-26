// Input (aggregate statistics only) and output schemas for /v1/insights.
import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'formato HH:MM (solo ora del giorno, niente data)');
const nonNegInt = z.number().int().min(0).max(10_000);
const minutes = z.number().min(-1440).max(100_000);
const share = z.number().min(0).max(1);

export const DAY_CONTEXT_MAX_ITEMS = 10;
export const DAY_CONTEXT_MAX_DAYS_AGO = 60;
export const DAY_CONTEXT_MAX_FACTORS = 8;
export const DAY_CONTEXT_MAX_TEXT = 140;

const factorSlug = z.string().regex(/^[a-z0-9_-]{1,40}$/i, 'factor: etichetta breve (slug), niente testo libero');

/**
 * User-reported context of a "special" day (free text, UNTRUSTED data). Relative date only
 * (daysAgo, never an ISO date). The text is redacted by the gateway and never logged.
 */
export const dayContextItemSchema = z.strictObject({
  daysAgo: z.number().int().min(0).max(DAY_CONTEXT_MAX_DAYS_AGO),
  factors: z.array(factorSlug).max(DAY_CONTEXT_MAX_FACTORS),
  text: z.string().max(DAY_CONTEXT_MAX_TEXT, `text: massimo ${DAY_CONTEXT_MAX_TEXT} caratteri`),
});
export type DayContextItem = z.infer<typeof dayContextItemSchema>;

/** Aggregate stats computed by the app. No raw events, no dates, no identifiers. */
export const insightStatsSchema = z.strictObject({
  windowDays: z.number().int().min(1).max(366),
  nights: z.strictObject({
    inWindow: nonNegInt,
    withData: nonNegInt,
    confirmed: nonNegInt.optional(),
    estimated: nonNegInt.optional(),
    exceptions: nonNegInt.optional(),
  }),
  /** Personal target in minutes (default 7 h as lower bound of the adult range). */
  targetSleepMinutes: z.number().int().min(240).max(720).optional(),
  duration: z
    .strictObject({
      nights: nonNegInt,
      medianMinutes: minutes,
      mean7Minutes: minutes.optional(),
      mean30Minutes: minutes.optional(),
    })
    .optional(),
  debt: z.strictObject({ nights: nonNegInt, minutes }).optional(),
  regularity: z
    .strictObject({
      nights: nonNegInt,
      toleranceMinutes: z.number().int().min(5).max(120).default(30),
      bedtimeMedian: hhmm,
      wakeMedian: hhmm,
      bedtimeWithinShare: share,
      wakeWithinShare: share,
      bedtimeMadMinutes: minutes.optional(),
      wakeMadMinutes: minutes.optional(),
    })
    .optional(),
  drift: z
    .strictObject({
      nights: nonNegInt,
      overDays: z.number().int().min(1).max(366),
      bedtimeShiftMinutes: minutes,
      wakeShiftMinutes: minutes,
    })
    .optional(),
  weekdayWeekend: z
    .strictObject({
      weekdayNights: nonNegInt,
      weekendNights: nonNegInt,
      weekdayMidpoint: hhmm,
      weekendMidpoint: hhmm,
      socialJetLagMinutes: z.number().min(0).max(1440),
      weekdayMedianDurationMinutes: minutes.optional(),
      weekendMedianDurationMinutes: minutes.optional(),
    })
    .optional(),
  naps: z
    .strictObject({
      days: nonNegInt,
      count: nonNegInt,
      medianMinutes: minutes.optional(),
    })
    .optional(),
  correlations: z
    .array(
      z.strictObject({
        factor: factorSlug,
        target: z.enum(['quality', 'energy', 'mood', 'duration']),
        r: z.number().min(-1).max(1),
        n: nonNegInt,
      }),
    )
    .max(20)
    .optional(),
  /** Optional, user-reported context of special days (untrusted text, max 10 entries). */
  dayContext: z.array(dayContextItemSchema).max(DAY_CONTEXT_MAX_ITEMS).optional(),
});

export type InsightStats = z.infer<typeof insightStatsSchema>;
export type InsightStatsInput = z.input<typeof insightStatsSchema>;

export const insightCategories = [
  'coverage',
  'duration',
  'debt',
  'regularity',
  'drift',
  'weekday_weekend',
  'naps',
  'correlation',
  'day_context',
] as const;
export type InsightCategory = (typeof insightCategories)[number];

export const insightItemSchema = z.strictObject({
  category: z.enum(insightCategories),
  severity: z.enum(['positive', 'info', 'attention']),
  title: z.string().min(3).max(100),
  body: z.string().min(10).max(600),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type InsightItem = z.infer<typeof insightItemSchema>;

/** What the AI must produce (also produced by the rules engine). */
export const aiInsightsSchema = z.strictObject({
  summary: z.string().min(3).max(500),
  insights: z.array(insightItemSchema).min(1).max(6),
});
export type AiInsights = z.infer<typeof aiInsightsSchema>;

export interface InsightsResult extends AiInsights {
  source: 'ai' | 'rules';
  provider: string | null;
  model: string | null;
  coverage: { nightsWithData: number; nightsInWindow: number; windowDays: number; share: number };
  /** Sections hidden because data is below threshold. */
  hidden: string[];
}
