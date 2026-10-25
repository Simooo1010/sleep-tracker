import { useEffect, useId, useRef, useState } from 'react';

import {
  EXCEPTION_LABEL_MAX,
  normalizeExceptionLabel,
  slugifyExceptionLabel,
} from '../domain/questions';
import { TextField } from './TextField';

/**
 * Chip a un tocco per segnare un giorno fuori dal normale (classi `chip chip-exc` e `chip-add` di bundle.css).
 * Un giorno-eccezione resta visibile ma non entra nel riferimento della regolarità.
 * Lista aperta e personalizzabile, ordinata per frequenza d'uso (`uses`, decrescente; a pari uso resta l'ordine dato).
 * Sempre facoltative. Le scelte restano al genitore: passa `active` e riceve `onToggle`.
 * `+ Aggiungi` con `onCreate` apre un campo inline ("Altro imprevisto", max 30 caratteri): invio o `Aggiungi`
 * crea un chip nuovo (slug da `slugifyExceptionLabel`, etichetta normalizzata) e lo passa a `onCreate`;
 * se esiste già un chip con lo stesso slug non ne crea un altro e lo accende con `onToggle`.
 */
export interface ExceptionItem {
  id: string;
  label: string;
  /** Quante volte è stata usata: serve solo all'ordinamento. */
  uses?: number;
}

export interface ExceptionChipsProps {
  /** Predefinito `DEFAULT_EXCEPTIONS`. */
  exceptions?: readonly ExceptionItem[];
  /** Id delle eccezioni attive per la notte. */
  active?: readonly string[];
  onToggle?: (id: string, next: boolean) => void;
  /** Se presente (senza `onCreate`), mostra il chip finale `+ Aggiungi` e lo collega a questa funzione. */
  onAdd?: () => void;
  /**
   * Se presente, il chip finale `+ Aggiungi` apre il campo inline. Riceve il nuovo imprevisto (id = slug) già
   * attivo nelle intenzioni dell'utente: il genitore lo aggiunge all'elenco e ai chip attivi.
   */
  onCreate?: (item: { id: string; label: string }) => void;
  /** Nome del gruppo. Predefinito `Giornata particolare`. */
  label?: string;
  /** Nasconde l'etichetta visibile (resta come nome accessibile del gruppo). */
  hideLabel?: boolean;
  /** Mostra la nota sotto i chip. Predefinito true. */
  showNote?: boolean;
  className?: string;
}

/** Eccezioni predefinite. Il caffè non c'è perché l'utente non lo consuma. */
export const DEFAULT_EXCEPTIONS: readonly ExceptionItem[] = [
  { id: 'malattia', label: 'Malattia' },
  { id: 'viaggio', label: 'Viaggio' },
  { id: 'festa', label: 'Festa' },
  { id: 'notte-in-bianco', label: 'Notte in bianco' },
  { id: 'alcol', label: 'Alcol' },
];

export const EXCEPTION_NOTE = 'Non conta nel riferimento della regolarità.';
export const ADD_FIELD_LABEL = 'Altro imprevisto';
export const ADD_SUBMIT_LABEL = 'Aggiungi';
export const ADD_CANCEL_LABEL = 'Annulla';
export const ADD_EMPTY_ERROR = "Scrivi il nome dell'imprevisto.";
export const ADD_INVALID_ERROR = 'Usa almeno una lettera o un numero.';
export const ADD_PLACEHOLDER = 'Per esempio: Cena fuori';

const usesOf = (item: ExceptionItem): number =>
  typeof item.uses === 'number' && Number.isFinite(item.uses) ? item.uses : 0;

/** Elimina voci senza etichetta o con id ripetuto e ordina per frequenza d'uso (ordinamento stabile). */
export function sortExceptions(items: readonly ExceptionItem[]): ExceptionItem[] {
  const seen = new Set<string>();
  const valid = items.filter((item) => {
    if (!item.id || item.label.trim() === '' || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return valid.sort((a, b) => usesOf(b) - usesOf(a));
}

export function ExceptionChips({
  exceptions = DEFAULT_EXCEPTIONS,
  active = [],
  onToggle,
  onAdd,
  onCreate,
  label = 'Giornata particolare',
  hideLabel = false,
  showNote = true,
  className,
}: ExceptionChipsProps) {
  const baseId = useId();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const addRef = useRef<HTMLButtonElement | null>(null);
  const wasAdding = useRef(false);

  // Il campo si apre col focus dentro; chiudendolo il focus torna a `+ Aggiungi`.
  useEffect(() => {
    if (adding) fieldRef.current?.focus();
    else if (wasAdding.current) addRef.current?.focus();
    wasAdding.current = adding;
  }, [adding]);

  const items = sortExceptions(exceptions);
  const canAdd = Boolean(onCreate ?? onAdd);
  if (items.length === 0 && !canAdd) return null;

  const activeSet = new Set(active);
  const labelId = `${baseId}-label`;
  const noteId = `${baseId}-note`;

  const close = () => {
    setAdding(false);
    setDraft('');
    setProblem(null);
  };

  const submit = () => {
    const name = normalizeExceptionLabel(draft);
    if (name === '') return setProblem(ADD_EMPTY_ERROR);
    const slug = slugifyExceptionLabel(name);
    if (slug === '') return setProblem(ADD_INVALID_ERROR);
    const existing = items.find((item) => item.id === slug);
    if (existing) {
      if (!activeSet.has(existing.id)) onToggle?.(existing.id, true);
    } else {
      onCreate?.({ id: slug, label: name });
    }
    close();
  };

  const addChip = () => {
    if (!onCreate) return onAdd?.();
    if (adding) close();
    else setAdding(true);
  };

  return (
    <div className={className ? `stack ${className}` : 'stack'}>
      {hideLabel ? null : (
        <div className="eyebrow" id={labelId}>
          {label}
        </div>
      )}
      <div
        role="group"
        className="row"
        aria-label={hideLabel ? label : undefined}
        aria-labelledby={hideLabel ? undefined : labelId}
        aria-describedby={showNote ? noteId : undefined}
      >
        {items.map((item) => {
          const on = activeSet.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={on ? 'chip chip-exc is-on' : 'chip chip-exc'}
              aria-pressed={on}
              onClick={onToggle ? () => onToggle(item.id, !on) : undefined}
            >
              {item.label}
            </button>
          );
        })}
        {canAdd ? (
          <button
            type="button"
            className="chip chip-add"
            ref={addRef}
            onClick={addChip}
            aria-label="Aggiungi un altro imprevisto"
            aria-expanded={onCreate ? adding : undefined}
          >
            <span aria-hidden="true">+ Aggiungi</span>
          </button>
        ) : null}
      </div>
      {onCreate && adding ? (
        <div className="stack">
          <TextField
            label={ADD_FIELD_LABEL}
            value={draft}
            onChange={(value) => {
              setDraft(value);
              setProblem(null);
            }}
            maxLength={EXCEPTION_LABEL_MAX}
            placeholder={ADD_PLACEHOLDER}
            error={problem}
            inputRef={fieldRef}
            onEnter={submit}
            onEscape={close}
          />
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={submit}>
              {ADD_SUBMIT_LABEL}
            </button>
            <button type="button" className="btn btn-ghost" onClick={close}>
              {ADD_CANCEL_LABEL}
            </button>
          </div>
        </div>
      ) : null}
      {showNote ? (
        <div className="caption muted" id={noteId}>
          {EXCEPTION_NOTE}
        </div>
      ) : null}
    </div>
  );
}
