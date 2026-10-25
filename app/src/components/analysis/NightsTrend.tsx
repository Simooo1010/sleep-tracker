import type { CSSProperties } from 'react';

import type { NightPoint, NightsTrendProps } from '../../server/views/analysis-types';
import { Coverage } from '../Coverage';
import { cx, formatDuration, isNum } from '../chartGeometry';
import styles from './NightsTrend.module.css';

/**
 * NightsTrend: durata delle notti del periodo (7, 14 o 30 barre) con la linea dell'obiettivo.
 * Stato sempre per forma: pieno = confermata, tratteggiato = stimata, punteggiato = mancante,
 * contorno + ▲ = fuori orario, ● = eccezione. Il grafico è decorativo per i lettori di schermo:
 * l'equivalente è l'elenco nascosto con il `summary` di ogni notte.
 */

/** Altezza minima della scala (9h): coerente con DurationChart. */
export const TREND_SCALE_MIN = 540;
/** Altezza della barra di una notte mancante. */
export const TREND_MISSING_PCT = 8;
/** Stagger tra una barra e la successiva (ms) e tetto del ritardo complessivo (ms). */
export const TREND_STAGGER_MS = 30;
export const TREND_MAX_DELAY_MS = 300;

/** Scala del grafico in minuti: almeno 9h, abbastanza da far stare la barra più lunga e l'obiettivo con margine. */
export function trendScale(points: readonly NightPoint[], targetMin: number): number {
  const longest = points.reduce((m, p) => (isNum(p.durationMin) ? Math.max(m, p.durationMin) : m), 0);
  const top = Math.max(TREND_SCALE_MIN, longest, isNum(targetMin) ? targetMin : 0) * 1.08;
  return Math.ceil(top / 30) * 30;
}

/** Percentuale 0–100 (2 decimali) di una durata sulla scala. */
export function trendPct(min: number, scale: number): number {
  if (!isNum(min) || !isNum(scale) || scale <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (min / scale) * 100)) * 100) / 100;
}

/** Ogni quante barre scrivere l'etichetta: leggibile a 320 px anche con 30 notti. */
export function labelStep(n: number): number {
  if (n <= 7) return 1;
  if (n <= 14) return 2;
  return 7;
}

/** Ritardo d'entrata della barra i su n: ≤ 30 ms di stagger, totale ≤ 300 ms (+ 300 ms di crescita). */
export function barDelayMs(i: number, n: number): number {
  if (n <= 1) return 0;
  const step = Math.min(TREND_STAGGER_MS, TREND_MAX_DELAY_MS / (n - 1));
  return Math.round(i * step);
}

function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  const t = s.trim();
  return /NaN|undefined|Infinity/.test(t) ? '' : t;
}

function isMissing(p: NightPoint): boolean {
  return p.status === 'mancante' || !isNum(p.durationMin);
}

function Hidden({ nights }: NightsTrendProps) {
  return (
    <section className={cx('card', styles.root)} data-state="nascosto">
      <p className={styles.hiddenText}>{clean(nights.hiddenText) || 'Dati insufficienti.'}</p>
      <Coverage used={nights.coverage.used} total={nights.coverage.window} marks={nights.coverage.marks} />
    </section>
  );
}

export function NightsTrend({ nights }: NightsTrendProps) {
  const points = Array.isArray(nights.points) ? nights.points : [];
  if (nights.hidden || points.length === 0) return <Hidden nights={nights} />;

  const n = points.length;
  const scale = trendScale(points, nights.targetMin);
  const targetOk = isNum(nights.targetMin) && nights.targetMin > 0;
  const targetPct = targetOk ? trendPct(nights.targetMin, scale) : null;
  const targetText = targetOk ? formatDuration(nights.targetMin) : null;
  const step = labelStep(n);
  const hasOutlier = points.some((p) => p.outlier && !isMissing(p));
  const hasException = points.some((p) => p.exception);
  const caption = clean(nights.caption);
  const avgLabel = clean(nights.avgLabel);

  return (
    <figure className={cx('card', styles.root)} data-state="visibile" data-density={n > 14 ? 'alta' : 'normale'}>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}

      <div className={styles.chart} aria-hidden="true">
        <div className={styles.bars}>
          {points.map((p, i) => {
            const missing = isMissing(p);
            const h = missing ? TREND_MISSING_PCT : trendPct(p.durationMin as number, scale);
            const style = { '--h': `${h}%`, '--delay': `${barDelayMs(i, n)}ms` } as CSSProperties;
            const outlier = p.outlier && !missing;
            return (
              <div
                key={`${p.nightDate}-${i}`}
                className={styles.col}
                style={style}
                data-status={p.status}
                data-outlier={outlier ? 'si' : undefined}
              >
                <div
                  className={cx(
                    styles.bar,
                    missing ? styles.missing : cx('vbar', p.status === 'stimata' && 'is-estimated'),
                    outlier && styles.outlier,
                  )}
                />
                {outlier ? <span className={styles.marker}>▲</span> : null}
              </div>
            );
          })}
          {targetPct !== null ? <div className={styles.target} style={{ bottom: `${targetPct}%` }} /> : null}
        </div>

        {hasException ? (
          <div className={styles.marks}>
            {points.map((p, i) => (
              <span key={`${p.nightDate}-${i}`} className={styles.markCell}>
                {p.exception ? <span className={styles.dot} /> : null}
              </span>
            ))}
          </div>
        ) : null}

        <div className={styles.days}>
          {points.map((p, i) => {
            const show = (n - 1 - i) % step === 0;
            const pos = i === n - 1 ? styles.end : i === 0 ? styles.start : styles.mid;
            return (
              <span key={`${p.nightDate}-${i}`} className={styles.day}>
                {show ? <span className={cx(styles.dayText, pos)}>{clean(p.label)}</span> : null}
              </span>
            );
          })}
        </div>
      </div>

      <ul className={styles.legend} aria-hidden="true">
        {targetText ? (
          <li>
            <span className={cx(styles.key, styles.keyTarget)} />
            Obiettivo {targetText}
          </li>
        ) : null}
        <li>
          <span className={cx(styles.key, styles.keyBar, 'vbar')} />
          Confermata
        </li>
        <li>
          <span className={cx(styles.key, styles.keyBar, 'vbar', 'is-estimated')} />
          Stimata
        </li>
        <li>
          <span className={cx(styles.key, styles.keyBar, styles.missing)} />
          Mancante
        </li>
        {hasOutlier ? (
          <li>
            <span className={styles.keyMarker}>▲</span>
            Fuori orario (±30 min)
          </li>
        ) : null}
        {hasException ? (
          <li>
            <span className={cx(styles.dot, styles.keyDot)} />
            Eccezione
          </li>
        ) : null}
      </ul>

      <ul className={styles.srOnly}>
        {points.map((p, i) => (
          <li key={`${p.nightDate}-${i}`}>{clean(p.summary) || clean(p.label)}</li>
        ))}
      </ul>

      <div className={styles.foot}>
        {avgLabel ? <p className={styles.avg}>{avgLabel}</p> : null}
        <Coverage used={nights.coverage.used} total={nights.coverage.window} marks={nights.coverage.marks} />
      </div>
    </figure>
  );
}

export default NightsTrend;
