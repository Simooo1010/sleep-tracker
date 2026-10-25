/**
 * Dati della pagina Segnali: legge dal repo e costruisce la view (funzione pura `buildSignalsView`).
 * Nessun accesso a variabili globali: repo e istante arrivano dal chiamante.
 */
import { localToIso } from '@/domain/estimate';
import { addDays } from '@/domain/time';
import { todayInRome } from '@/lib/clock';
import type { Repo } from '@/server/types';
import { buildSignalsView, type SignalsView } from '@/server/views';

/** Giorni di eventi letti: bastano per l'ultimo segnale di ogni riga e per il registro. */
export const SIGNALS_EVENT_DAYS = 30;
/** Notti e check serali letti per le righe "Stima di riserva" e "Recupero sonnellino". */
export const SIGNALS_RECENT_DAYS = 14;

export interface SignalsPageData {
  /** Data locale di oggi ('YYYY-MM-DD'). */
  today: string;
  view: SignalsView;
}

export async function loadSignalsPage(repo: Repo, now: Date): Promise<SignalsPageData> {
  const today = todayInRome(now);
  const recentFrom = addDays(today, -SIGNALS_RECENT_DAYS);

  const [events, nights, eveningChecks] = await Promise.all([
    repo.listEvents(localToIso(addDays(today, -SIGNALS_EVENT_DAYS), 0), now.toISOString()),
    repo.listNights(recentFrom, today),
    repo.listEveningChecks(recentFrom, today),
  ]);

  // Il tracciamento degli avvisi già mostrati non è ancora persistito: finché non lo è, `alreadyWarned`
  // resta vuoto e l'avviso (uno solo, neutro) compare finché il segnale resta in pausa.
  const view = buildSignalsView({ today, events, nights, eveningChecks, alreadyWarned: [] });
  return { today, view };
}
