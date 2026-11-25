'use client';

import { useId } from 'react';

import styles from './TimeInput.module.css';

/**
 * Campo orario nativo (`<input type="time">`, 24 ore, passo di 1 minuto) del design system.
 * Controllato: `value` è "HH:MM" oppure null (mancante), `onChange` riceve "HH:MM".
 * Quando manca mostra la parola `Mancante` sotto il campo (collegata con `aria-describedby`): mai solo il colore.
 * Con `suggested` e valore mancante compare il pulsante secondario `Usa 23:30`.
 * Stesso aspetto di `TextField`: altezza `tap`, 16px, bordo `line-strong`, anello di focus `shadow-focus`.
 */
export interface TimeInputProps {
  label: string;
  /** "HH:MM"; null = mancante. */
  value: string | null;
  onChange: (next: string) => void;
  hint?: string;
  /** Orario proposto quando il valore manca: offre `Usa HH:MM`. */
  suggested?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
}

export const MISSING_TIME_TEXT = 'Mancante';

export const suggestedLabel = (suggested: string): string => `Usa ${suggested}`;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function TimeInput({
  label,
  value,
  onChange,
  hint,
  suggested,
  disabled = false,
  name,
  id,
  className,
}: TimeInputProps) {
  const autoId = useId();
  const fieldId = id ?? `${autoId}-field`;
  const hintId = `${fieldId}-hint`;
  const missingId = `${fieldId}-missing`;
  const missing = value === null || !TIME_RE.test(value);
  const canSuggest = missing && suggested !== undefined && TIME_RE.test(suggested);

  const describedBy = [hint ? hintId : null, missing ? missingId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <label htmlFor={fieldId} className={`body-sm ${styles.label}`}>
        {label}
      </label>
      <div className={styles.line}>
        <input
          id={fieldId}
          name={name}
          type="time"
          step={60}
          value={missing ? '' : (value as string)}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => {
            const next = event.target.value;
            if (TIME_RE.test(next)) onChange(next);
          }}
          className={styles.control}
        />
        {canSuggest ? (
          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => onChange(suggested)}>
            {suggestedLabel(suggested)}
          </button>
        ) : null}
      </div>
      {missing ? (
        <p id={missingId} className={`body-sm ${styles.missing}`}>
          {MISSING_TIME_TEXT}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className={`caption ${styles.hint}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
