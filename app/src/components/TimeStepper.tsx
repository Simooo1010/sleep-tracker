'use client';

import { useEffect, useId, useRef, useState } from 'react';

import styles from './TimeStepper.module.css';

/**
 * Correzione degli orari a passi di 5 minuti (docs/design/system/components/TimeStepper).
 * Due righe, letto e sveglia: `−` anticipa, `+` posticipa. Valori in 24 ore "HH:MM", con giro a mezzanotte.
 * Nessuna conferma a ogni passo: la conferma è il pulsante `Conferma` della scheda.
 */

export const MINUTES_PER_DAY = 1440;
export const DEFAULT_STEP_MINUTES = 5;

/** "HH:MM" (24 ore) → minuti dalla mezzanotte, oppure null se non è un orario valido. */
export function parseTime(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minuti (anche negativi o oltre le 24 ore) → "HH:MM", riportati nell'arco della giornata. */
export function formatTime(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Sposta un orario di `delta` minuti con giro a mezzanotte: 23:58 + 5 → 00:03, 00:02 − 5 → 23:57.
 * Un orario non valido o mancante resta mancante (null): mai uno zero inventato.
 */
export function stepTime(value: string | null | undefined, delta: number): string | null {
  const base = parseTime(value);
  if (base === null || !Number.isFinite(delta)) return null;
  return formatTime(base + delta);
}

/**
 * Orario scritto a mano → "HH:MM", oppure null se non è leggibile (mai un orario inventato).
 * Accetta: `2345`, `23:45`, `23.45`, `23,45`, `23 45`, `23h45`, `730` (07:30), `7` (07:00), `7h` (07:00).
 */
export function parseTypedTime(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const t = text.trim().toLowerCase();
  let h: number;
  let min: number;
  const sep = /^(\d{1,2})\s*[:.,h]\s*(\d{1,2})?$/.exec(t) ?? /^(\d{1,2})\s+(\d{1,2})$/.exec(t);
  if (sep) {
    h = Number(sep[1]);
    min = sep[2] === undefined ? 0 : Number(sep[2]);
    // "7:5" è ambiguo: i minuti vogliono due cifre.
    if (sep[2] !== undefined && sep[2].length !== 2) return null;
  } else if (/^\d{1,2}$/.test(t)) {
    h = Number(t);
    min = 0;
  } else if (/^\d{3,4}$/.test(t)) {
    h = Number(t.slice(0, -2));
    min = Number(t.slice(-2));
  } else {
    return null;
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export const INVALID_TIME_MESSAGE = 'Orario non valido. Prova per esempio 23:45.';

export type TimeField = 'bed' | 'wake';

export interface TimeStepperProps {
  /** Orario di letto "HH:MM"; null = mancante. */
  bedTime: string | null;
  /** Orario di sveglia "HH:MM"; null = mancante. */
  wakeTime: string | null;
  /** Riceve il nuovo orario già spostato del passo (con giro a mezzanotte). */
  onChange: (field: TimeField, next: string) => void;
  /** Passo in minuti, predefinito 5. */
  step?: number;
  /** Etichette delle righe. Predefinite: "Sono andato a letto", "Mi sono svegliato". */
  bedLabel?: string;
  wakeLabel?: string;
  /** Nome accessibile del pannello. Predefinito "Correggi orari". */
  label?: string;
  className?: string;
}

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

interface RowProps {
  label: string;
  value: string | null;
  step: number;
  onStep: (next: string) => void;
}

function StepperRow({ label, value, step, onStep }: RowProps) {
  const id = useId();
  const labelId = `${id}-l`;
  const errorId = `${id}-e`;
  const minutes = parseTime(value);
  const valid = minutes !== null;
  const shown = minutes === null ? null : formatTime(minutes);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Esc e Invio chiudono il campo e poi lo fanno perdere il focus: il blur non deve confermare due volte.
  const settled = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const go = (delta: number) => {
    const next = stepTime(value, delta);
    if (next !== null) {
      setError(null);
      onStep(next);
    }
  };
  const open = () => {
    settled.current = false;
    setDraft(shown ?? '');
    setError(null);
    setEditing(true);
  };
  const commit = () => {
    if (settled.current) return;
    settled.current = true;
    const next = parseTypedTime(draft);
    setEditing(false);
    if (next === null) {
      // Campo vuoto o immutato: nessun messaggio. Altrimenti torna il valore di prima, con una frase.
      setError(draft.trim() === '' || draft.trim() === shown ? null : INVALID_TIME_MESSAGE);
      return;
    }
    setError(null);
    if (next !== shown) onStep(next);
  };
  const cancel = () => {
    settled.current = true;
    setEditing(false);
    setError(null);
  };

  return (
    <div className={styles.rowWrap}>
      <div role="group" aria-labelledby={labelId} className={cx('row', styles.row)}>
        <span id={labelId} className={cx('body-sm', styles.label)}>
          {label}
        </span>
        <button
          type="button"
          className="btn btn-round"
          aria-label={`Anticipa di ${step} minuti`}
          aria-describedby={labelId}
          disabled={!valid || editing}
          onClick={() => go(-step)}
        >
          <span aria-hidden="true">−</span>
        </button>
        <span className={styles.timeSlot} aria-live="polite" aria-atomic="true">
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={5}
              className={styles.input}
              aria-label={`${label}, scrivi l’orario`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancel();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className={cx(styles.time, styles.timeButton, !valid && styles.missing)}
              aria-label={valid ? `${label}: ${shown}. Tocca per scrivere l’orario` : `${label}: mancante. Tocca per scrivere l’orario`}
              aria-describedby={error ? errorId : undefined}
              onClick={open}
            >
              {shown ?? 'Mancante'}
            </button>
          )}
        </span>
        <button
          type="button"
          className="btn btn-round"
          aria-label={`Posticipa di ${step} minuti`}
          aria-describedby={labelId}
          disabled={!valid || editing}
          onClick={() => go(step)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className={cx('caption', styles.error)}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TimeStepper({
  bedTime,
  wakeTime,
  onChange,
  step = DEFAULT_STEP_MINUTES,
  bedLabel = 'Sono andato a letto',
  wakeLabel = 'Mi sono svegliato',
  label = 'Correggi orari',
  className,
}: TimeStepperProps) {
  const safeStep = Number.isFinite(step) && step > 0 ? Math.round(step) : DEFAULT_STEP_MINUTES;
  return (
    <div role="group" aria-label={label} className={cx('stack', styles.panel, className)}>
      <StepperRow label={bedLabel} value={bedTime} step={safeStep} onStep={(next) => onChange('bed', next)} />
      <StepperRow label={wakeLabel} value={wakeTime} step={safeStep} onStep={(next) => onChange('wake', next)} />
    </div>
  );
}
