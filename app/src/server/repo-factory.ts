import { getNow } from '../lib/clock';
import { MemoryRepo } from './memory-repo';
import { createServiceClient, createSupabaseRepo } from './repo-supabase';
import { buildDemoSeed, demoNightExceptions } from './seed';
import { hashToken } from './token';
import type { Repo } from './types';

/**
 * Chiave sul `globalThis` del repo in memoria. In `next dev` le Server Actions e le route handler girano in
 * bundle separati: una variabile di modulo esisterebbe due volte (il token creato da un'azione non esisterebbe
 * per `/api/events`). `Symbol.for` è condiviso fra tutti i moduli del processo.
 */
export const MEMORY_REPO_KEY = Symbol.for('sleep-tracker.memory-repo');

type GlobalWithMemoryRepo = typeof globalThis & { [MEMORY_REPO_KEY]?: MemoryRepo };

let remote: Repo | undefined;

/**
 * Repo di produzione = Supabase (service role, solo server).
 * `APP_DATA_MODE=memory` abilita un repo in memoria SOLO per sviluppo e test E2E: mai in produzione.
 * Solo in memoria: `APP_SEED=demo` carica il dataset demo di 60 giorni (ancorato a `getNow`, quindi a
 * `APP_FIXED_NOW` se impostato) e `DEMO_INGEST_TOKEN` registra un token di prova per i Comandi.
 */
export function getRepo(env: NodeJS.ProcessEnv = process.env): Repo {
  if (env.APP_DATA_MODE === 'memory' && env.NODE_ENV !== 'production') {
    const store = globalThis as GlobalWithMemoryRepo;
    let memory = store[MEMORY_REPO_KEY];
    if (!memory) {
      const seed = env.APP_SEED === 'demo' ? buildDemoSeed(getNow(env).toISOString()) : undefined;
      memory = new MemoryRepo(seed);
      store[MEMORY_REPO_KEY] = memory;
      // Il seed non porta le eccezioni per notte: si impostano qui (setNightExceptions è sincrona di fatto).
      for (const [date, slugs] of Object.entries(demoNightExceptions(seed?.nights ?? []))) {
        void memory.setNightExceptions(date, slugs);
      }
    }
    if (env.DEMO_INGEST_TOKEN && env.INGEST_TOKEN_PEPPER) {
      memory.addToken(hashToken(env.DEMO_INGEST_TOKEN, env.INGEST_TOKEN_PEPPER));
    }
    return memory;
  }
  remote ??= createSupabaseRepo(createServiceClient(env));
  return remote;
}
