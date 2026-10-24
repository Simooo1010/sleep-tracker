import { MemoryRepo } from './memory-repo';
import { createServiceClient, createSupabaseRepo } from './repo-supabase';
import type { Repo } from './types';

let memory: MemoryRepo | undefined;

/**
 * Repo di produzione = Supabase (service role, solo server).
 * `APP_DATA_MODE=memory` abilita un repo in memoria SOLO per sviluppo e test E2E: mai in produzione.
 */
export function getRepo(env: NodeJS.ProcessEnv = process.env): Repo {
  if (env.APP_DATA_MODE === 'memory' && env.NODE_ENV !== 'production') {
    memory ??= new MemoryRepo();
    return memory;
  }
  return createSupabaseRepo(createServiceClient(env));
}
