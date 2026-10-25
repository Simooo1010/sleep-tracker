'use client';

import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { actionSaveEveningCheck, actionSetExceptions } from '@/app/actions';
import { Chip } from '@/components/Chip';
import { ExceptionChips } from '@/components/ExceptionChips';
import { MoonRating, toScore } from '@/components/MoonRating';
import { WizardStep } from '@/components/WizardStep';
import type { Score } from '@/domain/types';
import type {
  EveningOptionView,
  EveningStepKey,
  EveningStepView,
  EveningSummaryRowView,
  EveningView,
} from '@/server/views/evening';
import { DASH, formatScore } from '@/server/views/format';

import styles from './EveningScreen.module.css';

/**
 * Check serale (docs/design/system/Schermate.md §Sera).
 * Telefono: una domanda per schermata (WizardStep), `Avanti`/`Indietro` sempre attivi, ultimo passo con riepilogo
 * e l'unico pulsante pieno `Vado a dormire`. PC (da 60rem): una scheda sola con tutti i passi visibili.
 * Nessuna risposta è obbligatoria; si inviano solo i campi toccati. Nessuna animazione.
 */

export const SAVE_ERROR_TEXT = 'Non è stato possibile salvare il check. Le tue risposte restano qui: riprova tra un momento.';
export const EXCEPTION_ERROR_TEXT = 'Non è stato possibile salvare le eccezioni. Riprova tra un momento.';
export const WIDE_QUERY = '(min-width: 60rem)';

// --- Risposte → input dell'azione (pure) ------------------------------------------------------

/** Risposte toccate dall'utente. `undefined`/`null` = non risposto: il campo non viene inviato. */
export interface EveningAnswers {
  tiredness?: Score | null;
  mood?: Score | null;
  factors?: string[];
  napMinutes?: number | null;
}

export interface EveningActionInput {
  date: string;
  tiredness?: Score;
  mood?: Score;
  factors?: string[];
  napMinutesToday?: number;
}

/** Input di `actionSaveEveningCheck` con SOLO i campi risposti. I fattori vuoti ma toccati ([]) si inviano. */
export function answersToActionInput(date: string, answers: EveningAnswers): EveningActionInput {
  const input: EveningActionInput = { date };
  const tiredness = toScore(answers.tiredness);
  const mood = toScore(answers.mood);
  if (tiredness !== null) input.tiredness = tiredness;
  if (mood !== null) input.mood = mood;
  if (Array.isArray(answers.factors)) input.factors = [...answers.factors];
  const nap = answers.napMinutes;
  if (typeof nap === 'number' && Number.isInteger(nap) && nap >= 0) input.napMinutesToday = nap;
  return input;
}

