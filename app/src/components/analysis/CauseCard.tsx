import type { CauseCardProps } from '../../server/views/analysis-types';
import { cx } from '../chartGeometry';
import styles from './CauseCard.module.css';

/**
 * CauseCard: un indizio sul periodo (mai una causa certa) con i numeri che lo sostengono.
 * Scheda `.card` di bundle.css; i numeri stanno in un riquadro -soft dell'accento, sempre scritti.
 */

function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  return /NaN|undefined|Infinity/.test(t) ? '' : t;
}

export function CauseCard({ cause }: CauseCardProps) {
  const title = clean(cause.title);
  const body = clean(cause.body);
  const evidence = clean(cause.evidence);
  const titleId = `cause-${cause.id}`;
  return (
    <article className={cx('card', styles.root)} aria-labelledby={titleId} data-tone={cause.tone}>
      <span className={styles.kicker}>Indizio</span>
      <h3 id={titleId} className={cx('serif', 'title', styles.title)}>
        {title}
      </h3>
      {body ? <p className={styles.body}>{body}</p> : null}
      {evidence ? (
        <p className={cx(styles.evidence, styles[`tone-${cause.tone}`])}>
          <span className={styles.evidenceLabel}>Dati</span>
          <span>{evidence}</span>
        </p>
      ) : null}
    </article>
  );
}

export default CauseCard;
