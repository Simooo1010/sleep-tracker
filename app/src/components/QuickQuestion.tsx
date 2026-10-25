'use client';

import { useId } from 'react';

import styles from './QuickQuestion.module.css';

/**
 * Domanda rapida a un tocco (docs/design/system/components/QuickQuestion).
 * Una sola domanda per volta, due o tre risposte come chip da 48px e `Salta` sempre presente, senza conseguenze.
 */

export interface QuickAnswer<T extends string = string> {
  value: T;
  label: string;
}

/** Risposte di default per le domande sì/no. */
export const YES_NO: readonly QuickAnswer<'si' | 'no'>[] = [
  { value: 'si', label: 'Sì' },
  { value: 'no', label: 'No' },
];

export const SKIP_LABEL = 'Salta';

/** Al massimo tre risposte (oltre a Salta); scarta etichette vuote, duplicati e un eventuale "Salta" passato a mano. */
export function normalizeAnswers<T extends string>(answers: readonly QuickAnswer<T>[]): QuickAnswer<T>[] {
  const seen = new Set<string>();
  const out: QuickAnswer<T>[] = [];
  for (const a of answers) {
    const label = a.label.trim();
    if (!label || label.toLowerCase() === SKIP_LABEL.toLowerCase() || seen.has(a.value)) continue;
    seen.add(a.value);
    out.push({ value: a.value, label });
    if (out.length === 3) break;
  }
  return out;
}

/** Testo di avanzamento: "Domanda rapida · 1 di 2". Null se i numeri non sono validi. */
export function progressLabel(current?: number, total?: number): string | null {
  if (
    typeof current !== 'number' ||
    typeof total !== 'number' ||
    !Number.isInteger(current) ||
    !Number.isInteger(total) ||
    total < 1 ||
    current < 1 ||
    current > total
  ) {
    return null;
  }
  return `Domanda rapida · ${current} di ${total}`;
}

export interface QuickQuestionProps<T extends string = string> {
  /** La domanda, es. "Ieri sera hai fatto sport?". */
  question: string;
  /** Due o tre risposte da un tocco. `Salta` viene aggiunto sempre dal componente. */
  answers?: readonly QuickAnswer<T>[];
  onAnswer: (value: T) => void;
  onSkip: () => void;
  /** Risposta già data (resta evidenziata con `chip is-on` e aria-pressed). */
  selected?: T | null;
  /** Posizione nella sequenza del giorno, es. 1 di 2. */
  current?: number;
  total?: number;
  className?: string;
}

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function QuickQuestion<T extends string = string>({
  question,
  answers = YES_NO as unknown as readonly QuickAnswer<T>[],
  onAnswer,
  onSkip,
  selected = null,
  current,
  total,
  className,
}: QuickQuestionProps<T>) {
  const id = useId();
  const qId = `${id}-q`;
  const list = normalizeAnswers(answers);
  const progress = progressLabel(current, total);

  return (
    <section aria-labelledby={qId} className={cx('card', 'qq', className)}>
      {progress ? <p className={cx('eyebrow', styles.flush)}>{progress}</p> : null}
      <p id={qId} className={cx('q', styles.flush)} aria-live="polite" aria-atomic="true">
        {question}
      </p>
      <div role="group" aria-labelledby={qId} className="a">
        {list.map((a) => (
          <button
            key={a.value}
            type="button"
            className={cx('chip', a.value === selected && 'is-on')}
            aria-pressed={a.value === selected}
            onClick={() => onAnswer(a.value)}
          >
            {a.label}
          </button>
        ))}
        <button type="button" className={cx('chip', styles.skip)} onClick={onSkip}>
          {SKIP_LABEL}
        </button>
      </div>
    </section>
  );
}
