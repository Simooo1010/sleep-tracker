'use client';

import { useId } from 'react';

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
  const minutes = parseTime(value);
  const valid = minutes !== null;
  const shown = minutes === null ? null : formatTime(minutes);
  const go = (delta: number) => {
    const next = stepTime(value, delta);
    if (next !== null) onStep(next);
  };
  return (
    <div role="group" aria-labelledby={labelId} className={cx('row', styles.row)}>
      <span id={labelId} className={cx('body-sm', styles.label)}>
        {label}
      </span>
      <button
        type="button"
        className="btn btn-round"
        aria-label={`Anticipa di ${step} minuti`}
        aria-describedby={labelId}
        disabled={!valid}
        onClick={() => go(-step)}
      >
        <span aria-hidden="true">−</span>
      </button>
      <span className={cx(styles.time, !valid && styles.missing)} aria-live="polite" aria-atomic="true">
        {shown ?? 'Mancante'}
      </span>
      <button
        type="button"
        className="btn btn-round"
        aria-label={`Posticipa di ${step} minuti`}
        aria-describedby={labelId}
        disabled={!valid}
        onClick={() => go(step)}
      >
        <span aria-hidden="true">+</span>
      </button>
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
