/**
 * Dati della pagina /analisi: legge dal repo e costruisce la view (funzione pura `buildAnalysisView`).
 * Nessun accesso a variabili globali: repo, istante e periodo arrivano dal chiamante.
 */
import { addDays } from '@/domain/time';
import { todayInRome } from '@/lib/clock';
import type { Repo } from '@/server/types';
import { buildAnalysisView } from '@/server/views/analysis';
import {
  ANALYSIS_PERIODS,
  DEFAULT_ANALYSIS_PERIOD,
  type AnalysisPeriod,
  type AnalysisView,
} from '@/server/views/analysis-types';

/** Notti lette: riferimento a 14 giorni, deriva a 42 giorni e correlazioni sullo storico (circa 6 mesi). */
export const ANALYSIS_NIGHT_DAYS = 190;
/** Sonnellini e check serali letti: bastano le ultime 8 settimane. */
export const ANALYSIS_RECENT_DAYS = 60;

export interface AnalysisPageData {
  /** Data locale di oggi ('YYYY-MM-DD', Europe/Rome). */
  today: string;
  period: AnalysisPeriod;
  view: AnalysisView;
}

/** Periodo dal parametro di ricerca (`?periodo=7`): default 14, valori non validi → 14. */
export function parseAnalysisPeriod(raw: string | string[] | undefined): AnalysisPeriod {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== 'string' || !/^\d+$/.test(first.trim())) return DEFAULT_ANALYSIS_PERIOD;
  const n = Number(first.trim());
  return ANALYSIS_PERIODS.find((p) => p === n) ?? DEFAULT_ANALYSIS_PERIOD;
}

export async function loadAnalysisPage(repo: Repo, now: Date, period: AnalysisPeriod): Promise<AnalysisPageData> {
  const today = todayInRome(now);
  const safePeriod = parseAnalysisPeriod(String(period));
  const recentFrom = addDays(today, -ANALYSIS_RECENT_DAYS);

  const [nights, naps, eveningChecks, target] = await Promise.all([
    repo.listNights(addDays(today, -ANALYSIS_NIGHT_DAYS), today),
    repo.listNaps(recentFrom, today),
    repo.listEveningChecks(recentFrom, today),
    repo.getSetting<number>('target_sleep_minutes'),
  ]);

  const view = buildAnalysisView({
    today,
    nights,
    naps,
    eveningChecks,
    period: safePeriod,
    ...(typeof target === 'number' && Number.isFinite(target) && target > 0 ? { targetMin: target } : {}),
  });
  return { today, period: safePeriod, view };
}
