import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

/**
 * Chip a pillola selezionabile (classi `chip` di bundle.css) per umore, fattori, sonnellino ed eccezioni.
 * Il chip non gestisce lo stato da solo: il genitore passa `pressed` e riceve `onPressedChange`.
 * Selezione singola (umore, sonnellino) o multipla (fattori) la decide il genitore.
 * `aria-pressed` è sempre impostato; lo stato acceso si vede anche dal bordo più spesso e dallo sfondo pieno.
 */
export type ChipVariant = 'factor' | 'mood' | 'nap' | 'exception';

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-pressed'> & {
  children: ReactNode;
  pressed: boolean;
  /** Predefinito `factor` (fattori della giornata). */
  variant?: ChipVariant;
  /** Chiamato con il nuovo stato a ogni tocco (dopo `onClick`, se non annullato). */
  onPressedChange?: (next: boolean) => void;
};

const VARIANT_CLASS: Record<ChipVariant, string | null> = {
  factor: null,
  mood: 'chip-mood',
  nap: 'chip-nap',
  exception: 'chip-exc',
};

/** Elenco dei fattori della giornata (mai il caffè). */
export const FACTORS = ['Schermo a letto', 'Sport', 'Giornata stressante', 'Cena tardi', 'Alcol', 'Mal di testa'] as const;
/** Scala dell'umore serale, dal più pesante al più sereno. */
export const MOODS = ['Pesante', 'Così così', 'Neutro', 'Leggero', 'Sereno'] as const;
/** Durate del sonnellino nel check serale. */
export const NAP_OPTIONS = ['Nessuno', '15 min', '30 min', '45 min', '1 ora'] as const;

export function Chip({
  children,
  pressed,
  variant = 'factor',
  onPressedChange,
  onClick,
  className,
  type,
  ...rest
}: ChipProps) {
  const classes = ['chip'];
  const extra = VARIANT_CLASS[variant];
  if (extra) classes.push(extra);
  if (pressed) classes.push('is-on');
  if (className) classes.push(className);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) onPressedChange?.(!pressed);
  };

  return (
    <button
      {...rest}
      type={type ?? 'button'}
      className={classes.join(' ')}
      aria-pressed={pressed}
      onClick={onClick || onPressedChange ? handleClick : undefined}
    >
      {children}
    </button>
  );
}
