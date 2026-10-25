'use client';

import { useId, useRef, useState } from 'react';

import { actionSaveEveningCheck, actionSetExceptions } from '@/app/actions';
import { Chip } from '@/components/Chip';
import { ExceptionChips } from '@/components/ExceptionChips';
import { MoonRating, toScore } from '@/components/MoonRating';
import { WizardStep } from '@/components/WizardStep';
import type { Score } from '@/domain/types';
import type { EveningStepView, EveningSummaryRowView, EveningView } from '@/server/views/evening';
import { DASH, formatMinutes, formatScore } from '@/server/views/format';

import styles from './EveningScreen.module.css';

/**
 * Schermata Sera (docs/design/system/Schermate.md §Sera).
 * Telefono: una domanda per schermata (WizardStep) con Avanti/Indietro; l'ultima mostra il riepilogo e `Vado a dormire`.
 * PC (da 60rem): una scheda sola con tutti i passi visibili. Le due viste condividono lo stesso stato e si
 * scambiano via CSS (nessun flash all'idratazione); per l'utente ne esiste una sola per volta.
 * Nessuna risposta è obbligatoria: `Avanti` e `Vado a dormire` sono sempre attivi.
 */

export const EVENING_ERROR_TEXT =
  'Non sono riuscito a salvare il check. Le tue risposte sono ancora qui: riprova tra un momento.';
export const EVENING_SEND_HINT = 'Salva il check e avvia il Comando che attiva Riposo.';

// --- Risposte e mappatura verso le Server Actions (funzioni pure) ----------------------------

export interface EveningAnswers {
  tiredness: Score | null;
  mood: Score | null;
  /** null = fattori mai toccati né precompilati. Un elenco vuoto è una risposta ("nessuno"). */
  factors: string[] | null;
  /** null = eccezioni mai toccate: non si chiama `actionSetExceptions`; si mostrano quelle attive della view. */
  exceptions: string[] | null;
  nap: number | null;
  /** Il sonnellino precompilato può venire dal comando rapido (già registrato): si invia solo se toccato. */
  napTouched: boolean;
}

export interface EveningCheckInput {
  date: string;
  tiredness?: Score;
  mood?: Score;
  factors?: string[];
  napMinutesToday?: number;
}

export interface ExceptionsInput {
  nightDate: string;
  slugs: string[];
}

function stepOf(view: EveningView, key: EveningStepView['key']): EveningStepView | undefined {
  return view.steps.find((s) => s.key === key);
}

function selectedValues(view: EveningView, key: EveningStepView['key']): string[] {
  return (stepOf(view, key)?.options ?? []).filter((o) => o.selected).map((o) => o.value);
}

