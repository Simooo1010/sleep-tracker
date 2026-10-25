/**
 * Caricamento dei dati della pagina Regolarità (`/regolarita`).
 * Legge le notti degli ultimi 60 giorni dal repo e costruisce il view model con `buildRegularityView`.
 * Funzione senza orologio proprio: `now` è un parametro (in pagina arriva da `getNow()`).
 */
import { addDays } from '../../domain/time';
import { todayInRome } from '../../lib/clock';
import type { Repo } from '../types';
import { buildRegularityView, type RegularityView } from '../views/regularity';

/** Giorni di storia letti: copre la finestra di 14 notti, le 6 mediane settimanali della deriva e i weekend. */
export const REGULARITY_HISTORY_DAYS = 60;

export interface RegularityPageData {
  /** Data locale di oggi 'YYYY-MM-DD' (Europe/Rome). */
  today: string;
  view: RegularityView;
}

export async function loadRegularityPage(repo: Repo, now: Date): Promise<RegularityPageData> {
  const today = todayInRome(now);
  const nights = await repo.listNights(addDays(today, -REGULARITY_HISTORY_DAYS), today);
  return { today, view: buildRegularityView({ today, nights }) };
}
