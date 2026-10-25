'use client';

import { useId, type KeyboardEvent } from 'react';

import type { Score } from '../domain/types';
import styles from './MoonRating.module.css';

/**
 * Scala di voto 1–5 a fasi lunari (docs/design/system/components/MoonRating).
 * - `energy`: voto di energia del mattino, selezione `yellow` (salvia nel tema scuro).
 * - `tired`: stanchezza della sera, selezione `blue-soft` con anello `blue-ink`.
 * - `forecast`: previsione di energia per domani, solo lettura.
 * Interattiva come radiogroup (frecce, Home, Fine, tabindex mobile); senza `onChange` è solo lettura.
 */
export type MoonRatingKind = 'energy' | 'tired' | 'forecast';

export const SCORES: readonly Score[] = [1, 2, 3, 4, 5];

/** Nome della fase lunare per voto: dalla luna nuova (1) alla luna piena (5). */
export const MOON_PHASE_NAMES: Readonly<Record<Score, string>> = {
  1: 'luna nuova',
  2: 'quarto crescente',
  3: 'mezza luna',
  4: 'gibbosa',
  5: 'luna piena',
};

/** Frazione illuminata per voto: 0, 0,25, 0,5, 0,75, 1. */
export function moonFraction(score: Score): number {
  return (score - 1) / 4;
}

/**
 * Tracciato SVG (viewBox 24, raggio 10) della parte illuminata della luna per il voto.
 * Luna nuova: stringa vuota (solo il contorno). Luna piena: cerchio pieno.
 */
export function moonPhasePath(score: Score): string {
  const f = moonFraction(score);
  if (f <= 0) return '';
  if (f >= 1) return 'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20';
  if (f === 0.5) return 'M12 2A10 10 0 0 1 12 22Z';
  const r = Math.abs(1 - 2 * f) * 10;
  return `M12 2A10 10 0 0 1 12 22A${r} 10 0 0 ${f < 0.5 ? 0 : 1} 12 2Z`;
}

/** Converte un valore qualsiasi in voto 1–5; tutto il resto (null, NaN, 0, 6, 2.5) è "nessun voto". */
export function toScore(value: unknown): Score | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? (value as Score) : null;
}

/**
 * Voto raggiunto da un tasto, partendo dalla luna che ha il focus.
 * Frecce destra/giù: +1, sinistra/su: −1, con giro da 5 a 1 e viceversa (come un radiogroup). Home: 1. Fine: 5.
 * Restituisce null per gli altri tasti.
 */
export function nextScore(from: Score, key: string): Score | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return from === 5 ? 1 : ((from + 1) as Score);
    case 'ArrowLeft':
    case 'ArrowUp':
      return from === 1 ? 5 : ((from - 1) as Score);
    case 'Home':
      return 1;
    case 'End':
      return 5;
    default:
      return null;
  }
}

const SUBJECT: Record<MoonRatingKind, string> = {
  energy: 'Energia',
  tired: 'Stanchezza',
  forecast: 'Previsione di energia',
};

const DEFAULT_LABEL: Record<MoonRatingKind, string> = {
  energy: 'Energia di questa mattina',
  tired: 'Stanchezza di stasera',
  forecast: 'Previsione di energia per domani',
};

const ON_CLASS: Record<MoonRatingKind, string> = {
  energy: 'is-on-energy',
  tired: 'is-on-tired',
  forecast: 'is-on-forecast',
};

/** Etichetta accessibile di una luna: "Energia 3 di 5". */
export function moonAriaLabel(kind: MoonRatingKind, score: Score): string {
  return `${SUBJECT[kind]} ${score} di 5`;
}

export interface MoonRatingProps {
  kind: MoonRatingKind;
  /** Voto selezionato 1–5; null o assente = nessun voto (vuoto, mai zero). */
  value?: Score | null;
  /** Gestore del voto. Senza gestore la scala è solo lettura (es. previsione). */
  onChange?: (score: Score) => void;
  /** Nome accessibile del gruppo. Predefinito per tipo, es. "Energia di questa mattina". */
  label?: string;
  /** Estremi scritti sotto la scala. Predefinito solo per `tired`: "Per niente" e "Esausto". */
  scaleLabels?: readonly [string, string] | null;
  /** `lg` = 52px, per il check serale su telefono. Predefinito 48px. */
  size?: 'md' | 'lg';
  /** Distribuisce le lune su tutta la larghezza (telefono). */
  spread?: boolean;
  /** Il voto è una stima (es. previsione): scrive "Stimata" accanto alla scala. */
  estimated?: boolean;
  className?: string;
}

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

function MoonIcon({ score }: { score: Score }) {
  const d = moonPhasePath(score);
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      {d ? <path className="lit" d={d} /> : null}
    </svg>
  );
}

export function MoonRating({
  kind,
  value,
  onChange,
  label,
  scaleLabels,
  size = 'md',
  spread = false,
  estimated = false,
  className,
}: MoonRatingProps) {
  const selected = toScore(value);
  const groupLabel = label ?? DEFAULT_LABEL[kind];
  const ends = scaleLabels === undefined ? (kind === 'tired' ? (['Per niente', 'Esausto'] as const) : null) : scaleLabels;
  const interactive = typeof onChange === 'function';
  // Tabindex mobile: entra nel gruppo sul voto scelto, altrimenti sulla prima luna.
  const tabStop: Score = selected ?? 1;
  const scaleId = useId();

  const moonClass = (s: Score) =>
    cx('moon', size === 'lg' && styles.lg, s === selected && ON_CLASS[kind], !interactive && styles.static);

  const handleKeyDown = (from: Score) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextScore(from, e.key);
    if (next === null || !onChange) return;
    e.preventDefault();
    onChange(next);
    const group = e.currentTarget.parentElement;
    const target = group?.querySelector<HTMLButtonElement>(`[data-score="${next}"]`);
    target?.focus();
  };

  return (
    <div className={cx(styles.root, className)}>
      {interactive ? (
        <div
          role="radiogroup"
          aria-label={groupLabel}
          aria-describedby={ends ? scaleId : undefined}
          className={cx('moons', spread && styles.spread)}>
          {SCORES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === selected}
              aria-label={moonAriaLabel(kind, s)}
              tabIndex={s === tabStop ? 0 : -1}
              data-score={s}
              className={moonClass(s)}
              onClick={() => onChange(s)}
              onKeyDown={handleKeyDown(s)}
            >
              <MoonIcon score={s} />
            </button>
          ))}
        </div>
      ) : (
        <div
          role="img"
          aria-label={`${groupLabel}: ${selected ? `${selected} di 5` : 'mancante'}${estimated ? ', stimata' : ''}`}
          className={cx('moons', spread && styles.spread)}
        >
          {SCORES.map((s) => (
            <span key={s} className={moonClass(s)} aria-hidden="true">
              <MoonIcon score={s} />
            </span>
          ))}
        </div>
      )}
      {ends ? (
        <div id={scaleId} className={cx('moon-scale', styles.scale)}>
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      ) : null}
      {!interactive && (!selected || estimated) ? (
        <p className={cx('caption', 'muted', styles.note)}>{selected ? 'Stimata' : 'Mancante'}</p>
      ) : null}
    </div>
  );
}
