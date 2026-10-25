'use client';

import { useState, useTransition } from 'react';

import { actionConfirmNight, actionRateNight, actionUndoConfirmNight } from '@/app/actions';
import { MoonRating, toScore } from '@/components/MoonRating';
import { SessionCard, type SessionRegularity, type SessionStatus } from '@/components/SessionCard';
import { TimeStepper, parseTime, type TimeField } from '@/components/TimeStepper';
import { Timeline, type TimelineEvent } from '@/components/Timeline';
import { localToIso } from '@/domain/estimate';
import { addDays, durationMinutes } from '@/domain/time';
import type { Night, Score } from '@/domain/types';
import type { NightView } from '@/server/views';
import { formatHm, formatScore } from '@/server/views/format';

import styles from './NightScreen.module.css';
import { NightSections } from './NightSections';

/**
 * Pagina Notte (mattino): scheda Stanotte con conferma, correzione degli orari e voto di energia,
 * poi la timeline e le sezioni secondarie. Stato ottimistico: la scheda cambia subito e torna
 * indietro, con un messaggio calmo, se il server non riesce a salvare.
 */

/** Orari predefiniti quando la notte non ha orari (o ne manca uno): punto di partenza del TimeStepper. */
export const DEFAULT_BED_TIME = '23:30';
export const DEFAULT_WAKE_TIME = '07:30';
/** Da questa ora in poi (18:00) l'orario di letto è della sera prima; prima è dopo mezzanotte. */
const BED_EVENING_FROM_MIN = 18 * 60;

const CONFIRMED_EXPLANATION = 'Orari confermati da te.';
const INCOHERENT_TIMES =
  'Gli orari non sono coerenti: il letto deve venire prima della sveglia. Correggili e riprova.';
const NETWORK_ERROR = 'Non sono riuscito a salvare. Controlla la connessione e riprova.';

/**
 * Orario "HH:MM" (Europe/Rome) → istante ISO UTC per la notte `nightDate` (data del risveglio).
 * Letto: dalle 18:00 in poi è la sera prima, altrimenti è dopo la mezzanotte del giorno stesso.
 * Sveglia: sempre il giorno della notte. Un orario non valido ritorna null.
 */
export function toNightIso(nightDate: string, time: string, field: TimeField): string | null {
  const minutes = parseTime(time);
  if (minutes === null) return null;
  if (field === 'bed' && minutes >= BED_EVENING_FROM_MIN) return localToIso(addDays(nightDate, -1), minutes);
  return localToIso(nightDate, minutes);
}

/** Cosa mostra la scheda: derivato dalla view o, finché il server risponde, dalla scelta appena fatta. */
interface Shown {
  status: SessionStatus;
  bedText: string | null;
  wakeText: string | null;
  durationText: string | null;
  explanation: string;
  showRegularity: boolean;
}

function shownFromView(view: NightView): Shown {
  return {
    status: view.status,
    bedText: view.bed.iso === null ? null : view.bed.text,
    wakeText: view.wake.iso === null ? null : view.wake.text,
    durationText: view.durationMin === null ? null : view.durationText,
    explanation: view.explanation,
    showRegularity: true,
  };
}

interface EnergyState {
  value: Score | null;
  /** Provenienza in parola ("Confermato"). */
  word: string;
}

function energyFromView(view: NightView): EnergyState {
  return { value: toScore(view.energy.value), word: view.energy.provenanceWord };
}

interface Times {
  bed: string;
  wake: string;
}

export interface NightScreenProps {
  view: NightView;
  /** Data di oggi ('YYYY-MM-DD'), uguale a `view.nightDate`. */
  todayDate: string;
}

