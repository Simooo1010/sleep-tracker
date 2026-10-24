import { useId } from 'react';

/**
 * Chip a un tocco per segnare un giorno fuori dal normale (classi `chip chip-exc` e `chip-add` di bundle.css).
 * Un giorno-eccezione resta visibile ma non entra nel riferimento della regolarità.
 * Lista aperta e personalizzabile, ordinata per frequenza d'uso (`uses`, decrescente; a pari uso resta l'ordine dato).
 * Sempre facoltative. Componente senza stato: il genitore passa `active` e riceve `onToggle`.
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
  /** Se presente, mostra il chip finale `+ Aggiungi`. */
  onAdd?: () => void;
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
  label = 'Giornata particolare',
  hideLabel = false,
  showNote = true,
  className,
}: ExceptionChipsProps) {
  const baseId = useId();
  const items = sortExceptions(exceptions);
  if (items.length === 0 && !onAdd) return null;

  const activeSet = new Set(active);
  const labelId = `${baseId}-label`;
  const noteId = `${baseId}-note`;

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
        {onAdd ? (
          <button type="button" className="chip chip-add" onClick={onAdd} aria-label="Aggiungi un'eccezione">
            <span aria-hidden="true">+ Aggiungi</span>
          </button>
        ) : null}
      </div>
      {showNote ? (
        <div className="caption muted" id={noteId}>
          {EXCEPTION_NOTE}
        </div>
      ) : null}
    </div>
  );
}
