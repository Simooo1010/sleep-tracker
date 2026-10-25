import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Pulsante a pillola del design system (classi `btn` di bundle.css).
 * - `primary` (pesca): l'unica azione piena della schermata, ad esempio `Conferma`.
 * - `soft` (azzurro): navigazione dentro un flusso, ad esempio `Avanti`.
 * - `secondary`: azione alternativa con bordo, ad esempio `Indietro`.
 * - `ghost`: azione terziaria sottolineata, ad esempio `Correggi orari`, `Annulla`.
 * - `round`: passo di ±5 minuti del TimeStepper; `aria-label` obbligatorio.
 * Etichetta: verbo all'imperativo, una o due parole. Il componente non ha stato.
 */
export type ButtonVariant = 'primary' | 'soft' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

type NativeProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export type TextButtonProps = NativeProps & {
  /** Predefinito `secondary`. */
  variant?: ButtonVariant;
  /** `lg` (56px) per il pulsante finale di un flusso. */
  size?: ButtonSize;
  /** Larghezza piena (telefono). */
  block?: boolean;
  children: ReactNode;
};

export type RoundButtonProps = NativeProps & {
  variant: 'round';
  /** Obbligatorio: il contenuto visibile è solo un segno (−, +). */
  'aria-label': string;
  size?: never;
  block?: never;
  children: ReactNode;
};

export type ButtonProps = TextButtonProps | RoundButtonProps;

const VARIANT_CLASS: Record<ButtonVariant | 'round', string> = {
  primary: 'btn-primary',
  soft: 'btn-soft',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  round: 'btn-round',
};

export function Button({ variant = 'secondary', size, block, className, type, children, ...rest }: ButtonProps) {
  const classes = ['btn', VARIANT_CLASS[variant]];
  if (size === 'lg') classes.push('btn-lg');
  if (block) classes.push('btn-block');
  if (className) classes.push(className);
  return (
    <button {...rest} type={type ?? 'button'} className={classes.join(' ')}>
      {variant === 'round' ? <span aria-hidden="true">{children}</span> : children}
    </button>
  );
}
