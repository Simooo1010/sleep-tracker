import type { HTMLAttributes, ReactNode } from 'react';

import type { NightStatus, Provenance } from '../domain/types';

/**
 * Badge a pillola (classi `badge` di bundle.css). Contiene sempre una parola: non esiste un badge di solo colore.
 * Tre modi d'uso:
 * - `provenance`: provenienza di un valore (Automatico, Confermato, Stimato, Mancante; `feminine` per Automatica, Confermata...).
 * - `status`: stato di una notte (Confermata, Stimata, Mancante).
 * - `variant`: qualsiasi variante, con testo predefinito o personalizzato (`children`).
 */
export type BadgeVariant = 'auto' | 'confirmed' | 'estimated' | 'missing' | 'ok' | 'out' | 'ai' | 'rules' | 'forecast';

type SpanProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

export type BadgeProps = SpanProps &
  (
    | { variant: BadgeVariant; children?: ReactNode; feminine?: boolean; provenance?: never; status?: never }
    | { provenance: Provenance; feminine?: boolean; variant?: never; children?: never; status?: never }
    | { status: NightStatus; variant?: never; children?: never; feminine?: never; provenance?: never }
  );

const PROVENANCE_VARIANT: Record<Provenance, BadgeVariant> = {
  automatico: 'auto',
  confermato: 'confirmed',
  stimato: 'estimated',
  mancante: 'missing',
};

const STATUS_VARIANT: Record<NightStatus, BadgeVariant> = {
  confermata: 'confirmed',
  stimata: 'estimated',
  mancante: 'missing',
};

const LABEL: Record<BadgeVariant, string> = {
  auto: 'Automatico',
  confirmed: 'Confermato',
  estimated: 'Stimato',
  missing: 'Mancante',
  ok: 'OK',
  out: 'Fuori',
  ai: 'AI',
  rules: 'Regole',
  forecast: 'Previsione',
};

const LABEL_FEMININE: Partial<Record<BadgeVariant, string>> = {
  auto: 'Automatica',
  confirmed: 'Confermata',
  estimated: 'Stimata',
  missing: 'Mancante',
};

/** Testo predefinito di una variante (maschile o femminile per la provenienza). */
export function badgeLabel(variant: BadgeVariant, feminine = false): string {
  return (feminine ? LABEL_FEMININE[variant] : undefined) ?? LABEL[variant];
}

function isEmpty(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === 'boolean') return true;
  if (typeof node === 'string') return node.trim() === '';
  if (typeof node === 'number') return !Number.isFinite(node);
  return false;
}

export function Badge(props: BadgeProps) {
  const { variant: v, provenance, status, feminine, children, className, ...rest } = props;
  let variant: BadgeVariant;
  let fem = feminine ?? false;
  if (status !== undefined) {
    variant = STATUS_VARIANT[status];
    fem = true;
  } else if (provenance !== undefined) {
    variant = PROVENANCE_VARIANT[provenance];
  } else {
    variant = v ?? 'missing';
  }
  const content = isEmpty(children) ? badgeLabel(variant, fem) : children;
  const classes = ['badge', `badge-${variant}`];
  if (className) classes.push(className);
  return (
    <span {...rest} className={classes.join(' ')}>
      {content}
    </span>
  );
}
