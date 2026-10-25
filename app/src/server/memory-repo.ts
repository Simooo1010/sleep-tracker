/**
 * Repo in memoria per i test del livello server. Implementa il contratto `Repo`:
 * - `insertEvent` idempotente sulla idempotencyKey;
 * - `upsertNight` rifiuta in silenzio (false) la sovrascrittura di una notte 'confermata';
 * - `saveNap` sostituisce un sonnellino con stessa data e stesso inizio (nessun doppione);
 * - `overwriteNight` è la scrittura esplicita dell'utente: sostituisce anche una notte 'confermata';
 * - le eccezioni per notte aggiornano il contatore `uses` dei tipi (mai sotto 0, slug nuovi creati al volo).
 * I dati sono copiati in entrata e in uscita: i chiamanti non possono mutare lo stato interno.
 * I campi pubblici servono per ispezionare lo stato nei test (sono copie: modificarli non ha effetto).
 */
import type { EveningCheck, Nap, Night, SignalEvent } from '../domain/types';
import type { ApiTokenInfo, ExceptionTypeRow, QuestionLogRow, Repo, StoredEvent } from './types';

const clone = <T>(v: T): T => structuredClone(v);

export interface MemoryRepoSeed {
  events?: StoredEvent[];
  nights?: Night[];
  checks?: EveningCheck[];
  naps?: Nap[];
  /** Hash dei token attivi. */
  tokenHashes?: string[];
  /** Impostazioni chiave/valore; se assente valgono i default (target 450 minuti, fuso Europe/Rome). */
  settings?: Record<string, unknown>;
  /** Orologio per createdAt/lastUsedAt dei token (default: ora reale). */
  now?: () => Date;
}

interface TokenRecord extends ApiTokenInfo {
  hash: string;
}

