'use client';

import { useId, type ChangeEvent, type KeyboardEvent, type Ref } from 'react';

import styles from './TextField.module.css';

/**
 * Campo di testo del design system: una riga (`input`) o più righe (`textarea`, con `multiline`).
 * Stesso aspetto di `.input` in Impostazioni: altezza `tap`, 16px, bordo `line-strong`, anello di focus `shadow-focus`.
 * Sempre con etichetta visibile o nome accessibile (`hideLabel`) e contatore "12 su 30" (conta i caratteri veri,
 * emoji comprese). Un errore si scrive con le parole e `aria-invalid`, mai solo col colore.
 * Componente controllato: il genitore passa `value` e riceve `onChange`.
 */
export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Numero massimo di caratteri: il testo più lungo viene tagliato. */
  maxLength: number;
  /** Più righe (`textarea`). Predefinito una riga. */
  multiline?: boolean;
  /** Altezza iniziale in righe, solo con `multiline`. Predefinito 4. */
  rows?: number;
  hint?: string;
  /** Messaggio d'errore calmo, scritto a parole. */
  error?: string | null;
  placeholder?: string;
  /** Nasconde l'etichetta visibile: resta come nome accessibile del campo. */
  hideLabel?: boolean;
  /** Mostra il contatore. Predefinito true. */
  showCount?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
  /** Riferimento al campo (per portarci il focus). */
  inputRef?: Ref<HTMLInputElement | HTMLTextAreaElement>;
  /** Invio in un campo a una riga. */
  onEnter?: () => void;
  onEscape?: () => void;
}

/** Lunghezza in caratteri veri (code point), come `normalizeExceptionLabel`. */
export function countChars(text: string): number {
  return Array.from(text).length;
}

/** Taglia a `max` caratteri veri senza spezzare le emoji. */
export function clampText(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

export const countText = (used: number, max: number): string => `${used} su ${max}`;

export function TextField({
  label,
  value,
  onChange,
  maxLength,
  multiline = false,
  rows = 4,
  hint,
  error = null,
  placeholder,
  hideLabel = false,
  showCount = true,
  disabled = false,
  name,
  id,
  className,
  inputRef,
  onEnter,
  onEscape,
}: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? `${autoId}-field`;
  const hintId = `${fieldId}-hint`;
  const countId = `${fieldId}-count`;
  const errorId = `${fieldId}-error`;

  const describedBy =
    [hint ? hintId : null, showCount ? countId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange(clampText(event.target.value, maxLength));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
    } else if (event.key === 'Enter' && !multiline && onEnter && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onEnter();
    }
  };

  const shared = {
    id: fieldId,
    name,
    value,
    disabled,
    maxLength,
    placeholder,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
  };
  const controlClass = [styles.control, multiline ? styles.area : null, error ? styles.invalid : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <label htmlFor={fieldId} className={hideLabel ? styles.srOnly : `body-sm ${styles.label}`}>
        {label}
      </label>
      {multiline ? (
        <textarea
          {...shared}
          ref={inputRef as Ref<HTMLTextAreaElement> | undefined}
          rows={rows}
          className={controlClass}
        />
      ) : (
        <input
          {...shared}
          ref={inputRef as Ref<HTMLInputElement> | undefined}
          type="text"
          autoComplete="off"
          className={controlClass}
        />
      )}
      {error ? (
        <p id={errorId} className={`body-sm ${styles.error}`} role="alert">
          {error}
        </p>
      ) : null}
      {hint || showCount ? (
        <div className={styles.meta}>
          {hint ? (
            <p id={hintId} className={`caption ${styles.hint}`}>
              {hint}
            </p>
          ) : null}
          {showCount ? (
            <p id={countId} className={`caption ${styles.count}`}>
              {countText(countChars(value), maxLength)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
