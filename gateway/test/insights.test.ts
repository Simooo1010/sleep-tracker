import { describe, expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { generateRuleInsights, formatDuration } from '../src/insights/rules.ts';
import { aiInsightsSchema, insightStatsSchema } from '../src/insights/schema.ts';
import { applyThresholds } from '../src/insights/thresholds.ts';
import { noopLogger } from '../src/log.ts';
import { completion, fakeFetch, goodStats, testEnv, testProviders } from './helpers.ts';

const parse = (x: unknown) => insightStatsSchema.parse(x);

describe('rules insights', () => {
  it('produces valid Italian insights in the AI schema', () => {
    const r = generateRuleInsights(parse(goodStats));
    expect(aiInsightsSchema.safeParse({ summary: r.summary, insights: r.insights }).success).toBe(true);
    const cats = r.insights.map((i) => i.category);
    expect(cats).toContain('duration');
    expect(cats).toContain('debt');
    expect(cats).toContain('regularity');
    expect(r.insights.find((i) => i.category === 'debt')!.title).toBe('Debito di sonno: 4 h');
    expect(r.insights.find((i) => i.category === 'regularity')!.body).toContain('±30 min');
    expect(r.insights.find((i) => i.category === 'regularity')!.severity).toBe('positive');
    expect(r.insights[0]!.severity).toBe('attention');
  });

  it('hides insights below data thresholds', () => {
    const r = generateRuleInsights(
      parse({
        windowDays: 14,
        nights: { inWindow: 14, withData: 4 },
        duration: { nights: 4, medianMinutes: 300 },
        regularity: { nights: 4, bedtimeMedian: '01:00', wakeMedian: '07:00', bedtimeWithinShare: 0.1, wakeWithinShare: 0.2 },
        correlations: [{ factor: 'schermi', target: 'quality', r: -0.8, n: 4 }],
      }),
    );
    expect(r.hidden.sort()).toEqual(['correlations', 'duration', 'regularity']);
    expect(r.insights.map((i) => i.category)).toEqual(['coverage']);
    expect(r.insights[0]!.title).toBe('Dati su 4/14 notti');
  });

  it('correlations only with >= 14 nights and framed as hints, not causes', () => {
    const base = { windowDays: 30, nights: { inWindow: 30, withData: 25 } };
    const few = applyThresholds(parse({ ...base, correlations: [{ factor: 'sport', target: 'energy', r: 0.6, n: 13 }] }));
    expect(few.hidden).toEqual(['correlations']);
    const weak = applyThresholds(parse({ ...base, correlations: [{ factor: 'sport', target: 'energy', r: 0.1, n: 20 }] }));
    expect(weak.hidden).toEqual(['correlations']);

    const r = generateRuleInsights(parse({ ...base, correlations: [{ factor: 'schermi', target: 'quality', r: -0.42, n: 18 }] }));
    const c = r.insights.find((i) => i.category === 'correlation')!;
    expect(c.title).toMatch(/^Indizio/);
    expect(c.body).toMatch(/non una prova di causa/);
    expect(c.body).toContain('18 notti');
  });

  it('drift, weekday/weekend and naps', () => {
    const r = generateRuleInsights(
      parse({
        windowDays: 28,
        nights: { inWindow: 28, withData: 26 },
        drift: { nights: 26, overDays: 28, bedtimeShiftMinutes: 40, wakeShiftMinutes: 5 },
        weekdayWeekend: { weekdayNights: 18, weekendNights: 8, weekdayMidpoint: '03:15', weekendMidpoint: '04:40', socialJetLagMinutes: 85 },
        naps: { days: 28, count: 6, medianMinutes: 25 },
      }),
    );
    const drift = r.insights.find((i) => i.category === 'drift')!;
    expect(drift.body).toContain('+40 min in 4 settimane');
    const ww = r.insights.find((i) => i.category === 'weekday_weekend')!;
    expect(ww).toMatchObject({ severity: 'attention', title: 'Weekend sfasato di 1 h 25 min' });
    expect(r.insights.find((i) => i.category === 'naps')!.title).toBe('6 sonnellini in 28 giorni');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(402)).toBe('6 h 42 min');
  });
});

describe('AI insights guardrails', () => {
  it('only eligible sections are sent to the AI', async () => {
    const f = fakeFetch({ 'https://p1.test/v1': () => completion(JSON.stringify({ summary: 'ok ok', insights: [{ category: 'regularity', severity: 'positive', title: 'Orari regolari', body: 'Sei rimasto nella tolleranza.', confidence: 'medium' }] })) });
    const g = createGateway({ env: testEnv, providers: testProviders(), fetch: f.fetch, logger: noopLogger });
    const res = await g.insights({ ...goodStats, correlations: [{ factor: 'caffe', target: 'quality', r: -0.9, n: 5 }] });
    expect(res.source).toBe('ai');
    expect(res.hidden).toEqual(['correlations']);
    const sent = JSON.stringify(f.calls[0]!.body.messages);
    expect(sent).not.toContain('caffe');
    expect(sent).toContain('dati insufficienti');
  });

  it('AI insight on a hidden section is rejected → retry → next provider / rules', async () => {
    const bad = JSON.stringify({
      summary: 'x x x',
      insights: [{ category: 'correlation', severity: 'info', title: 'Caffè e sonno', body: 'Il caffè peggiora il sonno.', confidence: 'high' }],
    });
    const f = fakeFetch({ 'https://p1.test/v1': () => completion(bad), 'https://p2.test/v1': () => completion(bad), 'https://p3.test/v1': () => completion(bad) });
    const g = createGateway({ env: testEnv, providers: testProviders(), fetch: f.fetch, logger: noopLogger });
    const res = await g.insights({ ...goodStats, correlations: [{ factor: 'caffe', target: 'quality', r: -0.9, n: 5 }] });
    expect(res.source).toBe('rules');
    expect(f.callsTo('https://p1.test/v1')).toHaveLength(2);
    expect(res.insights.some((i) => i.category === 'correlation')).toBe(false);
  });

  it('json_schema sent to strict providers drops unsupported keywords, validation stays strict', async () => {
    const f = fakeFetch({ 'https://p1.test/v1': () => completion(JSON.stringify({ summary: 'ok', insights: [] })) , 'https://p2.test/v1': () => completion('{}'), 'https://p3.test/v1': () => completion('{}') });
    const g = createGateway({ env: testEnv, providers: testProviders(), fetch: f.fetch, logger: noopLogger });
    const res = await g.insights(goodStats);
    const rf = f.callsTo('https://p1.test/v1')[0]!.body.response_format as { json_schema: { schema: unknown; strict: boolean } };
    const schemaStr = JSON.stringify(rf.json_schema.schema);
    expect(rf.json_schema.strict).toBe(true);
    expect(schemaStr).not.toMatch(/minLength|maxItems|maxLength|minItems/);
    expect(schemaStr).toContain('"additionalProperties":false');
    // Empty insights array violates minItems locally → rules.
    expect(res.source).toBe('rules');
  });
});
