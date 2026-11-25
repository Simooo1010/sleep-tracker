'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';

import { actionSaveNightDetails } from '@/app/actions';
import { toNightIso } from '@/app/NightScreen';
import { Badge } from '@/components/Badge';
import { Chip, MOODS } from '@/components/Chip';
import { ExceptionChips } from '@/components/ExceptionChips';
import { MoonRating, toScore } from '@/components/MoonRating';
import { TextField } from '@/components/TextField';
import { TimeInput } from '@/components/TimeInput';
import { DAY_NOTE_MAX } from '@/domain/questions';
import type { Score } from '@/domain/types';
import { durationMinutes } from '@/domain/time';
import type { NightEditInput, NightEditView } from '@/server/night-edit-contract';
import { nightEditHref } from '@/server/night-edit-contract';
import { DAY_NOTE_HINT, DAY_NOTE_PLACEHOLDER } from '@/server/views/evening';
import { DASH, formatHm } from '@/server/views/format';

import styles from './NightEditScreen.module.css';

/**
 * Schermata «Modifica notte» (docs/NIGHT_EDIT.md): completa o corregge una notte passata.
 * Nessun campo è obbligatorio e non c'è salvataggio automatico: un solo pulsante pieno, `Salva notte`,
 * attivo solo se c'è qualcosa di cambiato. Si inviano solo i campi cambiati (`buildNightEditInput`).
 */

export const SAVED_TEXT = 'Notte salvata.';
export const SAVE_ERROR_TEXT = 'Non sono riuscito a salvare. Le tue modifiche sono ancora qui: riprova.';
export const UNSAVED_TEXT = 'Hai modifiche non salvate. Salvarle prima di spostarti?';
export const MAX_NIGHT_MINUTES = 16 * 60;

export const TIMES_ORDER_TEXT = 'Il letto deve venire prima della sveglia. Controlla gli orari per poter salvare.';
export const TIMES_LONG_TEXT = 'Questa notte dura più di 16 ore. Controlla gli orari per poter salvare.';
export const TIMES_PARTIAL_TEXT = 'Per salvare gli orari servono sia il letto sia la sveglia.';

// --- Bozza e mappatura verso l'azione (funzioni pure) ----------------------------------------

export interface NightEditDraft {
  /** "HH:MM"; null = mancante. */
  bed: string | null;
  wake: string | null;
  quality: Score | null;
  energy: Score | null;
  /** Slug degli imprevisti attivi. */
  exceptions: string[];
  /** Etichette (slug → testo) degli imprevisti creati qui con `+ Aggiungi`. */
  exceptionLabels: Record<string, string>;
  tiredness: Score | null;
  mood: Score | null;
  /** Slug dei fattori della sera attivi. */
  factors: string[];
  dayNote: string;
}

const selectedSlugs = (options: readonly { slug: string; selected: boolean }[]): string[] =>
  options.filter((o) => o.selected).map((o) => o.slug);

