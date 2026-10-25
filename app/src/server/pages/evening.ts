/**
 * Dati della pagina Sera: legge dal repo e costruisce la view (funzione pura `buildEveningView`).
 * Nessun accesso a variabili globali: repo e istante arrivano dal chiamante.
 */
import type { ChipType } from '@/domain/questions';
import { addDays, localParts } from '@/domain/time';
import { todayInRome } from '@/lib/clock';
import type { Repo } from '@/server/types';
import { buildEveningView, type EveningView } from '@/server/views';

/** Da questa ora locale (12:00, in minuti) le eccezioni si riferiscono alla notte che sta per iniziare. */
export const EVENING_SWITCH_MIN = 12 * 60;

export interface EveningPageData {
  /** Data locale di oggi ('YYYY-MM-DD'): è la data del check serale. */
  today: string;
  /** Notte a cui si riferiscono le eccezioni: domani se ora >= 12:00 locali, altrimenti oggi. */
  tonightNightDate: string;
  view: EveningView;
}

export async function loadEveningPage(repo: Repo, now: Date): Promise<EveningPageData> {
  const today = todayInRome(now);
  const tonightNightDate =
    localParts(now.toISOString()).minutes >= EVENING_SWITCH_MIN ? addDays(today, 1) : today;

  const [checks, naps, exceptionTypes, nightExceptions] = await Promise.all([
    repo.listEveningChecks(today, today),
    repo.listNaps(today, today),
    repo.listExceptionTypes(),
    repo.listNightExceptions(tonightNightDate, tonightNightDate),
  ]);

  const chipTypes: ChipType[] = exceptionTypes.map((t) => ({ slug: t.slug, label: t.label, uses: t.uses }));
  const view = buildEveningView({
    today,
    check: checks[0] ?? null,
    naps,
    exceptionTypes: chipTypes,
    activeExceptions: nightExceptions[tonightNightDate] ?? [],
    tonightNightDate,
  });
  return { today, tonightNightDate, view };
}