/** Solo i metadati: l'hash non esce dal repo. */
function toInfo(t: TokenRecord): ApiTokenInfo {
  return { id: t.id, label: t.label, active: t.active, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt };
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DEFAULT_EXCEPTION_TYPES: ExceptionTypeRow[] = [
  { slug: 'malattia', label: 'malattia', uses: 0 },
  { slug: 'viaggio', label: 'viaggio', uses: 0 },
  { slug: 'festa', label: 'festa', uses: 0 },
  { slug: 'notte-in-bianco', label: 'notte in bianco', uses: 0 },
  { slug: 'alcol', label: 'alcol', uses: 0 },
];

const DEFAULT_SETTINGS: Record<string, unknown> = { target_sleep_minutes: 450, timezone: 'Europe/Rome' };

export class MemoryRepo implements Repo {
  private readonly eventsByKey = new Map<string, StoredEvent>();
  private readonly nightsByDate = new Map<string, Night>();
  private readonly checksByDate = new Map<string, EveningCheck>();
  private readonly napsByKey = new Map<string, Nap>();
  private readonly tokens = new Map<string, TokenRecord>();
  private nextTokenId = 1;
  private readonly now: () => Date;
  private readonly exceptionTypesBySlug = new Map<string, ExceptionTypeRow>();
  private readonly exceptionsByNight = new Map<string, string[]>();
  private readonly questionRows: QuestionLogRow[] = [];
  private readonly settingsByKey = new Map<string, unknown>();

  constructor(seed: MemoryRepoSeed = {}) {
    this.now = seed.now ?? (() => new Date());
    for (const e of seed.events ?? []) this.eventsByKey.set(e.idempotencyKey, clone(e));
    for (const n of seed.nights ?? []) this.nightsByDate.set(n.nightDate, clone(n));
    for (const c of seed.checks ?? []) this.checksByDate.set(c.date, clone(c));
    for (const n of seed.naps ?? []) this.napsByKey.set(`${n.date}|${n.startAt}`, clone(n));
    for (const t of seed.tokenHashes ?? []) this.addToken(t);
    for (const t of DEFAULT_EXCEPTION_TYPES) this.exceptionTypesBySlug.set(t.slug, clone(t));
    for (const [k, v] of Object.entries(seed.settings ?? DEFAULT_SETTINGS)) this.settingsByKey.set(k, clone(v));
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

  /** Registro delle domande, in ordine di inserimento. */
  get questions(): QuestionLogRow[] {
    return this.questionRows.map(clone);
  }

  /** Eccezioni per notte (slug in ordine alfabetico), solo le notti che ne hanno almeno una. */
  get exceptions(): Record<string, string[]> {
    return this.listNightExceptionsSync('0000-00-00', '9999-99-99');
  }

  /** Tipi di eccezione nello stesso ordine di `listExceptionTypes`. */
  get exceptionTypes(): ExceptionTypeRow[] {
    return [...this.exceptionTypesBySlug.values()]
      .map(clone)
      .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label));
  }

  /** Tutte le impostazioni. */
  get settings(): Record<string, unknown> {
    return clone(Object.fromEntries(this.settingsByKey));
  }

  /** Hash di tutti i token (attivi e revocati): serve ai test per verificare che il chiaro non sia mai salvato. */
  get tokenHashes(): string[] {
    return [...this.tokens.keys()];
  }

  /** Registra un token attivo dato il suo hash (seed, token di prova). Idempotente sull'hash. */
  addToken(tokenHash: string, label = 'Token'): void {
    if (this.tokens.has(tokenHash)) return;
    this.tokens.set(tokenHash, {
      hash: tokenHash,
      id: this.nextTokenId++,
      label,
      active: true,
      createdAt: this.now().toISOString(),
      lastUsedAt: null,
    });
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
    const t = this.tokens.get(tokenHash);
    if (!t || !t.active) return false;
    t.lastUsedAt = this.now().toISOString();
    return true;
  }

  async createToken(input: { tokenHash: string; label: string }): Promise<ApiTokenInfo> {
    const label = typeof input.label === 'string' ? input.label.trim() : '';
    if (label.length < 1 || label.length > 40) throw new Error('Etichetta non valida.');
    if (this.tokens.has(input.tokenHash)) throw new Error('Token già presente.');
    this.addToken(input.tokenHash, label);
    return toInfo(this.tokens.get(input.tokenHash)!);
  }

  async listTokens(): Promise<ApiTokenInfo[]> {
    return [...this.tokens.values()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id)
      .map(toInfo);
  }

  async revokeToken(id: number): Promise<boolean> {
    const t = [...this.tokens.values()].find((x) => x.id === id);
    if (!t) return false;
    t.active = false;
    return true;
  }

  async overwriteNight(night: Night): Promise<void> {
    this.nightsByDate.set(night.nightDate, clone(night));
  }

  async listNaps(fromDate: string, toDate: string): Promise<Nap[]> {
    return this.naps.filter((n) => n.date >= fromDate && n.date <= toDate);
  }

  async listEveningChecks(fromDate: string, toDate: string): Promise<EveningCheck[]> {
    return this.checks.filter((c) => c.date >= fromDate && c.date <= toDate);
  }

  async listExceptionTypes(): Promise<ExceptionTypeRow[]> {
    return this.exceptionTypes;
  }

  async setNightExceptions(nightDate: string, slugs: string[]): Promise<void> {
    for (const s of slugs) if (!SLUG_RE.test(s)) throw new Error('Slug non valido.');
    const next = new Set(slugs);
    const prev = new Set(this.exceptionsByNight.get(nightDate) ?? []);
    for (const slug of next) {
      if (prev.has(slug)) continue;
      const row = this.exceptionTypesBySlug.get(slug);
      if (row) row.uses += 1;
      else this.exceptionTypesBySlug.set(slug, { slug, label: slug.replace(/-/g, ' '), uses: 1 });
    }
    for (const slug of prev) {
      if (next.has(slug)) continue;
      const row = this.exceptionTypesBySlug.get(slug);
      if (row) row.uses = Math.max(0, row.uses - 1);
    }
    if (next.size === 0) this.exceptionsByNight.delete(nightDate);
    else this.exceptionsByNight.set(nightDate, [...next].sort());
  }

  async listNightExceptions(fromDate: string, toDate: string): Promise<Record<string, string[]>> {
    return this.listNightExceptionsSync(fromDate, toDate);
  }

  private listNightExceptionsSync(fromDate: string, toDate: string): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [date, slugs] of [...this.exceptionsByNight.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (date >= fromDate && date <= toDate && slugs.length > 0) out[date] = [...slugs];
    }
    return out;
  }

  async logQuestion(q: QuestionLogRow): Promise<void> {
    this.questionRows.push(clone(q));
  }

  async listQuestions(fromDate: string, toDate: string): Promise<QuestionLogRow[]> {
    return this.questionRows.filter((q) => q.date >= fromDate && q.date <= toDate).map(clone);
  }

  async getSetting<T = unknown>(key: string): Promise<T | null> {
    return this.settingsByKey.has(key) ? clone(this.settingsByKey.get(key) as T) : null;
  }
}