function toMinutes(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function toScoreValue(value: string | undefined): Score | null {
  return value === undefined ? null : toScore(Number(value));
}

/** Risposte iniziali: ciò che la view segna come selezionato (check già salvato stasera o sonnellino registrato). */
export function initialAnswers(view: EveningView): EveningAnswers {
  const factors = selectedValues(view, 'factors');
  return {
    tiredness: toScoreValue(selectedValues(view, 'tiredness')[0]),
    mood: toScoreValue(selectedValues(view, 'mood')[0]),
    factors: factors.length > 0 ? factors : null,
    exceptions: null,
    nap: toMinutes(selectedValues(view, 'nap')[0]),
    napTouched: false,
  };
}

/** Slug delle eccezioni attive: quelle scelte dall'utente, altrimenti quelle già attive per la notte. */
export function currentExceptions(view: EveningView, answers: EveningAnswers): string[] {
  if (answers.exceptions !== null) return answers.exceptions;
  return (stepOf(view, 'factors')?.exceptions ?? []).filter((e) => e.selected).map((e) => e.value);
}

/** Aggiunge o toglie uno slug senza duplicati. */
export function withSlug(list: readonly string[], slug: string, on: boolean): string[] {
  const rest = list.filter((s) => s !== slug);
  return on ? [...rest, slug] : rest;
}

/** Input di `actionSaveEveningCheck`: SOLO i campi risposti (mai chiavi undefined, mai zero per "non risposto"). */
export function toCheckInput(date: string, answers: EveningAnswers): EveningCheckInput {
  const input: EveningCheckInput = { date };
  if (answers.tiredness !== null) input.tiredness = answers.tiredness;
  if (answers.mood !== null) input.mood = answers.mood;
  if (answers.factors !== null) input.factors = [...answers.factors];
  if (answers.nap !== null && answers.napTouched) input.napMinutesToday = answers.nap;
  return input;
}

/** Input di `actionSetExceptions`, oppure null se l'utente non ha toccato le eccezioni. */
export function toExceptionsInput(nightDate: string, answers: EveningAnswers): ExceptionsInput | null {
  return answers.exceptions === null ? null : { nightDate, slugs: [...answers.exceptions] };
}

function optionLabel(view: EveningView, key: EveningStepView['key'], value: string): string | undefined {
  return stepOf(view, key)?.options.find((o) => o.value === value)?.label;
}

/** Righe del riepilogo con le risposte di adesso (etichette dalla view, valori dalle risposte). */
export function summaryRows(view: EveningView, answers: EveningAnswers): EveningSummaryRowView[] {
  const exceptionLabels = currentExceptions(view, answers).map(
    (slug) => stepOf(view, 'factors')?.exceptions.find((e) => e.value === slug)?.label ?? slug,
  );
  const factorLabels = (answers.factors ?? []).map((slug) => optionLabel(view, 'factors', slug) ?? slug);
  const factorsAll = [...factorLabels, ...exceptionLabels];

  const valueOf = (key: EveningStepKey): string => {
    switch (key) {
      case 'tiredness':
        return formatScore(answers.tiredness);
      case 'mood':
        return answers.mood === null ? DASH : (optionLabel(view, 'mood', String(answers.mood)) ?? DASH);
      case 'factors':
        return factorsAll.length > 0 ? factorsAll.join(', ') : answers.factors !== null ? 'Nessuno' : DASH;
      case 'nap':
        return answers.nap === null ? DASH : answers.nap === 0 ? 'Nessuno' : formatMinutes(answers.nap);
    }
  };
  return view.summary.rows.map((row) => ({ key: row.key, label: row.label, value: valueOf(row.key) }));
}

type EveningStepKey = EveningStepView['key'];

type ActionFn = (input: unknown) => Promise<{ ok: boolean }>;

export interface EveningActions {
  saveCheck: ActionFn;
  setExceptions: ActionFn;
}

const DEFAULT_ACTIONS: EveningActions = { saveCheck: actionSaveEveningCheck, setExceptions: actionSetExceptions };

/**
 * Salva il check e, solo se l'utente le ha toccate, le eccezioni della notte di stasera.
 * Riprovare è sicuro: entrambe le azioni sostituiscono, non accumulano.
 */
export async function submitEveningCheck(
  args: { today: string; tonightNightDate: string; answers: EveningAnswers },
  actions: EveningActions = DEFAULT_ACTIONS,
): Promise<{ ok: boolean }> {
  try {
    const saved = await actions.saveCheck(toCheckInput(args.today, args.answers));
    if (!saved.ok) return { ok: false };
    const exceptions = toExceptionsInput(args.tonightNightDate, args.answers);
    if (exceptions) {
      const result = await actions.setExceptions(exceptions);
      if (!result.ok) return { ok: false };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// --- Controlli dei passi ---------------------------------------------------------------------

interface Handlers {
  tiredness: (score: Score) => void;
  mood: (score: Score | null) => void;
  factor: (slug: string, on: boolean) => void;
  exception: (slug: string, on: boolean) => void;
  nap: (minutes: number | null) => void;
}

function StepControl({
  step,
  answers,
  exceptions,
  handlers,
  layout,
}: {
  step: EveningStepView;
  answers: EveningAnswers;
  exceptions: string[];
  handlers: Handlers;
  layout: 'phone' | 'desktop';
}) {
  switch (step.control) {
    case 'moons':
      return (
        <MoonRating
          kind="tired"
          value={answers.tiredness}
          onChange={handlers.tiredness}
          size={layout === 'phone' ? 'lg' : 'md'}
          spread={layout === 'phone'}
        />
      );
    case 'chips':
      return (
        <div className="row">
          {step.options.map((o) => (
            <Chip
              key={o.value}
              variant="mood"
              pressed={answers.mood === toScoreValue(o.value)}
              onPressedChange={(next) => handlers.mood(next ? toScoreValue(o.value) : null)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      );
    case 'multi-chips': {
      const picked = new Set(answers.factors ?? []);
      return (
        <div className={styles.block}>
          <div className="row">
            {step.options.map((o) => (
              <Chip key={o.value} pressed={picked.has(o.value)} onPressedChange={(next) => handlers.factor(o.value, next)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <ExceptionChips
            exceptions={step.exceptions.map((e) => ({ id: e.value, label: e.label }))}
            active={exceptions}
            onToggle={handlers.exception}
            showNote={false}
          />
        </div>
      );
    }
    case 'nap-chips':
      return (
        <div className="row">
          {step.options.map((o) => (
            <Chip
              key={o.value}
              variant="nap"
              pressed={answers.nap !== null && answers.nap === toMinutes(o.value)}
              onPressedChange={(next) => handlers.nap(next ? toMinutes(o.value) : null)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      );
  }
}

function Summary({ view, answers }: { view: EveningView; answers: EveningAnswers }) {
  return (
    <div className={styles.summary}>
      <h3 className={`eyebrow ${styles.summaryTitle}`}>{view.summary.title}</h3>
      <dl className={styles.rows}>
        {summaryRows(view, answers).map((row) => (
          <div key={row.key} className={styles.rowItem}>
            <dt className="body-sm muted">{row.label}</dt>
            <dd className={`body ${styles.value}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// --- Schermata -------------------------------------------------------------------------------

type Status = 'idle' | 'saving' | 'done' | 'error';

export interface EveningScreenProps {
  /** Data locale di oggi: è la data del check. */
  today: string;
  /** Notte a cui si riferiscono le eccezioni. */
  tonightNightDate: string;
  view: EveningView;
  /** Passo da mostrare su telefono (da 0). Predefinito il primo. */
  initialStep?: number;
}

function clampStep(step: number, count: number): number {
  const last = Math.max(0, count - 1);
  return Number.isFinite(step) ? Math.min(Math.max(0, Math.trunc(step)), last) : 0;
}

export function EveningScreen({ today, tonightNightDate, view, initialStep = 0 }: EveningScreenProps) {
  const [answers, setAnswers] = useState<EveningAnswers>(() => initialAnswers(view));
  const [stepIndex, setStepIndex] = useState(() => clampStep(initialStep, view.steps.length));
  const [status, setStatus] = useState<Status>('idle');
  const sending = useRef(false);
  const deskId = useId();
  const hintId = useId();

  const exceptions = currentExceptions(view, answers);
  const locked = status === 'saving' || status === 'done';

  const update = (patch: Partial<EveningAnswers>) => {
    setAnswers((a) => ({ ...a, ...patch }));
    setStatus((s) => (s === 'error' ? 'idle' : s));
  };

  const handlers: Handlers = {
    tiredness: (score) => update({ tiredness: score }),
    mood: (score) => update({ mood: score }),
    factor: (slug, on) => update({ factors: withSlug(answers.factors ?? [], slug, on) }),
    exception: (slug, on) => update({ exceptions: withSlug(exceptions, slug, on) }),
    nap: (minutes) => update({ nap: minutes, napTouched: true }),
  };

  const finish = async () => {
    if (sending.current || status === 'done') return;
    sending.current = true;
    setStatus('saving');
    const result = await submitEveningCheck({ today, tonightNightDate, answers });
    sending.current = false;
    setStatus(result.ok ? 'done' : 'error');
  };

  const last = view.steps.length - 1;
  const current = view.steps[stepIndex];
  const problem =
    status === 'error' ? (
      <p className={`body-sm ${styles.problem}`} role="alert">
        {EVENING_ERROR_TEXT}
      </p>
    ) : null;

  return (
    <>
      {/* Telefono: una domanda per schermata */}
      <div className={styles.phone}>
        {current ? (
          <WizardStep
            step={stepIndex + 1}
            total={view.steps.length}
            question={current.question}
            kicker={view.kicker}
            onNext={() => setStepIndex((i) => Math.min(i + 1, last))}
            onBack={() => setStepIndex((i) => Math.max(i - 1, 0))}
            onFinish={finish}
            {...(status === 'done' ? { confirmation: view.summary.savedText } : {})}
          >
            <fieldset className={styles.fieldset} disabled={locked}>
              <div className={styles.stack}>
                {stepIndex === 0 && view.emptyText ? <p className={`body-sm ${styles.note}`}>{view.emptyText}</p> : null}
                <StepControl step={current} answers={answers} exceptions={exceptions} handlers={handlers} layout="phone" />
                {current.note ? <p className={`caption ${styles.note}`}>{current.note}</p> : null}
                {stepIndex === last ? <Summary view={view} answers={answers} /> : null}
                {problem}
              </div>
            </fieldset>
          </WizardStep>
        ) : null}
      </div>

      {/* PC: una scheda sola con tutti i passi */}
      <section className={`card ${styles.desktop}`} aria-labelledby={`${deskId}-title`}>
        <div className={styles.head}>
          <div className="eyebrow">
            {view.kicker} · {view.dateLabel}
          </div>
          <h2 id={`${deskId}-title`} className={`heading-lg ${styles.headTitle}`}>
            {view.title}
          </h2>
          {view.emptyText ? <p className={`body ${styles.headNote}`}>{view.emptyText}</p> : null}
        </div>

        <fieldset className={styles.fieldset} disabled={locked}>
          <div className={styles.grid}>
            {view.steps.map((step) => (
              <section
                key={step.key}
                className={`${styles.block} ${step.key === 'factors' || step.key === 'nap' ? styles.wide : ''}`}
                aria-labelledby={`${deskId}-${step.key}`}
              >
                <h3 id={`${deskId}-${step.key}`} className={`title ${styles.question}`}>
                  {step.question}
                </h3>
                <StepControl step={step} answers={answers} exceptions={exceptions} handlers={handlers} layout="desktop" />
                {step.note ? <p className={`caption ${styles.note}`}>{step.note}</p> : null}
              </section>
            ))}
          </div>
        </fieldset>

        {problem}
        {status === 'done' ? (
          <p className={`body-sm ${styles.done}`} role="status">
            {view.summary.savedText}
          </p>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={`btn btn-primary btn-lg ${styles.send}`}
              onClick={finish}
              disabled={status === 'saving'}
              aria-describedby={hintId}
            >
              {view.summary.sendLabel}
            </button>
            <p id={hintId} className={`caption ${styles.hint}`}>
              {EVENING_SEND_HINT}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

export default EveningScreen;