/** Aggiunge lo slug se manca, lo toglie se c'è. Non modifica l'array dato. */
export function toggleSlug(list: readonly string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

function selectedValues(options: readonly EveningOptionView[]): string[] {
  return options.filter((o) => o.selected).map((o) => o.value);
}

function stepOf(view: EveningView, key: EveningStepView['key']): EveningStepView | undefined {
  return view.steps.find((s) => s.key === key);
}

/** Valori mostrati all'apertura, ricavati dal view (check già salvato o sonnellino registrato). */
export interface EveningInitial {
  tiredness: Score | null;
  mood: Score | null;
  factors: string[];
  exceptions: string[];
  napMinutes: number | null;
}

export function initialFromView(view: EveningView): EveningInitial {
  const first = (key: EveningStepKey): number | null => {
    const v = selectedValues(stepOf(view, key)?.options ?? [])[0];
    return v === undefined ? null : Number(v);
  };
  return {
    tiredness: toScore(first('tiredness')),
    mood: toScore(first('mood')),
    factors: selectedValues(stepOf(view, 'factors')?.options ?? []),
    exceptions: selectedValues(stepOf(view, 'factors')?.exceptions ?? []),
    napMinutes: first('nap'),
  };
}

/** Righe del riepilogo aggiornate alle risposte date; i campi non toccati restano quelli di `view.summary`. */
export function summaryRows(
  view: EveningView,
  answers: EveningAnswers,
  exceptions: readonly string[],
  initial: EveningInitial,
): EveningSummaryRowView[] {
  const labelOf = (key: EveningStepKey, value: string): string | undefined =>
    stepOf(view, key)?.options.find((o) => o.value === value)?.label;
  const exceptionsChanged =
    exceptions.length !== initial.exceptions.length || exceptions.some((s) => !initial.exceptions.includes(s));

  return view.summary.rows.map((row) => {
    switch (row.key) {
      case 'tiredness':
        return answers.tiredness === undefined ? row : { ...row, value: formatScore(answers.tiredness) };
      case 'mood':
        return answers.mood === undefined
          ? row
          : { ...row, value: answers.mood === null ? DASH : (labelOf('mood', String(answers.mood)) ?? DASH) };
      case 'factors': {
        if (answers.factors === undefined && !exceptionsChanged) return row;
        const factors = answers.factors ?? initial.factors;
        const names = [
          ...factors.map((s) => stepOf(view, 'factors')?.options.find((o) => o.value === s)?.label ?? s),
          ...exceptions.map((s) => stepOf(view, 'factors')?.exceptions.find((o) => o.value === s)?.label ?? s),
        ];
        return { ...row, value: names.length > 0 ? names.join(', ') : 'Nessuno' };
      }
      case 'nap':
        return answers.napMinutes === undefined
          ? row
          : { ...row, value: answers.napMinutes === null ? DASH : (labelOf('nap', String(answers.napMinutes)) ?? DASH) };
    }
  });
}

// --- Layout: telefono o PC --------------------------------------------------------------------

function subscribeWide(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
const getWide = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches;
const getServerWide = (): boolean => false;

// --- Componente --------------------------------------------------------------------------------

export interface EveningScreenProps {
  /** Giorno locale 'YYYY-MM-DD'. */
  today: string;
  /** Notte a cui si riferiscono le eccezioni. */
  tonightNightDate: string;
  view: EveningView;
  /** Solo per i test: passo iniziale del telefono (da 1). */
  initialStep?: number;
  /** Solo per i test: forza il layout; predefinito dalla larghezza (>= 60rem = scheda unica). */
  layout?: 'phone' | 'wide';
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function EveningScreen({ today, tonightNightDate, view, initialStep = 1, layout }: EveningScreenProps) {
  const initial = initialFromView(view);
  const total = view.steps.length;

  const [step, setStep] = useState(() => Math.min(Math.max(1, Math.round(initialStep) || 1), Math.max(1, total)));
  const [answers, setAnswers] = useState<EveningAnswers>({});
  const [exceptions, setExceptions] = useState<string[]>(initial.exceptions);
  const [exceptionError, setExceptionError] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const confirmedExceptions = useRef<string[]>(initial.exceptions);
  const exceptionQueue = useRef<Promise<void>>(Promise.resolve());
  const saving = useRef(false);

  const wideMatch = useSyncExternalStore(subscribeWide, getWide, getServerWide);
  const wide = layout ? layout === 'wide' : wideMatch;

  if (view.steps.length === 0) return null;

  // Valori mostrati: la risposta toccata, altrimenti quella precompilata.
  const tiredness = answers.tiredness !== undefined ? answers.tiredness : initial.tiredness;
  const mood = answers.mood !== undefined ? answers.mood : initial.mood;
  const factors = answers.factors ?? initial.factors;
  const nap = answers.napMinutes !== undefined ? answers.napMinutes : initial.napMinutes;

  const setAnswer = (patch: EveningAnswers) => setAnswers((prev) => ({ ...prev, ...patch }));

  const toggleException = (id: string, next: boolean) => {
    const list = next ? (exceptions.includes(id) ? exceptions : [...exceptions, id]) : exceptions.filter((s) => s !== id);
    setExceptions(list);
    setExceptionError(false);
    // Una scrittura alla volta, nell'ordine dei tocchi: vale l'ultimo elenco inviato.
    exceptionQueue.current = exceptionQueue.current.then(async () => {
      try {
        const result = await actionSetExceptions({ nightDate: tonightNightDate, slugs: list });
        if (!result.ok) throw new Error('rifiutato');
        confirmedExceptions.current = list;
      } catch {
        setExceptions(confirmedExceptions.current);
        setExceptionError(true);
      }
    });
  };

  const finish = async () => {
    if (saving.current || status === 'saved') return;
    saving.current = true;
    setStatus('saving');
    try {
      const result = await actionSaveEveningCheck(answersToActionInput(today, answers));
      setStatus(result.ok ? 'saved' : 'error');
    } catch {
      setStatus('error');
    } finally {
      saving.current = false;
    }
  };

  const saved = status === 'saved';
  const errorNote =
    status === 'error' ? (
      <p className={`body-sm ${styles.errorNote}`} role="alert">
        {SAVE_ERROR_TEXT}
      </p>
    ) : null;

  const controls = {
    tiredness: (
      <MoonRating
        kind="tired"
        size={wide ? 'md' : 'lg'}
        spread={!wide}
        value={tiredness}
        onChange={(score) => setAnswer({ tiredness: score })}
      />
    ),
    mood: (
      <div className="row" role="group" aria-label="Umore di stasera">
        {(stepOf(view, 'mood')?.options ?? []).map((o) => (
          <Chip
            key={o.value}
            variant="mood"
            pressed={mood === Number(o.value)}
            onPressedChange={(next) => setAnswer({ mood: next ? toScore(Number(o.value)) : null })}
          >
            {o.label}
          </Chip>
        ))}
      </div>
    ),
    factors: (
      <div className="stack">
        <div className="row" role="group" aria-label="Fattori di oggi">
          {(stepOf(view, 'factors')?.options ?? []).map((o) => (
            <Chip
              key={o.value}
              variant="factor"
              pressed={factors.includes(o.value)}
              onPressedChange={() => setAnswer({ factors: toggleSlug(factors, o.value) })}
            >
              {o.label}
            </Chip>
          ))}
        </div>
        <ExceptionChips
          exceptions={(stepOf(view, 'factors')?.exceptions ?? []).map((e) => ({ id: e.value, label: e.label }))}
          active={exceptions}
          onToggle={toggleException}
        />
        {exceptionError ? (
          <p className={`body-sm ${styles.errorNote}`} role="alert">
            {EXCEPTION_ERROR_TEXT}
          </p>
        ) : null}
      </div>
    ),
    nap: (
      <div className="stack">
        <div className="row" role="group" aria-label="Sonnellino di oggi">
          {(stepOf(view, 'nap')?.options ?? []).map((o) => (
            <Chip
              key={o.value}
              variant="nap"
              pressed={nap === Number(o.value)}
              onPressedChange={(next) => setAnswer({ napMinutes: next ? Number(o.value) : null })}
            >
              {o.label}
            </Chip>
          ))}
        </div>
        {stepOf(view, 'nap')?.note ? <p className={`caption ${styles.note}`}>{stepOf(view, 'nap')?.note}</p> : null}
      </div>
    ),
  } satisfies Record<EveningStepKey, ReactNode>;

  if (wide) {
    return (
      <WideCard
        view={view}
        controls={controls}
        saved={saved}
        errorNote={errorNote}
        onFinish={() => void finish()}
      />
    );
  }

  const current = view.steps[step - 1] ?? view.steps[0]!;
  const isLast = current.isLast || step >= total;
  const rows = summaryRows(view, answers, exceptions, initial);

  return (
    <WizardStep
      step={step}
      total={total}
      question={current.question}
      kicker={view.kicker}
      onNext={() => setStep((s) => Math.min(s + 1, total))}
      onBack={() => setStep((s) => Math.max(s - 1, 1))}
      onFinish={() => void finish()}
      confirmation={saved ? view.summary.savedText : undefined}
    >
      <div className={styles.body}>
        {step === 1 && view.emptyText ? <p className={`body-sm ${styles.note}`}>{view.emptyText}</p> : null}
        {controls[current.key]}
        {current.key !== 'nap' && current.key !== 'factors' && current.note ? (
          <p className={`caption ${styles.note}`}>{current.note}</p>
        ) : null}
        {isLast ? <Summary title={view.summary.title} rows={rows} /> : null}
        {errorNote}
      </div>
    </WizardStep>
  );
}

function Summary({ title, rows }: { title: string; rows: EveningSummaryRowView[] }) {
  const id = useId();
  return (
    <section className={styles.summary} aria-labelledby={id}>
      <div className="eyebrow" id={id}>
        {title}
      </div>
      <dl className={`body-sm ${styles.summaryList}`}>
        {rows.map((row) => (
          <div key={row.key} className={styles.summaryRow}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function WideCard({
  view,
  controls,
  saved,
  errorNote,
  onFinish,
}: {
  view: EveningView;
  controls: Record<EveningStepKey, ReactNode>;
  saved: boolean;
  errorNote: ReactNode;
  onFinish: () => void;
}) {
  const titleId = useId();
  const hintId = useId();
  return (
    <section className={`card ${styles.wide}`} aria-labelledby={titleId}>
      <div className={styles.wideHead}>
        <div className="eyebrow">
          {view.kicker} · {view.dateLabel}
        </div>
        <h2 id={titleId} className={`heading-lg ${styles.wideTitle}`}>
          {view.title}
        </h2>
        {view.emptyText ? <p className={`body-sm ${styles.note}`}>{view.emptyText}</p> : null}
      </div>

      <div className={styles.grid}>
        {view.steps.map((s) => (
          <WideSection key={s.key} step={s}>
            {controls[s.key]}
          </WideSection>
        ))}
      </div>

      {saved ? (
        <p className={`body-sm ${styles.done}`} role="status">
          {view.summary.savedText}
        </p>
      ) : (
        <div className={styles.footer}>
          <button type="button" className="btn btn-primary btn-lg" onClick={onFinish} aria-describedby={hintId}>
            {view.summary.sendLabel}
          </button>
          <p id={hintId} className={`caption ${styles.note}`}>
            Salva il check e avvia il Comando che attiva Riposo.
          </p>
          {errorNote}
        </div>
      )}
    </section>
  );
}

function WideSection({ step, children }: { step: EveningStepView; children: ReactNode }) {
  const id = useId();
  return (
    <div className={styles.section} role="group" aria-labelledby={id}>
      <h3 id={id} className={`title ${styles.sectionTitle}`}>
        {step.question}
      </h3>
      {children}
    </div>
  );
}

export default EveningScreen;
