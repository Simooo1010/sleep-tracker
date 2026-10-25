/**
 * Dati della pagina Grafici: legge dal repo e costruisce la view (funzione pura `buildChartsView`).
 * Nessun accesso a variabili globali: repo e istante arrivano dal chiamante.
 */
import { addDays } from '@/domain/time';
import { todayInRome } from '@/lib/clock';
import type { Repo } from '@/server/types';
import { buildChartsView, type ChartsView } from '@/server/views';

/** Notti lette: servono per il trend a 6 mesi (circa 190 giorni). */
export const CHARTS_NIGHT_DAYS = 190;
/** Sonnellini e check serali letti: bastano le ultime 8 settimane. */
export const CHARTS_RECENT_DAYS = 60;

export interface ChartsPageData {
  /** Data locale di oggi ('YYYY-MM-DD', Europe/Rome). */
  today: string;
  view: ChartsView;
}

export async function loadChartsPage(repo: Repo, now: Date): Promise<ChartsPageData> {
  const today = todayInRome(now);
  const recentFrom = addDays(today, -CHARTS_RECENT_DAYS);

  const [nights, naps, eveningChecks, target] = await Promise.all([
    repo.listNights(addDays(today, -CHARTS_NIGHT_DAYS), today),
    repo.listNaps(recentFrom, today),
    repo.listEveningChecks(recentFrom, today),
    repo.getSetting<number>('target_sleep_minutes'),
  ]);

  const view = buildChartsView({
    today,
    nights,
    naps,
    eveningChecks,
    ...(typeof target === 'number' && Number.isFinite(target) && target > 0 ? { targetMin: target } : {}),
  });
  return { today, view };
}
