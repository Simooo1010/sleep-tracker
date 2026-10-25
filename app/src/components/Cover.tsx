import styles from './Cover.module.css';

/**
 * Cover: copertina del marchio (docs/design/system/components/Cover/preview.html).
 * Quattro blocchi nei colori di accento su due colonne sfalsate, cinque fasi lunari ritagliate nel blu
 * e il nome "Sleep Tracker" in `font-display` peso 300. Vettoriale, scala con la larghezza.
 */

export interface CoverProps {
  /** Frase sotto il nome. */
  tagline?: string;
  headingLevel?: 1 | 2;
}

/** Fasi lunari 1-5 (nuova, crescente, mezza, gibbosa, piena), come la scala di voto. */
const MOON_PHASES = [
  '',
  'M12 2A10 10 0 0 1 12 22A5 10 0 0 0 12 2Z',
  'M12 2A10 10 0 0 1 12 22Z',
  'M12 2A10 10 0 0 1 12 22A5 10 0 0 1 12 2Z',
  'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20',
] as const;

export function Cover({ tagline = 'Stima da sola. Chiede solo una conferma.', headingLevel = 1 }: CoverProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={styles.cover}>
      <svg
        className={styles.art}
        viewBox="0 0 960 340"
        preserveAspectRatio="xMaxYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <rect className={`${styles.block} ${styles.blue}`} x="496" y="24" width="232" height="180" rx="28" />
        <rect className={`${styles.block} ${styles.peach}`} x="744" y="24" width="192" height="112" rx="28" />
        <rect className={`${styles.block} ${styles.sage}`} x="744" y="152" width="192" height="164" rx="28" />
        <rect className={`${styles.block} ${styles.yellow}`} x="496" y="220" width="232" height="96" rx="28" />
        {MOON_PHASES.map((d, i) => (
          <g key={i} transform={`translate(${514 + i * 42} 128) scale(1.5)`}>
            <circle className={styles.moonOut} cx="12" cy="12" r="10" />
            {d && <path className={styles.moonLit} d={d} />}
          </g>
        ))}
      </svg>
      <div className={styles.name}>
        <Heading className={styles.title}>
          Sleep
          <br />
          Tracker
        </Heading>
        {tagline && <p className={styles.tagline}>{tagline}</p>}
      </div>
    </div>
  );
}

export default Cover;
