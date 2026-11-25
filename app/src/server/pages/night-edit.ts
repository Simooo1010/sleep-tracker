/**
 * Dati della pagina «Modifica notte» (`/storico/[date]`): valida la data, legge dal repo e costruisce
 * la view (funzione pura `buildNightEditView`). Ritorna null se la data non è valida o è futura (404).
 */
import { addDays } from '@/domain/time';
import { todayInRome } from '@/lib/clock';
import { isValidDay } from '@/server/pages/history';
import type { NightEditView } from '@/server/night-edit-contract';
import type { Repo } from '@/server/types';
import { buildNightEditView } from '@/server/views';

/** Quante notti precedenti servono per la mediana dei suggeriti. */
export const NIGHT_EDIT_HISTORY_DAYS = 60;

export interface NightEditPageData {
  today: string;
  view: NightEditView;
}

export async function loadNightEditPage(repo: Repo, now: Date, date: string): Promise<NightEditPageData | null> {
  if (!isValidDay(date)) return null;
  const today = todayInRome(now);
  if (date > today) return null;

  const eveningDate = addDays(date, -1);
  const [night, nights, naps, eveningCheck, exceptionTypes, nightExceptions] = await Promise.all([
    repo.getNight(date),
    repo.listNights(addDays(date, -NIGHT_EDIT_HISTORY_DAYS), eveningDate),
    repo.listNaps(date, date),
    repo.getEveningCheck(eveningDate),
    repo.listExceptionTypes(),
    repo.listNightExceptions(date, date),
  ]);

  const factorLabels: Record<string, string> = {};
  for (const t of exceptionTypes) factorLabels[t.slug] = t.label;

  const view = buildNightEditView({
    date,
    today,
    night,
    nights,
    naps,
    eveningCheck,
    exceptionTypes: exceptionTypes.map((t) => ({ slug: t.slug, label: t.label, uses: t.uses })),
    activeExceptions: nightExceptions[date] ?? [],
    factorLabels,
  });
  return { today, view };
}
