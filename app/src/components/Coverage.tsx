import styles from './Coverage.module.css';

/**
 * Coverage: su quante notti è calcolata una statistica e com'è composta.
 * Spec: docs/design/system/components/Coverage/README.md. Classi: `.coverage` di bundle.css.
 * I segni hanno forma diversa (pieno, tratteggiato, punteggiato): il significato non dipende dal colore.
 */

/** Un segno per notte: confermata o automatica (pieno), stimata (tratteggiato), mancante (punteggiato). */
export type CoverageMark = 'confermata' | 'stimata' | 'mancante';

export interface CoverageProps {
  /** Notti con un dato (confermate o automatiche più stimate). */
  used: number;
  /** Notti della finestra (es. 14). */
  total: number;
  /** Di cui stimate. Default 0. */
  estimated?: number;
  /** Ordine reale dei segni (dal più vecchio). Se presente, i conteggi si ricavano da qui. */
  marks?: readonly CoverageMark[];
  /** Soglia minima di notti: sotto soglia mostra "Servono almeno N notti. Per ora ne hai M." */
  minNights?: number;
  /** Testo prima dei numeri. Default "Calcolata su". */
  prefix?: string;
  className?: string;
}

/** Intero non negativo; NaN, Infinity e valori non numerici diventano 0. */
export function safeCount(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** "notte" o "notti". */
export function nottiWord(n: number): string {
  return n === 1 ? 'notte' : 'notti';
}

/** Frase di soglia non raggiunta, con i numeri. */
export function thresholdSentence(min: number, have: number): string {
  const m = safeCount(min);
  return `Servono almeno ${m} ${nottiWord(m)}. Per ora ne hai ${safeCount(have)}.`;
}

interface Counts {
  total: number;
  used: number;
  estimated: number;
  confirmed: number;
  missing: number;
  marks: CoverageMark[];
}

function resolveCounts({ used, total, estimated, marks }: CoverageProps): Counts {
  if (marks && marks.length > 0) {
    const list = [...marks];
    const est = list.filter((m) => m === 'stimata').length;
    const miss = list.filter((m) => m === 'mancante').length;
    return {
      total: list.length,
      used: list.length - miss,
      estimated: est,
      confirmed: list.length - miss - est,
      missing: miss,
      marks: list,
    };
  }
  const t = safeCount(total);
  const u = Math.min(safeCount(used), t);
  const e = Math.min(safeCount(estimated), u);
  const c = u - e;
  const m = t - u;
  const list: CoverageMark[] = [
    ...Array.from({ length: c }, (): CoverageMark => 'confermata'),
    ...Array.from({ length: e }, (): CoverageMark => 'stimata'),
    ...Array.from({ length: m }, (): CoverageMark => 'mancante'),
  ];
  return { total: t, used: u, estimated: e, confirmed: c, missing: m, marks: list };
}

function compositionLabel({ confirmed, estimated, missing }: Counts): string {
  const parts = [
    `${confirmed} ${confirmed === 1 ? 'confermata o automatica' : 'confermate o automatiche'}`,
    `${estimated} ${estimated === 1 ? 'stimata' : 'stimate'}`,
    `${missing} ${missing === 1 ? 'mancante' : 'mancanti'}`,
  ];
  return `Notti: ${parts.join(', ')}`;
}

const MARK_CLASS: Record<CoverageMark, string | undefined> = {
  confermata: undefined,
  stimata: 'est',
  mancante: 'miss',
};

export function Coverage(props: CoverageProps) {
  const counts = resolveCounts(props);
  const min = props.minNights === undefined ? 0 : safeCount(props.minNights);
  const below = min > 0 && counts.used < min;
  const prefix = props.prefix ?? 'Calcolata su';
  const rootClass = ['coverage', styles.wrap, props.className].filter(Boolean).join(' ');

  return (
    <div className={rootClass} data-state={below ? 'sotto-soglia' : 'calcolata'}>
      <span className={`dots ${styles.dots}`} role="img" aria-label={compositionLabel(counts)}>
        {counts.marks.map((m, i) => (
          <i key={i} className={MARK_CLASS[m]} />
        ))}
      </span>
      {below ? (
        <span className={styles.text}>
          {`Servono almeno ${min} ${nottiWord(min)}. Per ora ne hai `}
          <strong>{counts.used}</strong>.
        </span>
      ) : (
        <span className={styles.text}>
          {`${prefix} `}
          <strong>{`${counts.used} su ${counts.total} ${nottiWord(counts.total)}`}</strong>
        </span>
      )}
    </div>
  );
}
