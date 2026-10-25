/**
 * DurationChart: durata delle ultime 14 notti, linea dell'obiettivo e debito di sonno.
 * Spec: docs/design/system/components/DurationChart/README.md.
 */
import { PROVENIENZA_NOTTE, clamp, cx, formatDuration, isNum, round2, type Provenienza } from './chartGeometry';
import styles from './DurationChart.module.css';

/** Durata che corrisponde all'altezza piena delle barre (9h). */
export const DURATION_SCALE_MIN = 540;
/** Obiettivo di esempio (7h 30m). */
export const DEFAULT_TARGET_MIN = 450;
/** Altezza della barra di una notte mancante (bassa e punteggiata). */
export const MISSING_BAR_PCT = 10;

export interface DurationNight {
  /** Etichetta sotto la barra, es. '10'. */
  label: string;
  /** Etichetta estesa per il riassunto accessibile, es. 'sabato 10 ottobre'. Default: label. */
  fullLabel?: string;
  /** Durata in minuti. null = mancante. */
  durationMin: number | null;
  provenance: Provenienza;
}

export interface DurationChartProps {
  /** Notti dalla più vecchia alla più recente (di solito 14). */
  nights: DurationNight[];
  /** Obiettivo in minuti (default 450 = 7h 30m). */
  targetMin?: number;
  /** Media delle ultime 7 notti, minuti. null = non disponibile. */
  avg7Min: number | null;
  /** Media del mese, minuti. null = non disponibile. */
  avgMonthMin: number | null;
  /** Debito sulle ultime 7 notti, minuti (già calcolato). null = non disponibile. */
  debtMin: number | null;
  /** Titolo (default 'Durata e debito, ultime N notti'). */
  title?: string;
}

/** Altezza della barra in percentuale della scala (540 min), con clamp 0–100. Non finito → null. */
export function durationPct(min: number | null | undefined, scaleMin: number = DURATION_SCALE_MIN): number | null {
  if (!isNum(min) || !isNum(scaleMin) || scaleMin <= 0) return null;
  return round2(clamp((min / scaleMin) * 100, 0, 100));
}

/** Una notte è disegnata come mancante se manca la durata o la provenienza è 'mancante'. */
export function isMissingNight(n: Pick<DurationNight, 'durationMin' | 'provenance'>): boolean {
  return n.provenance === 'mancante' || !isNum(n.durationMin);
}

/** Testo del debito: 'Debito 1h 05m', 'Nessun debito', 'Debito Mancante'. */
export function debtText(debtMin: number | null): string {
  if (!isNum(debtMin)) return 'Debito Mancante';
  return Math.round(debtMin) <= 0 ? 'Nessun debito' : `Debito ${formatDuration(debtMin)}`;
}

/** Riassunto accessibile dell'intero grafico. */
export function describeDurationChart(props: DurationChartProps): string {
  const target = isNum(props.targetMin) ? props.targetMin : DEFAULT_TARGET_MIN;
  const total = props.nights.length;
  const missing = props.nights.filter(isMissingNight).length;
  const below = props.nights.filter((n) => !isMissingNight(n) && (n.durationMin as number) < target).length;
  const avg7 = formatDuration(props.avg7Min) ?? 'mancante';
  const avgM = formatDuration(props.avgMonthMin) ?? 'mancante';
  const notti = total === 1 ? 'notte' : 'notti';
  return (
    `Durata delle ultime ${total} ${notti}, obiettivo ${formatDuration(target)}. ` +
    `${below} sotto l'obiettivo, ${missing} ${missing === 1 ? 'mancante' : 'mancanti'}. ` +
    `Media 7 notti ${avg7}, media del mese ${avgM}, ${debtText(props.debtMin).toLowerCase()}.`
  );
}

function barClass(p: Provenienza): string | undefined {
  if (p === 'stimato') return 'is-estimated';
  if (p === 'automatico') return styles.auto;
  return undefined;
}

export function DurationChart(props: DurationChartProps) {
  const { nights } = props;
  const target = isNum(props.targetMin) ? props.targetMin : DEFAULT_TARGET_MIN;
  const targetPct = durationPct(target);
  const title = props.title ?? `Durata e debito, ultime ${nights.length} notti`;
  const avg7 = formatDuration(props.avg7Min);
  const avgM = formatDuration(props.avgMonthMin);

  return (
    <figure className={cx('card', styles.root)}>
      <figcaption className="eyebrow">{title}</figcaption>

      <div className={styles.chart} role="img" aria-label={describeDurationChart(props)}>
        <div className={styles.bars}>
          {nights.map((n, i) => {
            const missing = isMissingNight(n);
            const h = missing ? MISSING_BAR_PCT : (durationPct(n.durationMin) ?? 0);
            return (
              <div key={`${n.label}-${i}`} className={styles.col}>
                <div
                  className={missing ? styles.missingBar : cx('vbar', styles.bar, barClass(n.provenance))}
                  style={{ height: `${h}%` }}
                />
              </div>
            );
          })}
          {targetPct !== null && <div className={styles.target} style={{ bottom: `${targetPct}%` }} />}
        </div>
        <div className={styles.days}>
          {nights.map((n, i) => (
            <span key={`${n.label}-${i}`} className={styles.day}>
              {n.label}
            </span>
          ))}
        </div>
      </div>

      <div className="row">
        <span className={cx('badge', avg7 === null ? 'badge-missing' : 'badge-confirmed', styles.chip)}>
          Media 7 notti {avg7 ?? 'Mancante'}
        </span>
        <span className={cx('badge', avgM === null ? 'badge-missing' : 'badge-confirmed', styles.chip)}>
          Media del mese {avgM ?? 'Mancante'}
        </span>
        <span className={cx('badge', isNum(props.debtMin) ? 'badge-estimated' : 'badge-missing', styles.chip)}>
          {debtText(props.debtMin)}
        </span>
        <span className={cx('badge', 'badge-ok', styles.chip)}>Obiettivo {formatDuration(target)}</span>
      </div>

      <p className={styles.legend}>
        Linea tratteggiata = obiettivo {formatDuration(target)} · pieno = confermata · contorno = automatica ·
        tratteggiato = stimata · punti = mancante
      </p>

      {/* Il wrapper (non la tabella) è nascosto: una <table> con white-space nowrap sborda lo stesso e allarga la pagina. */}
      <div className={styles.srOnly}>
        <table>
          <caption>{title}: durata per notte</caption>
          <thead>
            <tr>
              <th scope="col">Notte</th>
              <th scope="col">Durata</th>
              <th scope="col">Provenienza</th>
            </tr>
          </thead>
          <tbody>
            {nights.map((n, i) => {
              const missing = isMissingNight(n);
              return (
                <tr key={`${n.label}-${i}`}>
                  <th scope="row">{n.fullLabel ?? n.label}</th>
                  <td>{missing ? 'Mancante' : formatDuration(n.durationMin)}</td>
                  <td>{missing ? 'Mancante' : PROVENIENZA_NOTTE[n.provenance]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export default DurationChart;
