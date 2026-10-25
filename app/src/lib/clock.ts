import { localParts } from '@/domain/time';

/**
 * Orologio dell'app. In produzione è sempre l'ora reale.
 * Solo in sviluppo/test (`NODE_ENV !== 'production'`) `APP_FIXED_NOW` (ISO) fissa l'istante, così
 * gli E2E sono deterministici. Mai usare `new Date()` direttamente nelle pagine: passare da qui.
 */
export function getNow(env: NodeJS.ProcessEnv = process.env): Date {
  const fixed = env.APP_FIXED_NOW;
  if (fixed && env.NODE_ENV !== 'production') {
    const d = new Date(fixed);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Data locale 'YYYY-MM-DD' (Europe/Rome) dell'istante dato. */
export function todayInRome(now: Date = getNow()): string {
  return localParts(now.toISOString()).date;
}
