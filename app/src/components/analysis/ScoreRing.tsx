import type { CSSProperties } from 'react';

import type { ScorePart, ScoreRingProps } from '../../server/views/analysis-types';
import { cx } from '../chartGeometry';
import styles from './ScoreRing.module.css';

/**
 * ScoreRing: anello del punteggio 0–100 con il numero al centro (l'unico display-lg della pagina),
 * la parola sotto e tre barre sottili per le componenti. Il significato è sempre scritto:
 * il colore accompagna, non sostituisce. Sotto soglia: anello vuoto punteggiato e hiddenText.
 */

/** Intero 0–100 o null se non è un numero finito. */
export function scorePct(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  return /NaN|undefined|Infinity/.test(t) ? '' : t;
}

/** Testo accessibile dell'anello: "Punteggio 72 su 100, buona". */
export function scoreAriaLabel(value: number | null, word: string, hidden: boolean, hiddenText: string): string {
  if (hidden || value === null) {
    const why = clean(hiddenText);
    return why ? `Punteggio non disponibile. ${why}` : 'Punteggio non disponibile.';
  }
  const w = clean(word);
  return w ? `Punteggio ${value} su 100, ${w.toLowerCase()}` : `Punteggio ${value} su 100`;
}

const PART_SHAPE: Record<ScorePart['id'], string | undefined> = {
  durata: styles.shapeCircle,
  regolarita: styles.shapeSquare,
  debito: styles.shapeDiamond,
};

function Part({ part }: { part: ScorePart }) {
  const pct = scorePct(part.pct);
  const label = clean(part.label);
  const note = clean(part.note);
  const style = { '--part-pct': `${pct ?? 0}%` } as CSSProperties;
  return (
    <li className={styles.part} data-part={part.id} data-state={pct === null ? 'nascosta' : 'visibile'}>
      <div className={styles.partHead}>
        <span className={cx(styles.shape, PART_SHAPE[part.id])} aria-hidden="true" />
        <span className={styles.partLabel}>{label}</span>
        <span className={styles.srOnly}>{pct === null ? ': non disponibile' : `: ${pct} su 100`}</span>
      </div>
      <div className={cx(styles.track, pct === null && styles.trackEmpty)} style={style} aria-hidden="true">
        {pct === null ? null : <span className={styles.fill} />}
      </div>
      {note ? <p className={styles.note}>{note}</p> : null}
    </li>
  );
}

export function ScoreRing({ score }: ScoreRingProps) {
  const value = scorePct(score.value);
  const hidden = score.hidden || value === null;
  const word = clean(score.word);
  const hiddenText = clean(score.hiddenText);
  const tone = score.tone;
  const ringStyle = { '--ring-offset': `${100 - (value ?? 0)}` } as CSSProperties;
  const parts = Array.isArray(score.parts) ? score.parts : [];

  return (
    <div className={styles.root} data-state={hidden ? 'nascosto' : 'visibile'} data-tone={tone}>
      <div className={styles.ringWrap} role="img" aria-label={scoreAriaLabel(value, word, hidden, hiddenText)}>
        <svg className={styles.ring} viewBox="0 0 120 120" shapeRendering="geometricPrecision" aria-hidden="true" focusable="false">
          {hidden ? (
            <circle className={styles.dotted} cx="60" cy="60" r="52" pathLength={100} />
          ) : (
            <>
              <circle className={styles.trackRing} cx="60" cy="60" r="52" />
              <circle
                className={cx(styles.value, styles[`tone-${tone}`])}
                cx="60"
                cy="60"
                r="52"
                pathLength={100}
                style={ringStyle}
                transform="rotate(-90 60 60)"
              />
            </>
          )}
        </svg>
        <div className={styles.center} aria-hidden="true">
          {hidden ? (
            <span className={styles.dash}>—</span>
          ) : (
            <>
              <span className={cx('display-lg', styles.number)}>{value}</span>
              {word ? <span className={styles.word}>{word}</span> : null}
            </>
          )}
        </div>
      </div>

      {hidden && hiddenText ? <p className={styles.hiddenText}>{hiddenText}</p> : null}

      {parts.length > 0 ? (
        <ul className={styles.parts}>
          {parts.map((p) => (
            <Part key={p.id} part={p} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default ScoreRing;