export function NightScreen({ view, todayDate }: NightScreenProps) {
  const nightDate = view.nightDate || todayDate;
  const [pending, startTransition] = useTransition();
  const [seenView, setSeenView] = useState(view);
  const [override, setOverride] = useState<Shown | null>(null);
  const [energy, setEnergy] = useState<EnergyState>(() => energyFromView(view));
  // Per l'Annulla: com'era la scheda prima di confermare e la notte che il server ha sostituito.
  const [undo, setUndo] = useState<{ before: Shown; previous: Night | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [times, setTimes] = useState<Times>({ bed: DEFAULT_BED_TIME, wake: DEFAULT_WAKE_TIME });
  const [error, setError] = useState<string | null>(null);

  // Quando il server manda una view nuova (dopo revalidate) vale quella: la scelta ottimistica decade.
  if (seenView !== view) {
    setSeenView(view);
    setOverride(null);
    setEnergy(energyFromView(view));
  }

  const shown = override ?? shownFromView(view);
  const status = shown.status;

  const fail = (message: string) => setError(`${message.trim()} Riprova tra poco.`);

  const openEditor = () => {
    setError(null);
    setTimes({ bed: shown.bedText ?? DEFAULT_BED_TIME, wake: shown.wakeText ?? DEFAULT_WAKE_TIME });
    setEditing(true);
  };

  const commit = (next: Shown, payload: { bedAt?: string; wakeAt?: string }) => {
    if (pending) return;
    const before = shown;
    setError(null);
    setOverride(next);
    setEditing(false);
    startTransition(async () => {
      try {
        const result = await actionConfirmNight({ nightDate, ...payload });
        if (result.ok) {
          setUndo({ before, previous: result.value?.previous ?? null });
        } else {
          setOverride(before);
          fail(result.error);
        }
      } catch {
        setOverride(before);
        setError(NETWORK_ERROR);
      }
    });
  };

  const confirm = () => {
    // Se manca un orario non c'è nulla da confermare: si passa alla correzione, senza inventare dati.
    if (shown.bedText === null || shown.wakeText === null) {
      openEditor();
      return;
    }
    commit({ ...shown, status: 'confermata', explanation: CONFIRMED_EXPLANATION }, {});
  };

  const confirmWithTimes = () => {
    const bedAt = toNightIso(nightDate, times.bed, 'bed');
    const wakeAt = toNightIso(nightDate, times.wake, 'wake');
    if (bedAt === null || wakeAt === null || Date.parse(wakeAt) <= Date.parse(bedAt)) {
      setError(INCOHERENT_TIMES);
      return;
    }
    commit(
      {
        status: 'confermata',
        bedText: times.bed,
        wakeText: times.wake,
        durationText: formatHm(durationMinutes(bedAt, wakeAt)),
        explanation: CONFIRMED_EXPLANATION,
        showRegularity: false,
      },
      { bedAt, wakeAt },
    );
  };

  const undoConfirm = () => {
    if (pending || !undo) return;
    const { before, previous } = undo;
    const confirmed = shown;
    setError(null);
    setOverride(before);
    setEditing(false);
    startTransition(async () => {
      try {
        const result = await actionUndoConfirmNight({ previous, nightDate });
        if (result.ok) {
          setUndo(null);
        } else {
          setOverride(confirmed);
          fail(result.error);
        }
      } catch {
        setOverride(confirmed);
        setError(NETWORK_ERROR);
      }
    });
  };

  const rate = (score: Score) => {
    if (pending) return;
    const before = energy;
    setError(null);
    setEnergy({ value: score, word: 'Confermato' });
    startTransition(async () => {
      try {
        const result = await actionRateNight({ nightDate, energy: score });
        if (!result.ok) {
          setEnergy(before);
          fail(result.error);
        }
      } catch {
        setEnergy(before);
        setError(NETWORK_ERROR);
      }
    });
  };

  const regularity: SessionRegularity | null =
    view.regularity && shown.showRegularity
      ? { text: `Letto ${view.regularity.bedText} · Sveglia ${view.regularity.wakeText}`, inTolerance: view.regularity.ok }
      : null;

  const timelineEvents: TimelineEvent[] = view.timeline.items.map((item, index) => ({
    id: `${item.ts ?? 'senza-ora'}-${index}`,
    time: item.time,
    title: item.title,
    source: item.origin,
    kind: item.kind,
  }));

  const showEnergy = status === 'confermata' && !editing;
  const hasSlot = editing || showEnergy || error !== null;
  const stepperLabel = status === 'mancante' ? 'Aggiungi orari' : 'Correggi orari';

  return (
    <div className={styles.page} aria-busy={pending}>
      <div className={styles.column}>
        <SessionCard
          status={status}
          duration={shown.durationText}
          bedtime={shown.bedText}
          wakeTime={shown.wakeText}
          explanation={shown.explanation}
          regularity={regularity}
          onConfirm={editing ? undefined : confirm}
          onCorrect={editing ? undefined : openEditor}
          onUndo={status === 'confermata' && undo && !editing ? undoConfirm : undefined}
        >
          {hasSlot ? (
            <div className={styles.slot}>
              {editing ? (
                <div className={styles.block}>
                  <TimeStepper
                    bedTime={times.bed}
                    wakeTime={times.wake}
                    label={stepperLabel}
                    onChange={(field, next) => setTimes((t) => ({ ...t, [field]: next }))}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-lg btn-block"
                    disabled={pending}
                    onClick={confirmWithTimes}
                  >
                    {status === 'mancante' ? 'Salva orari' : 'Conferma'}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setEditing(false)}>
                    Chiudi
                  </button>
                </div>
              ) : null}

              {showEnergy ? (
                <div className={styles.block}>
                  <p className={`body-sm muted ${styles.text}`}>Com’è l’energia stamattina? Se vuoi, scegli una luna.</p>
                  <MoonRating kind="energy" value={energy.value} onChange={rate} />
                  {energy.value !== null ? (
                    <p className={`caption muted ${styles.text}`}>
                      {`Energia ${formatScore(energy.value)} · ${energy.word}`}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {error !== null ? (
                <p role="alert" className={`body-sm ${styles.error}`}>
                  {error}
                </p>
              ) : null}
            </div>
          ) : undefined}
        </SessionCard>

        {timelineEvents.length > 0 ? <Timeline events={timelineEvents} title={view.timeline.title} /> : null}
      </div>

      <div className={styles.column}>
        <NightSections view={view} todayDate={todayDate} />
      </div>
    </div>
  );
}

export default NightScreen;
