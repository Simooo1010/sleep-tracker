import type { Provenance } from '../domain/types';
import styles from './Cover.module.css';
import {
  HORIZON_Y,
  VIEW_H,
  VIEW_W,
  arcPath,
  clampWindow,
  formatAxisClock,
  pointOnArc,
  splitDuration,
  trackPath,
  wakeToAxis,
} from './coverGeometry';

/**
 * Cover: the "Orizzonte" arc scene (spec: Notion "Sleep Tracker — Orizzonte design spec", section 3).
 * The night is an arc over a horizon: bedtime on the left, wake time on the right. One line of ink is
 * the horizon; above it only the data picture, below it only words. Provenance is always a word plus a
 * line style: automatico = solid, confermato = filled, stimato = dashed, mancante = dotted.
 */

export type CoverState = 'ready' | 'loading' | 'empty';

export interface CoverTime {
  /** bed: minutes from 18:00 of the evening; wake: minutes from local midnight. */
  minutes: number;
  provenance: Provenance;
}

export interface CoverProps {
  /** `ready` draws the night; `loading` and `empty` show the bare track only. */
  state?: CoverState;
  bed?: CoverTime | null;
  wake?: CoverTime | null;
  /** Sentence under the duration, already formatted ("8 min sotto la tua mediana di 14 giorni"). */
  deltaText?: string | null;
  /** Sentence shown in the centre when there is no night. */
  emptyText?: string;
  /** Plays the draw-in motion once. Reduced motion always shows the final position. */
  animate?: boolean;
  className?: string;
}

/** Length of the dashed (estimated) first segment of the arc. */
const ESTIMATED_SEGMENT_MIN = 90;

const PROVENANCE_WORD: Record<Provenance, string> = {
  automatico: 'Automatico',
  confermato: 'Confermato',
  stimato: 'Stimato',
  mancante: 'Mancante',
};

const STARS: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: 92, y: 74, r: 1.6 },
  { x: 148, y: 46, r: 1.2 },
  { x: 214, y: 62, r: 1.8 },
  { x: 262, y: 104, r: 1.3 },
];

function endpointClass(provenance: Provenance): string {
  if (provenance === 'stimato') return styles.dashed ?? '';
  if (provenance === 'mancante') return styles.dotted ?? '';
  if (provenance === 'automatico') return styles.solid ?? '';
  return styles.filled ?? '';
}

export function Cover({
  state = 'ready',
  bed,
  wake,
  deltaText,
  emptyText = 'Ancora nessuna notte',
  animate = true,
  className,
}: CoverProps) {
  const bedMin = bed ? clampWindow(bed.minutes) : null;
  const wakeMin = wake ? clampWindow(wakeToAxis(wake.minutes)) : null;
  const drawn = state === 'ready' && bedMin !== null && wakeMin !== null && wakeMin > bedMin;
  const bedPoint = drawn ? pointOnArc(bedMin) : null;
  const wakePoint = drawn ? pointOnArc(wakeMin) : null;

  const duration = drawn ? splitDuration(wakeMin - bedMin) : null;
  const bedClock = drawn ? formatAxisClock(bedMin) : null;
  const wakeClock = drawn ? formatAxisClock(wakeMin) : null;

  const estimatedBed = drawn && bed?.provenance === 'stimato';
  const split = estimatedBed ? Math.min(wakeMin, bedMin + ESTIMATED_SEGMENT_MIN) : bedMin;
  const solidPath = drawn ? arcPath(split ?? 0, wakeMin) : '';
  const dashedPath = estimatedBed ? arcPath(bedMin, split ?? bedMin) : '';
  const travelPath = drawn ? arcPath(bedMin, wakeMin) : '';

  const label = drawn
    ? `Arco del sonno: a letto alle ${bedClock}, sveglia alle ${wakeClock}, ${duration!.hours} ore e ${duration!.minutes} minuti.`
    : state === 'loading'
      ? 'Caricamento della notte.'
      : 'Nessuna notte registrata: solo la linea dell’orizzonte.';

  const root = [styles.cover, animate ? styles.animate : '', className].filter(Boolean).join(' ');

  return (
    <figure className={root} data-state={state}>
      <svg
        className={styles.scene}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={label}
        focusable="false"
      >
        {STARS.map((s, i) => (
          <circle key={i} className={styles.star} style={{ animationDelay: `${i * 0.7}s` }} cx={s.x} cy={s.y} r={s.r} />
        ))}
        {drawn && (
          <path
            className={styles.glow}
            d={`M${VIEW_W - 80} ${HORIZON_Y}A50 40 0 0 1 ${VIEW_W + 20} ${HORIZON_Y}Z`}
          />
        )}
        <path className={styles.track} d={trackPath()} />
        {drawn && (
          <>
            {dashedPath && <path className={styles.arcDashed} d={dashedPath} />}
            <path className={styles.arc} d={solidPath} pathLength={1} />
            {bedPoint && (
              <circle className={`${styles.bedPoint} ${endpointClass(bed!.provenance)}`} cx={bedPoint.x} cy={bedPoint.y} r="7" />
            )}
            {wakePoint && (
              <circle className={`${styles.wakePoint} ${endpointClass(wake!.provenance)}`} cx={wakePoint.x} cy={wakePoint.y} r="7" />
            )}
            <g className={styles.moon} style={{ offsetPath: `path("${travelPath}")` }}>
              <circle className={styles.moonDisc} r="13" />
              <path className={styles.moonShade} d="M2 -12.4A13 13 0 0 1 2 12.4A9 13 0 0 0 2 -12.4Z" />
            </g>
          </>
        )}
        <line className={styles.horizon} x1="0" y1={HORIZON_Y} x2={VIEW_W} y2={HORIZON_Y} />
      </svg>

      <div className={styles.centre}>
        {drawn && duration ? (
          <>
            <p className={styles.duration}>
              {duration.hours}
              <span className={styles.unit}> h </span>
              {String(duration.minutes).padStart(2, '0')}
            </p>
            {deltaText && <p className={styles.delta}>{deltaText}</p>}
          </>
        ) : (
          <p className={styles.delta}>{state === 'loading' ? 'Carico la notte…' : emptyText}</p>
        )}
      </div>

      {drawn && bed && wake && (
        <div className={styles.ends}>
          <p className={styles.end}>
            <span className={styles.endTime}>{bedClock}</span> <span className={styles.endWord}>a letto</span>
            <span className={styles.prov}>{PROVENANCE_WORD[bed.provenance]}</span>
          </p>
          <p className={`${styles.end} ${styles.endRight}`}>
            <span className={styles.endWord}>sveglia</span> <span className={styles.endTime}>{wakeClock}</span>
            <span className={styles.prov}>{PROVENANCE_WORD[wake.provenance]}</span>
          </p>
        </div>
      )}
    </figure>
  );
}

export default Cover;
