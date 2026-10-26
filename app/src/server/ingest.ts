/**
 * Ingestione di un evento dai Comandi iOS (POST /api/events), docs/PROJECT.md §3b/§3c.
 * Dipende solo da `Repo`: salva l'evento (idempotente), aggiorna check serale / sonnellini
 * e ricostruisce la notte interessata. Nessun dato è obbligatorio: un evento isolato non
 * produce mai errori, al più una notte 'stimata' o 'mancante'.
 */
import { estimateMissing, ESTIMATE_WINDOW_DAYS, localToIso } from '../domain/estimate';
import { napFromCheck, napsFromEvents } from '../domain/naps';
import { reconstructNight } from '../domain/reconstruction';
import { addDays, localParts } from '../domain/time';
import type { EveningCheck, Nap, Night, Score, SignalEvent, Tracked } from '../domain/types';
import type { IncomingEvent, IngestResult, Repo } from './types';

export type ValidatedEvent = IncomingEvent & { ts: string; idempotencyKey: string };

/** Finestra del risveglio (minuti locali): [03:00, 14:00]. Coerente con reconstruction.ts. */
const WAKE_FROM_MIN = 3 * 60;
const WAKE_TO_MIN = 14 * 60;
/** Prima di quest'ora locale un evento "serale" appartiene alla notte del giorno stesso. */
const EARLY_MORNING_MIN = 6 * 60;
/** Finestra eventi di una notte: [nightDate−1 18:00, nightDate 14:00] locali. */
const NIGHT_FROM_MIN = 18 * 60;
const NIGHT_TO_MIN = 14 * 60;

const missing = <T>(): Tracked<T> => ({ value: null, provenance: 'mancante' });

/**
 * Notte (nightDate = data locale del risveglio) interessata dall'evento, o null se l'evento
 * non riguarda una notte (sonnellini, risvegli fuori finestra).
 */
export function nightDateForEvent(type: IncomingEvent['type'], ts: string): string | null {
  const { date, minutes } = localParts(ts);
  switch (type) {
    case 'wake':
    case 'app_open':
      return minutes >= WAKE_FROM_MIN && minutes <= WAKE_TO_MIN ? date : null;
    case 'bedtime_candidate':
    case 'evening_check':
      return minutes < EARLY_MORNING_MIN ? date : addDays(date, 1);
    default:
      return null;
  }
}

function confirmed<T>(value: T | undefined, previous: Tracked<T> | undefined): Tracked<T> {
  if (value !== undefined) return { value, provenance: 'confermato' };
  return previous ?? missing<T>();
}

/** Check serale: campi forniti → 'confermato'; non forniti → valore già salvato quella sera, altrimenti mancante. */
async function saveEveningCheck(repo: Repo, ev: ValidatedEvent): Promise<void> {
  const date = localParts(ev.ts).date;
  const previous = await repo.getEveningCheck(date);
  const c = ev.check ?? {};
  const check: EveningCheck = {
    date,
    tiredness: confirmed<Score>(c.tiredness, previous?.tiredness),
    mood: confirmed<Score>(c.mood, previous?.mood),
    factors: c.factors !== undefined ? [...c.factors] : [...(previous?.factors ?? [])],
    napMinutesToday: confirmed<number>(c.napMinutesToday, previous?.napMinutesToday),
  };
  const note = c.dayNote !== undefined ? c.dayNote : previous?.dayNote;
  if (note !== undefined) check.dayNote = note;
  await repo.saveEveningCheck(check);
  if (c.napMinutesToday !== undefined && c.napMinutesToday > 0) {
    const nap = napFromCheck(check);
    if (nap) await repo.saveNap(nap);
  }
}

const napKey = (n: Nap) => `${n.startAt}|${n.minutes}`;

/** Salva i sonnellini della giornata che esistono solo grazie a questo evento (gli altri sono già salvati). */
async function saveNewNaps(repo: Repo, ev: ValidatedEvent): Promise<void> {
  const date = localParts(ev.ts).date;
  const dayEvents = await repo.listEvents(localToIso(date, 0), localToIso(addDays(date, 1), 0));
  const withEvent = napsFromEvents(dayEvents);
  const without = new Set(
    napsFromEvents(dayEvents.filter((e) => !(e.type === ev.type && e.ts === ev.ts))).map(napKey),
  );
  for (const nap of withEvent) {
    if (!without.has(napKey(nap))) await repo.saveNap(nap);
  }
}

/** Un campo già confermato dall'utente non viene sostituito da una ricostruzione. */
function keepConfirmed(next: Tracked<string>, prev: Tracked<string> | undefined): Tracked<string> {
  return prev?.provenance === 'confermato' && prev.value !== null ? prev : next;
}

/** Ricostruisce e salva la notte. Una notte 'confermata' non viene mai toccata. */
async function rebuildNight(repo: Repo, nightDate: string): Promise<void> {
  const existing = await repo.getNight(nightDate);
  if (existing?.status === 'confermata') return;

  const eveningDate = addDays(nightDate, -1);
  const [events, evening, history] = await Promise.all([
    repo.listEvents(localToIso(eveningDate, NIGHT_FROM_MIN), localToIso(nightDate, NIGHT_TO_MIN)),
    repo.getEveningCheck(eveningDate),
    repo.listNights(addDays(nightDate, -ESTIMATE_WINDOW_DAYS), addDays(nightDate, -1)),
  ]);

  const rebuilt = reconstructNight(events, nightDate, evening);
  const bedAt = keepConfirmed(rebuilt.bedAt, existing?.bedAt);
  const wakeAt = keepConfirmed(rebuilt.wakeAt, existing?.wakeAt);
  const hasAny = bedAt.value !== null || wakeAt.value !== null;

  const draft: Night = {
    nightDate,
    bedAt,
    wakeAt,
    status: hasAny ? 'stimata' : 'mancante',
    quality: existing?.quality ?? missing<Score>(),
    energy: existing?.energy ?? missing<Score>(),
    isException: existing?.isException ?? false,
    factors:
      existing && existing.factors.length > 0 ? [...existing.factors] : [...(evening?.factors ?? [])],
  };

  // false = notte diventata 'confermata' nel frattempo: non è un errore.
  await repo.upsertNight(estimateMissing(draft, history));
}

/**
 * Ingerisce un evento già validato (ts e idempotencyKey presenti).
 * Duplicato (stessa idempotencyKey) → `{ ok: true, duplicate: true }` senza ricalcoli.
 * `now` non è usato: l'orario dell'evento è già in `ev.ts`.
 */
export async function ingestEvent(
  repo: Repo,
  ev: ValidatedEvent,
  now: Date,
  source: 'comandi' | 'app' = 'comandi',
): Promise<IngestResult> {
  void now;
  if (Number.isNaN(Date.parse(ev.ts))) return { ok: false, status: 400, error: 'ts non valido' };

  const nightDate = nightDateForEvent(ev.type, ev.ts);
  const stored: SignalEvent & { idempotencyKey: string } = {
    type: ev.type,
    ts: ev.ts,
    source,
    idempotencyKey: ev.idempotencyKey,
  };
  const { inserted } = await repo.insertEvent(stored);
  if (!inserted) return { ok: true, duplicate: true, nightDate };

  if (ev.type === 'evening_check') await saveEveningCheck(repo, ev);
  if (ev.type === 'nap_end') await saveNewNaps(repo, ev);
  if (nightDate !== null) await rebuildNight(repo, nightDate);

  return { ok: true, duplicate: false, nightDate };
}
