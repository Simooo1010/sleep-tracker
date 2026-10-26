import type { ActionCardProps } from '../../server/views/analysis-types';
import { cx } from '../chartGeometry';
import styles from './ActionCard.module.css';

/**
 * ActionCard: un'azione suggerita con numero d'ordine, "Perché", "Effetto atteso" e impatto.
 * L'impatto è scritto (`impactLabel`) e accompagnato da tre pallini pieni/vuoti (forma, non colore).
 * Nessun pulsante pieno: la pagina ne ha al massimo uno.
 */

function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  return /NaN|undefined|Infinity/.test(t) ? '' : t;
}

/** Impatto 1–3; valori non validi diventano 1. */
export function impactLevel(v: unknown): 1 | 2 | 3 {
  return v === 2 || v === 3 ? v : 1;
}

const IMPACT_WORD: Record<1 | 2 | 3, string> = { 1: 'Piccolo', 2: 'Medio', 3: 'Alto' };

export function ActionCard({ action, index }: ActionCardProps) {
  const title = clean(action.title);
  const why = clean(action.why);
  const expected = clean(action.expected);
  const level = impactLevel(action.impact);
  const impactLabel = clean(action.impactLabel) || IMPACT_WORD[level];
  const order = typeof index === 'number' && Number.isFinite(index) ? Math.max(1, Math.round(index)) : null;
  const titleId = `action-${action.id}`;

  return (
    <article className={cx('card', styles.root)} aria-labelledby={titleId} data-impact={level}>
      <div className={styles.head}>
        {order !== null ? (
          <span className={styles.order} aria-hidden="true">
            {order}
          </span>
        ) : null}
        <h3 id={titleId} className={cx('serif', 'title', styles.title)}>
          {order !== null ? <span className={styles.srOnly}>{`Azione ${order}: `}</span> : null}
          {title}
        </h3>
      </div>

      <dl className={styles.list}>
        {why ? (
          <div className={styles.item}>
            <dt className={styles.term}>Perché</dt>
            <dd className={styles.desc}>{why}</dd>
          </div>
        ) : null}
        {expected ? (
          <div className={styles.item}>
            <dt className={styles.term}>Effetto atteso</dt>
            <dd className={styles.desc}>{expected}</dd>
          </div>
        ) : null}
        <div className={cx(styles.item, styles.impactRow)}>
          <dt className={styles.term}>Impatto</dt>
          <dd className={styles.impact}>
            <span className={styles.dots} aria-hidden="true">
              {[1, 2, 3].map((d) => (
                <span key={d} className={cx(styles.pip, d <= level && styles.on)} />
              ))}
            </span>
            <span className={styles.impactLabel}>{impactLabel}</span>
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default ActionCard;
