// Provider health tracking: exponential cooldown (honours Retry-After), circuit
// breaker, success/error window and local rpm/rpd limits.
// State is in-memory best effort (serverless instances may reset); a persistent
// store (e.g. Supabase) can be plugged in through the HealthStore interface.
import type { ResolvedProvider } from './config.ts';
import type { ProviderErrorKind } from './errors.ts';

export interface ProviderHealth {
  consecutiveFailures: number;
  cooldownUntil: number;
  lastErrorKind?: ProviderErrorKind;
  lastErrorAt?: number;
  lastSuccessAt?: number;
  /** Recent outcomes (time window). */
  window: Array<{ t: number; ok: boolean }>;
  /** Request timestamps in the last minute (local rpm limit). */
  minute: number[];
  dayKey: string;
  dayCount: number;
  /** Timestamp of the in-flight half-open trial, if any. */
  halfOpenTrialAt?: number;
}

export interface HealthStore {
  get(id: string): Promise<ProviderHealth | undefined>;
  set(id: string, health: ProviderHealth): Promise<void>;
}

export class InMemoryHealthStore implements HealthStore {
  private readonly map = new Map<string, ProviderHealth>();
  async get(id: string): Promise<ProviderHealth | undefined> {
    const h = this.map.get(id);
    return h ? structuredClone(h) : undefined;
  }
  async set(id: string, health: ProviderHealth): Promise<void> {
    this.map.set(id, structuredClone(health));
  }
}

export interface HealthOptions {
  now?: () => number;
  /** Consecutive failures that open the circuit breaker. */
  breakerThreshold?: number;
  windowMs?: number;
  windowMax?: number;
  maxRetryAfterMs?: number;
}

export type Availability =
  | { available: true; halfOpen: boolean }
  | { available: false; reason: 'cooldown' | 'local_rpm' | 'local_rpd' | 'half_open_busy'; retryInMs: number };

export interface HealthSnapshot {
  state: 'closed' | 'open' | 'half_open';
  cooldownRemainingMs: number;
  consecutiveFailures: number;
  lastErrorKind?: ProviderErrorKind;
  lastErrorAt?: string;
  lastSuccessAt?: string;
  window: { total: number; ok: number; errors: number; successRate: number | null };
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const HALF_OPEN_TRIAL_TTL = 2 * MINUTE;

function utcDayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function fresh(now: number): ProviderHealth {
  return { consecutiveFailures: 0, cooldownUntil: 0, window: [], minute: [], dayKey: utcDayKey(now), dayCount: 0 };
}

/** Cooldown policy (ms) for a failure. Exported for documentation/tests. */
export function cooldownFor(kind: ProviderErrorKind, consecutiveFailures: number, retryAfterMs?: number, maxRetryAfterMs = HOUR): number {
  const n = Math.max(1, consecutiveFailures);
  const exp = (base: number, cap: number) => Math.min(cap, base * 2 ** (n - 1));
  if (retryAfterMs !== undefined) return Math.min(Math.max(retryAfterMs, SECOND), maxRetryAfterMs);
  switch (kind) {
    case 'auth':
    case 'not_found':
      return HOUR; // configuration problem: no point in retrying soon
    case 'rate_limit':
      return exp(30 * SECOND, 15 * MINUTE);
    case 'timeout':
    case 'network':
    case 'server_error':
    case 'invalid_response':
      return exp(5 * SECOND, 10 * MINUTE);
    case 'bad_request':
    case 'invalid_output':
      return 0; // request/model-quality issue, not an availability problem (breaker still applies)
  }
}

export class HealthTracker {
  private readonly store: HealthStore;
  private readonly now: () => number;
  private readonly breakerThreshold: number;
  private readonly windowMs: number;
  private readonly windowMax: number;
  private readonly maxRetryAfterMs: number;

  constructor(store: HealthStore = new InMemoryHealthStore(), opts: HealthOptions = {}) {
    this.store = store;
    this.now = opts.now ?? Date.now;
    this.breakerThreshold = opts.breakerThreshold ?? 3;
    this.windowMs = opts.windowMs ?? 10 * MINUTE;
    this.windowMax = opts.windowMax ?? 50;
    this.maxRetryAfterMs = opts.maxRetryAfterMs ?? HOUR;
  }

