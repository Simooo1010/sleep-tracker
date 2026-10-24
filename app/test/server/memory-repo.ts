/**
 * Repo in memoria per i test del livello server. Implementa il contratto `Repo`:
 * - `insertEvent` idempotente sulla idempotencyKey;
 * - `upsertNight` rifiuta in silenzio (false) la sovrascrittura di una notte 'confermata';
 * - `saveNap` sostituisce un sonnellino con stessa data e stesso inizio (nessun doppione).
 * I dati sono copiati in entrata e in uscita: i chiamanti non possono mutare lo stato interno.
 * I campi pubblici servono per ispezionare lo stato nei test (sono copie: modificarli non ha effetto).
 */
import type { EveningCheck, Nap, Night, SignalEvent } from '../../src/domain/types';
import type { Repo, StoredEvent } from '../../src/server/types';

const clone = <T>(v: T): T => structuredClone(v);

export interface MemoryRepoSeed {
  events?: StoredEvent[];
  nights?: Night[];
  checks?: EveningCheck[];
  naps?: Nap[];
  /** Hash dei token attivi. */
  tokenHashes?: string[];
}

export class MemoryRepo implements Repo {
  private readonly eventsByKey = new Map<string, StoredEvent>();
  private readonly nightsByDate = new Map<string, Night>();
  private readonly checksByDate = new Map<string, EveningCheck>();
  private readonly napsByKey = new Map<string, Nap>();
  private readonly tokens = new Set<string>();

  constructor(seed: MemoryRepoSeed = {}) {
    for (const e of seed.events ?? []) this.eventsByKey.set(e.idempotencyKey, clone(e));
    for (const n of seed.nights ?? []) this.nightsByDate.set(n.nightDate, clone(n));
    for (const c of seed.checks ?? []) this.checksByDate.set(c.date, clone(c));
    for (const n of seed.naps ?? []) this.napsByKey.set(`${n.date}|${n.startAt}`, clone(n));
    for (const t of seed.tokenHashes ?? []) this.tokens.add(t);
  }

  /** Tutti gli eventi salvati, ordinati per ts. */
  get events(): StoredEvent[] {
    return [...this.eventsByKey.values()].map(clone).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  }

  /** Tutte le notti, ordinate per nightDate. */
  get nights(): Night[] {
    return [...this.nightsByDate.values()].map(clone).sort((a, b) => a.nightDate.localeCompare(b.nightDate));
  }

  get checks(): EveningCheck[] {
    return [...this.checksByDate.values()].map(clone).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Tutti i sonnellini, ordinati per inizio. */
  get naps(): Nap[] {
    return [...this.napsByKey.values()].map(clone).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  }

  addToken(tokenHash: string): void {
    this.tokens.add(tokenHash);
  }

  async insertEvent(e: StoredEvent): Promise<{ inserted: boolean }> {
    if (this.eventsByKey.has(e.idempotencyKey)) return { inserted: false };
    this.eventsByKey.set(e.idempotencyKey, clone(e));
    return { inserted: true };
  }

  async listEvents(fromIso: string, toIso: string): Promise<SignalEvent[]> {
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    return this.events
      .filter((e) => {
        const t = Date.parse(e.ts);
        return t >= from && t <= to;
      })
      .map(({ type, ts, source }) => ({ type, ts, source }));
  }

  async getEveningCheck(date: string): Promise<EveningCheck | null> {
    const c = this.checksByDate.get(date);
    return c ? clone(c) : null;
  }

  async saveEveningCheck(check: EveningCheck): Promise<void> {
    this.checksByDate.set(check.date, clone(check));
  }

  async getNight(nightDate: string): Promise<Night | null> {
    const n = this.nightsByDate.get(nightDate);
    return n ? clone(n) : null;
  }

  async upsertNight(night: Night): Promise<boolean> {
    if (this.nightsByDate.get(night.nightDate)?.status === 'confermata') return false;
    this.nightsByDate.set(night.nightDate, clone(night));
    return true;
  }

  async listNights(fromDate: string, toDate: string): Promise<Night[]> {
    return this.nights.filter((n) => n.nightDate >= fromDate && n.nightDate <= toDate);
  }

  async saveNap(nap: Nap): Promise<void> {
    this.napsByKey.set(`${nap.date}|${nap.startAt}`, clone(nap));
  }

  async tokenExists(tokenHash: string): Promise<boolean> {
    return this.tokens.has(tokenHash);
  }
}
