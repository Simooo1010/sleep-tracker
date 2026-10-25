'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

import styles from './WizardStep.module.css';

/**
 * WizardStep: una domanda per schermata (docs/design/system/components/WizardStep).
 * In alto etichetta "Check serale · domanda N di T", domanda in `heading-lg` e barra di avanzamento a segmenti.
 * In basso `Indietro` (non sul primo passo) e `Avanti`; sull'ultimo passo `Vado a dormire`, unico pulsante pieno.
 * Quando cambia `step` il focus va sul titolo del passo (tenere la stessa istanza tra i passi, senza `key` per passo).
 */

export interface WizardStepProps {
  /** Passo corrente, da 1. */
  step: number;
  /** Numero totale di passi. */
  total: number;
  /** La domanda del passo. */
  question: string;
  /** Il controllo del passo (MoonRating o gruppo di Chip). */
  children?: ReactNode;
  /** Prima parte dell'etichetta in alto. */
  kicker?: string;
  headingLevel?: 1 | 2 | 3;
  onNext?: () => void;
  onBack?: () => void;
  /** Ultimo passo: salva il check. */
  onFinish?: () => void;
  /** Nota sotto `Vado a dormire`. */
  finishHint?: string;
  /** Messaggio dopo l'invio: se presente sostituisce i pulsanti. */
  confirmation?: string;
}

function toCount(n: number, min: number): number {
  return Number.isFinite(n) ? Math.max(min, Math.round(n)) : min;
}

export function WizardStep({
  step,
  total,
  question,
  children,
  kicker = 'Check serale',
  headingLevel = 2,
  onNext,
  onBack,
  onFinish,
  finishHint = 'Salva il check e avvia il Comando che attiva Riposo.',
  confirmation,
}: WizardStepProps) {
  const count = toCount(total, 1);
  const current = Math.min(toCount(step, 1), count);
  const isFirst = current === 1;
  const isLast = current === count;

  const titleId = useId();
  const hintId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(current);

  useEffect(() => {
    if (shownStep.current !== current) {
      shownStep.current = current;
      titleRef.current?.focus();
    }
  }, [current]);

  const Heading = `h${headingLevel}` as const;
  const position = `domanda ${current} di ${count}`;

  return (
    <section className={`card ${styles.wizard}`} aria-labelledby={titleId}>
      <div>
        <div className="eyebrow">
          {kicker} · {position}
        </div>
        <Heading id={titleId} ref={titleRef} tabIndex={-1} className={`heading-lg ${styles.title}`}>
          {question}
        </Heading>
        <div
          className={`progress ${styles.progress}`}
          role="progressbar"
          aria-label={`Avanzamento: ${kicker.toLowerCase()}`}
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={current}
          aria-valuetext={`Domanda ${current} di ${count}`}
        >
          {Array.from({ length: count }, (_, i) => (
            <i key={i} className={i < current ? 'on' : undefined} aria-hidden="true" />
          ))}
        </div>
      </div>

      <div role="group" aria-labelledby={titleId}>
        {children}
      </div>

      {confirmation ? (
        <p className={`body-sm ${styles.done}`} role="status">
          {confirmation}
        </p>
      ) : (
        <div className={styles.actions}>
          <div className={styles.buttons}>
            {!isFirst && (
              <button type="button" className="btn btn-secondary btn-lg" onClick={onBack}>
                Indietro
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                className={`btn btn-primary btn-lg ${styles.main}`}
                onClick={onFinish}
                aria-describedby={finishHint ? hintId : undefined}
              >
                Vado a dormire
              </button>
            ) : (
              <button type="button" className={`btn btn-soft btn-lg ${styles.main}`} onClick={onNext}>
                Avanti
              </button>
            )}
          </div>
          {isLast && finishHint && (
            <p id={hintId} className={`caption ${styles.hint}`}>
              {finishHint}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default WizardStep;