  private async load(id: string): Promise<ProviderHealth> {
    const now = this.now();
    const h = (await this.store.get(id)) ?? fresh(now);
    h.window = h.window.filter((w) => now - w.t <= this.windowMs).slice(-this.windowMax);
    h.minute = h.minute.filter((t) => now - t < MINUTE);
    const day = utcDayKey(now);
    if (h.dayKey !== day) {
      h.dayKey = day;
      h.dayCount = 0;
    }
    return h;
  }

  async check(p: ResolvedProvider): Promise<Availability> {
    const now = this.now();
    const h = await this.load(p.id);
    if (now < h.cooldownUntil) return { available: false, reason: 'cooldown', retryInMs: h.cooldownUntil - now };
    if (p.limits?.rpd !== undefined && h.dayCount >= p.limits.rpd) {
      const tomorrow = Date.parse(`${h.dayKey}T00:00:00Z`) + 24 * HOUR;
      return { available: false, reason: 'local_rpd', retryInMs: tomorrow - now };
    }
    if (p.limits?.rpm !== undefined && h.minute.length >= p.limits.rpm) {
      const oldest = h.minute[0] ?? now;
      return { available: false, reason: 'local_rpm', retryInMs: Math.max(0, oldest + MINUTE - now) };
    }
    const halfOpen = h.consecutiveFailures >= this.breakerThreshold;
    if (halfOpen && h.halfOpenTrialAt !== undefined && now - h.halfOpenTrialAt < HALF_OPEN_TRIAL_TTL) {
      return { available: false, reason: 'half_open_busy', retryInMs: HALF_OPEN_TRIAL_TTL - (now - h.halfOpenTrialAt) };
    }
    return { available: true, halfOpen };
  }

  /** Call right before sending a request (counts towards local limits). */
  async markRequest(p: ResolvedProvider, halfOpen: boolean): Promise<void> {
    const now = this.now();
    const h = await this.load(p.id);
    h.minute.push(now);
    h.dayCount += 1;
    if (halfOpen) h.halfOpenTrialAt = now;
    await this.store.set(p.id, h);
  }

  async recordSuccess(id: string): Promise<void> {
    const now = this.now();
    const h = await this.load(id);
    h.consecutiveFailures = 0;
    h.cooldownUntil = 0;
    h.lastSuccessAt = now;
    delete h.halfOpenTrialAt;
    h.window.push({ t: now, ok: true });
    await this.store.set(id, h);
  }

  async recordFailure(id: string, kind: ProviderErrorKind, retryAfterMs?: number): Promise<void> {
    const now = this.now();
    const h = await this.load(id);
    h.consecutiveFailures += 1;
    h.lastErrorKind = kind;
    h.lastErrorAt = now;
    delete h.halfOpenTrialAt;
    h.window.push({ t: now, ok: false });
    let cooldown = cooldownFor(kind, h.consecutiveFailures, retryAfterMs, this.maxRetryAfterMs);
    // Circuit breaker: after N consecutive failures open the circuit with growing backoff.
    if (h.consecutiveFailures >= this.breakerThreshold) {
      const extra = h.consecutiveFailures - this.breakerThreshold;
      cooldown = Math.max(cooldown, Math.min(30 * MINUTE, MINUTE * 2 ** extra));
    }
    h.cooldownUntil = now + cooldown;
    await this.store.set(id, h);
  }

  async snapshot(id: string): Promise<HealthSnapshot> {
    const now = this.now();
    const h = await this.load(id);
    const ok = h.window.filter((w) => w.ok).length;
    const total = h.window.length;
    const cooling = now < h.cooldownUntil;
    const state: HealthSnapshot['state'] = cooling
      ? 'open'
      : h.consecutiveFailures >= this.breakerThreshold
        ? 'half_open'
        : 'closed';
    return {
      state,
      cooldownRemainingMs: cooling ? h.cooldownUntil - now : 0,
      consecutiveFailures: h.consecutiveFailures,
      ...(h.lastErrorKind ? { lastErrorKind: h.lastErrorKind } : {}),
      ...(h.lastErrorAt ? { lastErrorAt: new Date(h.lastErrorAt).toISOString() } : {}),
      ...(h.lastSuccessAt ? { lastSuccessAt: new Date(h.lastSuccessAt).toISOString() } : {}),
      window: { total, ok, errors: total - ok, successRate: total ? ok / total : null },
    };
  }
}
