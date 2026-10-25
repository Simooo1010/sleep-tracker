/**
 * Dati della pagina Notte: legge dal repo e costruisce la view (funzione pura `buildNightView`).
 * Nessun accesso a variabili globali: repo e istante arrivano dal chiamante.
 */
import { localToIso } from '@/domain/estimate';
import type { AskedQuestion, ChipType } from '@/domain/questions';
import { addDays } from '@/domain/time';
import { todayInRome } from '@/lib/clock';
import type { Repo } from '@/server/types';
import { buildNightView, type NightView, type NightViewInput } from '@/server/views';

/** Notti lette per riferimento, regolarità e statistiche. */
export const NIGHT_HISTORY_DAYS = 60;
/** Sonnellini e check serali letti per sonno 24 ore e domande. */
export const NAP_CHECK_DAYS = 14;
/** Finestra dei segnali della notte: dalle 18:00 di ieri alle 14:00 di oggi (ora locale). */
const WINDOW_START_MIN = 18 * 60;
const WINDOW_END_MIN = 14 * 60;

export interface NightPageData {
  /** Data locale di oggi ('YYYY-MM-DD'): è anche l'identificativo della notte di stanotte. */
  today: string;
  view: NightView;
}

export async function loadNightPage(repo: Repo, now: Date): Promise<NightPageData> {
  const today = todayInRome(now);
  const fromEvents = localToIso(addDays(today, -1), WINDOW_START_MIN);
  const toEvents = localToIso(today, WINDOW_END_MIN);
  const recentFrom = addDays(today, -NAP_CHECK_DAYS);

  const [nights, events, naps, eveningChecks, questions, exceptionTypes, target] = await Promise.all([
    repo.listNights(addDays(today, -NIGHT_HISTORY_DAYS), today),
    repo.listEvents(fromEvents, toEvents),
    repo.listNaps(recentFrom, today),
    repo.listEveningChecks(recentFrom, today),
    repo.listQuestions(today, today),
    repo.listExceptionTypes(),
    repo.getSetting<number>('target_sleep_minutes'),
  ]);

  const asked: AskedQuestion[] = questions.map((q) => ({
    date: q.date,
    kind: q.kind,
    ...(q.nightDate !== undefined ? { nightDate: q.nightDate } : {}),
    answeredOrSkipped: q.answeredOrSkipped,
  }));
  const chipTypes: ChipType[] = exceptionTypes.map((t) => ({ slug: t.slug, label: t.label, uses: t.uses }));

  const input: NightViewInput = {
    today,
    nights,
    events,
    naps,
    eveningChecks,
    asked,
    exceptionTypes: chipTypes,
    ...(typeof target === 'number' && Number.isFinite(target) && target > 0 ? { targetMin: target } : {}),
  };
  return { today, view: buildNightView(input) };
}
