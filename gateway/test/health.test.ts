import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { parseRetryAfter } from '../src/errors.ts';
import { HealthTracker, InMemoryHealthStore, cooldownFor } from '../src/health.ts';
import { clock, testEnv, testProviders } from './helpers.ts';

const provider = (over: Record<string, unknown> = {}) =>
  loadConfig({ env: testEnv, entries: testProviders([{ id: 'p1', ...over }]) }).providers[0]!;

describe('health tracking', () => {
  it('exponential cooldown for transient errors, Retry-After wins', () => {
    expect(cooldownFor('server_error', 1)).toBe(5_000);
    expect(cooldownFor('server_error', 2)).toBe(10_000);
    expect(cooldownFor('server_error', 3)).toBe(20_000);
    expect(cooldownFor('server_error', 30)).toBe(10 * 60_000);
    expect(cooldownFor('rate_limit', 1)).toBe(30_000);
    expect(cooldownFor('rate_limit', 1, 7_000)).toBe(7_000);
    expect(cooldownFor('auth', 1)).toBe(60 * 60_000);
    expect(cooldownFor('invalid_output', 1)).toBe(0);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-24T10:00:00Z');
    expect(parseRetryAfter('30', now)).toBe(30_000);
    expect(parseRetryAfter('Sat, 24 Oct 2026 10:01:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfter('boh', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });

  it('circuit breaker opens after 3 consecutive failures, then half-open allows one trial', async () => {
    const clk = clock();
    const t = new HealthTracker(new InMemoryHealthStore(), { now: clk.now });
    const p = provider();
    for (let i = 0; i < 3; i++) {
      await t.recordFailure('p1', 'invalid_output');
    }
    // invalid_output has no own cooldown, but the breaker imposes >= 60 s.
    expect(await t.check(p)).toMatchObject({ available: false, reason: 'cooldown' });
    expect((await t.snapshot('p1')).state).toBe('open');
    clk.advance(61_000);
    const a = await t.check(p);
    expect(a).toEqual({ available: true, halfOpen: true });
    expect((await t.snapshot('p1')).state).toBe('half_open');
    await t.markRequest(p, true);
    // A concurrent request while the trial is in flight is held back.
    expect(await t.check(p)).toMatchObject({ available: false, reason: 'half_open_busy' });
    await t.recordSuccess('p1');
    expect(await t.check(p)).toEqual({ available: true, halfOpen: false });
    const snap = await t.snapshot('p1');
    expect(snap).toMatchObject({ state: 'closed', consecutiveFailures: 0 });
    expect(snap.window).toMatchObject({ total: 4, ok: 1, errors: 3 });
  });

  it('enforces local rpm/rpd limits from config', async () => {
    const clk = clock();
    const t = new HealthTracker(new InMemoryHealthStore(), { now: clk.now });
    const p = provider({ limits: { rpm: 2, rpd: 3 } });
    await t.markRequest(p, false);
    await t.markRequest(p, false);
    expect(await t.check(p)).toMatchObject({ available: false, reason: 'local_rpm' });
    clk.advance(61_000);
    expect((await t.check(p)).available).toBe(true);
    await t.markRequest(p, false);
    expect(await t.check(p)).toMatchObject({ available: false, reason: 'local_rpd' });
    clk.advance(24 * 3600_000);
    expect((await t.check(p)).available).toBe(true);
  });

  it('HealthStore is pluggable (e.g. Supabase later)', async () => {
    const data = new Map<string, unknown>();
    const store = {
      get: async (id: string) => data.get(id) as never,
      set: async (id: string, h: unknown) => void data.set(id, JSON.parse(JSON.stringify(h))),
    };
    const t = new HealthTracker(store);
    await t.recordFailure('p1', 'rate_limit', 5_000);
    expect(data.has('p1')).toBe(true);
    expect((await t.snapshot('p1')).lastErrorKind).toBe('rate_limit');
  });
});
