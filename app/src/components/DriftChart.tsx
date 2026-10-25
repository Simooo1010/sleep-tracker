/**
 * DriftChart: sei mediane settimanali dell'orario di letto e il badge della deriva.
 * Spec: docs/design/system/components/DriftChart/README.md.
 */
import { DEFAULT_TOLERANCE_MIN, cx, formatBedClock, formatSigned, isNum, round2 } from './chartGeometry';
import styles from './DriftChart.module.css';

/** Altezza minima e ampiezza della scala delle barre (percentuali dell'area). */
export const DRIFT_BAR_MIN_PCT = 20;
export const DRIFT_BAR_RANGE_PCT = 60;
/** Altezza della barra di una settimana mancante. */
export const DRIFT_MISSING_PCT = 12;

export interface DriftChartProps {
  /** Mediane settimanali dalla più vecchia alla più recente (di solito 6), minuti dalle 18:00. null = settimana mancante. */
  weeklyBedMin: Array<number | null>;
  /** Deriva: ultima mediana valida − prima mediana valida, minuti con segno (+ = più tardi). null = non disponibile. */
  shiftMin: number | null;
  /** Settimane tra la prima e l'ultima mediana valida. null = non disponibile. */
  spanWeeks: number | null;
  /** Supera la tolleranza. Default: |shiftMin| > toleranceMin. */
  exceeds?: boolean;
  /** Tolleranza in minuti (default 30). */
  toleranceMin?: number;
  /** Titolo (default 'Deriva della mediana'). */
  title?: string;
}

/** Etichette sotto le barre: '5 sett. fa', '4', '3', '2', '1', 'Ora'. */
export function driftLabels(count: number): string[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => {
    const ago = n - 1 - i;
    if (ago === 0) return 'Ora';
    return i === 0 ? `${ago} sett. fa` : String(ago);
  });
}

/**
 * Altezze delle barre (percentuale), proporzionali allo scostamento dalla prima mediana valida.
 * La scala copre almeno la tolleranza, così piccoli spostamenti restano piccoli. Mancante → null.
 */
export function driftHeights(values: Array<number | null>, toleranceMin: number = DEFAULT_TOLERANCE_MIN): Array<number | null> {
  const first = values.find(isNum);
  if (first === undefined) return values.map(() => null);
  const offsets = values.map((v) => (isNum(v) ? v - first : null));
  const valid = offsets.filter(isNum);
  const lo = Math.min(0, ...valid);
  const hi = Math.max(0, ...valid);
  const span = Math.max(hi - lo, Math.abs(toleranceMin) || 1);
  return offsets.map((o) => (o === null ? null : round2(DRIFT_BAR_MIN_PCT + (DRIFT_BAR_RANGE_PCT * (o - lo)) / span)));
}

/** Badge della deriva: '+42 min in 5 settimane', '−35 min in 1 settimana'. Dati assenti → null. */
export function formatDriftBadge(shiftMin: number | null, spanWeeks: number | null): string | null {
  const s = formatSigned(shiftMin);
  if (s === null || !isNum(spanWeeks)) return null;
  const w = Math.round(spanWeeks);
  return `${s} min in ${w} ${w === 1 ? 'settimana' : 'settimane'}`;
}

/** Supera la tolleranza: usa `exceeds` se dato, altrimenti |shift| > tolleranza. */
export function driftExceeds(props: Pick<DriftChartProps, 'shiftMin' | 'exceeds' | 'toleranceMin'>): boolean {
  if (typeof props.exceeds === 'boolean') return props.exceeds;
  const tol = props.toleranceMin ?? DEFAULT_TOLERANCE_MIN;
  return isNum(props.shiftMin) && Math.abs(Math.round(props.shiftMin)) > Math.abs(tol);
}

/** Frase sotto il grafico. */
export function driftSentence(props: DriftChartProps): string {
  const tol = props.toleranceMin ?? DEFAULT_TOLERANCE_MIN;
  const valid = props.weeklyBedMin.filter(isNum);
  const first = valid[0];
  const last = valid[valid.length - 1];
  if (valid.length < 2 || first === undefined || last === undefined || !isNum(props.shiftMin)) {
    return 'Per misurare la deriva servono almeno due settimane con dati.';
  }
  const from = formatBedClock(first);
  const to = formatBedClock(last);
  const moved =
    from === to
      ? `La mediana del tuo orario di letto è rimasta alle ${from}.`
      : `La mediana del tuo orario di letto si è spostata da ${from} a ${to}.`;
  const verdict = driftExceeds(props) ? `È oltre la tolleranza di ± ${tol} min.` : `È entro la tolleranza di ± ${tol} min.`;
  return `${moved} ${verdict}`;
}

/** Riassunto accessibile del grafico. */
export function describeDriftChart(props: DriftChartProps): string {
  const labels = driftLabels(props.weeklyBedMin.length);
  const parts = props.weeklyBedMin.map((v, i) => `${labels[i]}: ${formatBedClock(v) ?? 'mancante'}`);
  const badge = formatDriftBadge(props.shiftMin, props.spanWeeks);
  return `${props.title ?? 'Deriva della mediana'}. ${badge ? `Deriva ${badge}. ` : ''}Mediane settimanali del letto: ${parts.join(', ')}.`;
}

export function DriftChart(props: DriftChartProps) {
  const { weeklyBedMin } = props;
  const tol = props.toleranceMin ?? DEFAULT_TOLERANCE_MIN;
  const title = props.title ?? 'Deriva della mediana';
  const labels = driftLabels(weeklyBedMin.length);
  const heights = driftHeights(weeklyBedMin, tol);
  const badge = formatDriftBadge(props.shiftMin, props.spanWeeks);
  const enough = weeklyBedMin.filter(isNum).length >= 2 && badge !== null;
  const last = weeklyBedMin.length - 1;

  return (
    <figure className={cx('card', 'stack', styles.root)}>
      <div className={cx('row', styles.head)}>
        <figcaption className="eyebrow">{title}</figcaption>
        {enough ? (
          <span className={cx('badge', driftExceeds(props) ? 'badge-out' : 'badge-ok')}>{badge}</span>
        ) : (
          <span className="badge badge-missing">Mancante</span>
        )}
      </div>

      <div className={styles.chart} role="img" aria-label={describeDriftChart(props)}>
        <div className={cx('vbars', styles.bars)}>
          {weeklyBedMin.map((v, i) => {
            const h = heights[i] ?? null;
            const clock = formatBedClock(v);
            return (
              <div key={i} className={styles.col}>
                <span className={styles.value}>{clock ?? 'Mancante'}</span>
                {h === null || clock === null ? (
                  <div className={styles.missingBar} style={{ height: `${DRIFT_MISSING_PCT}%` }} />
                ) : (
                  <div className={cx('vbar', styles.bar, i === last && 'is-now')} style={{ height: `${h}%` }} />
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.labels}>
          {labels.map((l, i) => (
            <span key={i} className={styles.label}>
              {l}
            </span>
          ))}
        </div>
      </div>

      <p className={cx('muted', styles.sentence)}>{driftSentence(props)}</p>
    </figure>
  );
}

export default DriftChart;