/** Bozza iniziale: ciò che la view mostra adesso. */
export function draftFromView(view: NightEditView): NightEditDraft {
  return {
    bed: view.bedTime,
    wake: view.wakeTime,
    quality: view.quality,
    energy: view.energy,
    exceptions: selectedSlugs(view.exceptions),
    exceptionLabels: {},
    tiredness: view.tiredness,
    mood: view.mood,
    factors: selectedSlugs(view.factors),
    dayNote: view.dayNote,
  };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && new Set(a).size === new Set(b).size && a.every((x) => b.includes(x));

/** Aggiunge o toglie uno slug senza duplicati. */
export function withSlug(list: readonly string[], slug: string, on: boolean): string[] {
  const rest = list.filter((s) => s !== slug);
  return on ? [...rest, slug] : rest;
}

export type TimesState = 'same' | 'ok' | 'partial' | 'order' | 'long';

/** Cosa succede agli orari: invariati, salvabili, incompleti (ne manca uno) o incoerenti. */
export function timesState(view: NightEditView, draft: NightEditDraft): TimesState {
  if (draft.bed === view.bedTime && draft.wake === view.wakeTime) return 'same';
  if (draft.bed === null || draft.wake === null) return 'partial';
  const bedAt = toNightIso(view.date, draft.bed, 'bed');
  const wakeAt = toNightIso(view.date, draft.wake, 'wake');
  if (bedAt === null || wakeAt === null) return 'partial';
  const minutes = durationMinutes(bedAt, wakeAt);
  if (minutes <= 0) return 'order';
  if (minutes > MAX_NIGHT_MINUTES) return 'long';
  return 'ok';
}

/** Durata calcolata dagli orari della bozza, oppure `—` se non c'è una durata sensata. */
export function liveDurationText(view: NightEditView, draft: NightEditDraft): string {
  if (draft.bed === null || draft.wake === null) return DASH;
  const bedAt = toNightIso(view.date, draft.bed, 'bed');
  const wakeAt = toNightIso(view.date, draft.wake, 'wake');
  if (bedAt === null || wakeAt === null) return DASH;
  const minutes = durationMinutes(bedAt, wakeAt);
  return minutes > 0 && minutes <= MAX_NIGHT_MINUTES ? formatHm(minutes) : DASH;
}

const TIMES_MESSAGE: Partial<Record<TimesState, string>> = {
  partial: TIMES_PARTIAL_TEXT,
  order: TIMES_ORDER_TEXT,
  long: TIMES_LONG_TEXT,
};

/** Perché non si può salvare per colpa degli orari (parole), altrimenti null. */
export function timesProblem(view: NightEditView, draft: NightEditDraft): string | null {
  return TIMES_MESSAGE[timesState(view, draft)] ?? null;
}

/**
 * Input di `actionSaveNightDetails`: SOLO i campi cambiati rispetto alla view, oppure null se non è cambiato nulla.
 * `null` = rimozione di voto, umore o nota. Gli orari vanno sempre insieme e solo se sono completi.
 */
export function buildNightEditInput(view: NightEditView, draft: NightEditDraft): NightEditInput | null {
  const input: NightEditInput = { nightDate: view.date };
  let changed = false;

  if (draft.bed !== view.bedTime || draft.wake !== view.wakeTime) {
    if (draft.bed !== null && draft.wake !== null) {
      const bedAt = toNightIso(view.date, draft.bed, 'bed');
      const wakeAt = toNightIso(view.date, draft.wake, 'wake');
      if (bedAt !== null && wakeAt !== null) {
        input.times = { bedAt, wakeAt };
        changed = true;
      }
    }
  }
  if (draft.quality !== view.quality) {
    input.quality = draft.quality;
    changed = true;
  }
  if (draft.energy !== view.energy) {
    input.energy = draft.energy;
    changed = true;
  }
  if (!sameSet(draft.exceptions, selectedSlugs(view.exceptions))) {
    const known = new Set(view.exceptions.map((e) => e.slug));
    const labels: Record<string, string> = {};
    for (const slug of draft.exceptions) {
      const label = draft.exceptionLabels[slug];
      if (label !== undefined && !known.has(slug)) labels[slug] = label;
    }
    input.exceptions = Object.keys(labels).length > 0 ? { slugs: [...draft.exceptions], labels } : { slugs: [...draft.exceptions] };
    changed = true;
  }

  const evening: NonNullable<NightEditInput['evening']> = {};
  if (draft.tiredness !== view.tiredness) evening.tiredness = draft.tiredness;
  if (draft.mood !== view.mood) evening.mood = draft.mood;
  if (!sameSet(draft.factors, selectedSlugs(view.factors))) evening.factors = [...draft.factors];
  const note = draft.dayNote.trim();
  if (note !== view.dayNote.trim()) evening.dayNote = note === '' ? null : note;
  if (Object.keys(evening).length > 0) {
    input.evening = evening;
    changed = true;
  }

  return changed ? input : null;
}

/** La view com'è dopo un salvataggio riuscito: la bozza diventa il nuovo stato di base. */
export function applyDraftToView(view: NightEditView, draft: NightEditDraft): NightEditView {
  const timesSaved = timesState(view, draft) === 'ok';
  const known = new Set(view.exceptions.map((e) => e.slug));
  const added = draft.exceptions
    .filter((slug) => !known.has(slug))
    .map((slug) => ({ slug, label: draft.exceptionLabels[slug] ?? slug, selected: true }));
  return {
    ...view,
    status: timesSaved ? 'confermata' : view.status,
    statusWord: timesSaved ? 'Confermata' : view.statusWord,
    bedTime: draft.bed,
    wakeTime: draft.wake,
    durationText: timesSaved ? liveDurationText(view, draft) : view.durationText,
    quality: draft.quality,
    energy: draft.energy,
    exceptions: [...view.exceptions, ...added].map((e) => ({ ...e, selected: draft.exceptions.includes(e.slug) })),
    factors: view.factors.map((f) => ({ ...f, selected: draft.factors.includes(f.slug) })),
    tiredness: draft.tiredness,
    mood: draft.mood,
    dayNote: draft.dayNote.trim(),
  };
}

type SaveFn = (input: unknown) => Promise<{ ok: boolean }>;

/** Salva la bozza. Ritorna `{ ok: false }` anche se l'azione solleva un errore: mai eccezioni verso la UI. */
export async function submitNightEdit(
  view: NightEditView,
  draft: NightEditDraft,
  save: SaveFn = actionSaveNightDetails,
): Promise<{ ok: boolean }> {
  const input = buildNightEditInput(view, draft);
  if (input === null || timesProblem(view, draft) !== null) return { ok: false };
  try {
    const result = await save(input);
    return { ok: result.ok };
  } catch {
    return { ok: false };
  }
}

// --- Schermata -------------------------------------------------------------------------------

type Status = 'idle' | 'saving' | 'saved' | 'error';

const MOOD_SCORES: readonly Score[] = [1, 2, 3, 4, 5];

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

export interface NightEditScreenProps {
  view: NightEditView;
}

/** Cambiare notte rimonta il modulo (`key`): bozza e messaggi ripartono puliti. */
export function NightEditScreen({ view }: NightEditScreenProps) {
  return <NightEditForm key={view.date} initialView={view} />;
}

function NightEditForm({ initialView }: { initialView: NightEditView }) {
  const router = useRouter();
  const [base, setBase] = useState<NightEditView>(initialView);
  const [draft, setDraft] = useState<NightEditDraft>(() => draftFromView(initialView));
  const [status, setStatus] = useState<Status>('idle');
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const sending = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const problemId = useId();

  const input = buildNightEditInput(base, draft);
  const dirty = input !== null || timesState(base, draft) !== 'same';
  const problem = timesProblem(base, draft);
  const canSave = input !== null && problem === null && status !== 'saving';

  useEffect(() => {
    if (leaveTo !== null) dialogRef.current?.focus();
  }, [leaveTo]);

  const update = (patch: Partial<NightEditDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus((s) => (s === 'saving' ? s : 'idle'));
  };

  /** Salva la bozza; ritorna true se è andata a buon fine. */
  const save = async (): Promise<boolean> => {
    if (sending.current || !canSave) return false;
    sending.current = true;
    setStatus('saving');
    const result = await submitNightEdit(base, draft);
    sending.current = false;
    if (result.ok) {
      setBase(applyDraftToView(base, draft));
      setStatus('saved');
      router.refresh();
      return true;
    }
    setStatus('error');
    return false;
  };

  const guard = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!dirty) return;
    event.preventDefault();
    setLeaveTo(href);
  };

  const saveAndGo = async () => {
    const target = leaveTo;
    if (target === null) return;
    if (await save()) router.push(target);
    else setLeaveTo(null);
  };

  const exceptionItems = [
    ...base.exceptions.map((e) => ({ id: e.slug, label: e.label })),
    ...Object.entries(draft.exceptionLabels)
      .filter(([slug]) => !base.exceptions.some((e) => e.slug === slug))
      .map(([slug, label]) => ({ id: slug, label })),
  ];

  const duration = liveDurationText(base, draft);
  const prevHref = base.prevDate === null ? null : nightEditHref(base.prevDate);
  const nextHref = base.nextDate === null ? null : nightEditHref(base.nextDate);

  return (
    <div className={styles.page} aria-busy={status === 'saving'}>
      <header className={styles.header}>
        <Link href={base.backHref} className={`btn btn-ghost ${styles.back}`} onClick={guard(base.backHref)}>
          <Chevron direction="left" />
          Indietro
        </Link>
        <h1 className={`heading-md ${styles.pageTitle}`}>Modifica notte</h1>
        <p className={`title ${styles.nightTitle}`}>
          {base.title}
          <span className={`body-sm muted ${styles.dateLabel}`}>{base.dateLabel}</span>
        </p>
        <div className="row">
          <Badge status={base.status} />
          <span className={`body ${styles.duration}`} aria-label={`Durata ${duration}`}>
            {duration}
          </span>
        </div>
      </header>

      <div className={styles.columns}>
        <div className={styles.column}>
          <section className={`card ${styles.section}`} aria-labelledby={`${titleId}-times`}>
            <h2 id={`${titleId}-times`} className={`title ${styles.heading}`}>
              Orari
            </h2>
            <div className={styles.fields}>
              <TimeInput
                label="Sono andato a letto"
                value={draft.bed}
                onChange={(bed) => update({ bed })}
                suggested={base.suggestedBedTime}
              />
              <TimeInput
                label="Mi sono svegliato"
                value={draft.wake}
                onChange={(wake) => update({ wake })}
                suggested={base.suggestedWakeTime}
              />
            </div>
            <p className={`body-sm muted ${styles.text}`}>
              Durata: <span className={styles.num}>{duration}</span>
            </p>
            {problem !== null ? (
              <p className={`body-sm ${styles.problem}`} id={problemId}>
                {problem}
              </p>
            ) : null}
          </section>

          <section className={`card ${styles.section}`} aria-labelledby={`${titleId}-quality`}>
            <h2 id={`${titleId}-quality`} className={`title ${styles.heading}`}>
              Qualità e Energia
            </h2>
            <div className={styles.block}>
              <p className={`body-sm ${styles.text}`}>Qualità del sonno</p>
              <MoonRating
                kind="tired"
                label="Qualità del sonno"
                scaleLabels={['Pessima', 'Ottima']}
                value={draft.quality}
                onChange={(quality) => update({ quality })}
              />
              {draft.quality !== null ? (
                <button type="button" className="btn btn-secondary" onClick={() => update({ quality: null })}>
                  Togli il voto
                  <span className={styles.srOnly}> di qualità</span>
                </button>
              ) : null}
            </div>
            <div className={styles.block}>
              <p className={`body-sm ${styles.text}`}>Energia di quella mattina</p>
              <MoonRating
                kind="energy"
                label="Energia di quella mattina"
                value={draft.energy}
                onChange={(energy) => update({ energy })}
              />
              {draft.energy !== null ? (
                <button type="button" className="btn btn-secondary" onClick={() => update({ energy: null })}>
                  Togli il voto
                  <span className={styles.srOnly}> di energia</span>
                </button>
              ) : null}
            </div>
          </section>

          <section className={`card ${styles.section}`} aria-labelledby={`${titleId}-exc`}>
            <h2 id={`${titleId}-exc`} className={`title ${styles.heading}`}>
              Giornata particolare
            </h2>
            <ExceptionChips
              exceptions={exceptionItems}
              active={draft.exceptions}
              onToggle={(slug, on) => update({ exceptions: withSlug(draft.exceptions, slug, on) })}
              onCreate={({ id, label }) =>
                update({
                  exceptions: withSlug(draft.exceptions, id, true),
                  exceptionLabels: { ...draft.exceptionLabels, [id]: label },
                })
              }
              hideLabel
            />
          </section>
        </div>

        <div className={styles.column}>
          <section className={`card ${styles.section}`} aria-labelledby={`${titleId}-evening`}>
            <h2 id={`${titleId}-evening`} className={`title ${styles.heading}`}>
              {base.eveningLabel}
            </h2>
            <div className={styles.block}>
              <p className={`body-sm ${styles.text}`}>Stanchezza</p>
              <MoonRating kind="tired" value={draft.tiredness} onChange={(tiredness) => update({ tiredness })} />
              {draft.tiredness !== null ? (
                <button type="button" className="btn btn-secondary" onClick={() => update({ tiredness: null })}>
                  Togli il voto
                  <span className={styles.srOnly}> di stanchezza</span>
                </button>
              ) : null}
            </div>
            <div className={styles.block} role="group" aria-label="Umore">
              <p className={`body-sm ${styles.text}`}>Umore</p>
              <div className="row">
                {MOODS.map((label, index) => {
                  const score = MOOD_SCORES[index] as Score;
                  return (
                    <Chip
                      key={label}
                      variant="mood"
                      pressed={draft.mood === score}
                      onPressedChange={(next) => update({ mood: next ? toScore(score) : null })}
                    >
                      {label}
                    </Chip>
                  );
                })}
              </div>
            </div>
            <div className={styles.block} role="group" aria-label="Fattori della sera">
              <p className={`body-sm ${styles.text}`}>Fattori</p>
              <div className="row">
                {base.factors.map((f) => (
                  <Chip
                    key={f.slug}
                    pressed={draft.factors.includes(f.slug)}
                    onPressedChange={(next) => update({ factors: withSlug(draft.factors, f.slug, next) })}
                  >
                    {f.label}
                  </Chip>
                ))}
              </div>
            </div>
            <TextField
              label="Nota sulla giornata"
              hint={DAY_NOTE_HINT}
              placeholder={DAY_NOTE_PLACEHOLDER}
              value={draft.dayNote}
              onChange={(dayNote) => update({ dayNote })}
              maxLength={DAY_NOTE_MAX}
              multiline
            />
          </section>

          {base.napText !== null ? (
            <section className={`card ${styles.section}`} aria-labelledby={`${titleId}-nap`}>
              <h2 id={`${titleId}-nap`} className={`title ${styles.heading}`}>
                Sonnellino
              </h2>
              <p className={`body ${styles.text}`}>{base.napText}</p>
            </section>
          ) : null}
        </div>
      </div>

      <div className={styles.saveArea}>
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={!canSave}
          aria-describedby={problem !== null ? problemId : undefined}
          onClick={() => void save()}
        >
          Salva notte
        </button>
        {status === 'saved' ? (
          <p role="status" className={`body-sm ${styles.feedback}`}>
            {SAVED_TEXT}{' '}
            <Link href={base.backHref} className={styles.inlineLink}>
              Torna allo Storico
            </Link>
          </p>
        ) : null}
        {status === 'error' ? (
          <p role="alert" className={`body-sm ${styles.feedback} ${styles.problem}`}>
            {SAVE_ERROR_TEXT}
          </p>
        ) : null}
        {input === null && problem === null && status === 'idle' ? (
          <p className={`caption muted ${styles.text}`}>Cambia qualcosa per poter salvare.</p>
        ) : null}
      </div>

      {leaveTo !== null ? (
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={`${titleId}-leave`}
          tabIndex={-1}
          className={styles.dialog}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setLeaveTo(null);
          }}
        >
          <p id={`${titleId}-leave`} className={`body ${styles.text}`}>
            {UNSAVED_TEXT}
          </p>
          {problem !== null ? <p className={`body-sm ${styles.problem}`}>{problem}</p> : null}
          <div className="row">
            <button type="button" className="btn btn-secondary" disabled={!canSave} onClick={() => void saveAndGo()}>
              Salva e vai
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => router.push(leaveTo)}>
              Vai senza salvare
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setLeaveTo(null)}>
              Resta qui
            </button>
          </div>
        </div>
      ) : null}

      <nav className={styles.nightNav} aria-label="Cambia notte">
        {prevHref !== null ? (
          <Link href={prevHref} className={`btn btn-secondary ${styles.navLink}`} onClick={guard(prevHref)}>
            <Chevron direction="left" />
            Notte prima
          </Link>
        ) : (
          <span />
        )}
        {nextHref !== null ? (
          <Link href={nextHref} className={`btn btn-secondary ${styles.navLink}`} onClick={guard(nextHref)}>
            Notte dopo
            <Chevron direction="right" />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}

export default NightEditScreen;
