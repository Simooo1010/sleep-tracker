import styles from './CorrelationTable.module.css';

/**
 * CorrelationTable: per ogni fattore, differenza media di voto (1–5) su qualità, energia e umore
 * nelle notti con il fattore rispetto alle altre.
 * Spec: docs/design/system/components/CorrelationTable/README.md, Dati-e-calcoli.md §Correlazioni.
 * Classi: `.card`, `.eyebrow`, `.corr` (`.c`, `.pos`, `.neg`, `.neu`, `.few`) di bundle.css.
 * Segno e numero sono sempre scritti; il colore li accompagna soltanto. Sono indizi, mai cause.
 */

export interface CorrelationRow {
  /** Nome del fattore, già in italiano (es. "Schermo a letto"). */
  factor: string;
  /** Notti in cui il fattore è presente. */
  occurrences: number;
  /** Differenza media di voto (con − senza); null se non calcolabile. */
  quality: number | null;
  energy: number | null;
  mood: number | null;
}

export interface CorrelationTableProps {
  rows: readonly CorrelationRow[];
  /** Notti con dati nel periodo. Sotto 14 la tabella non compare. */
  nights: number;
  /** Titolo. Default "Cosa si lega a qualità, energia e umore". */
  title?: string;
  className?: string;
}

export const MIN_NIGHTS = 14;
export const MIN_OCCURRENCES = 5;
/** Segno meno tipografico U+2212. */
export const MINUS = '−';

export type CorrelationTone = 'pos' | 'neg' | 'neu' | 'few';

/** Arrotondamento a un decimale, simmetrico rispetto allo zero, senza -0. Restituisce decimi interi. */
function tenths(x: number): number {
  const r = Math.sign(x) * Math.round(Math.abs(x) * 10 + 1e-9);
  return r === 0 ? 0 : r;
}

/** "+0,6", "−0,8" (U+2212), "0,0". Un decimale, virgola. */
export function formatDiff(diff: number): string {
  const t = tenths(diff);
  const abs = (Math.abs(t) / 10).toFixed(1).replace('.', ',');
  if (t > 0) return `+${abs}`;
  if (t < 0) return `${MINUS}${abs}`;
  return abs;
}

/** Tono della cella: ≥ +0,3 salvia, ≤ −0,3 pesca, altrimenti neutro; dato assente "few". Sul valore arrotondato. */
export function correlationTone(diff: number | null): CorrelationTone {
  if (diff === null || !Number.isFinite(diff)) return 'few';
  const t = tenths(diff);
  if (t >= 3) return 'pos';
  if (t <= -3) return 'neg';
  return 'neu';
}

/** Sottotitolo del fattore: "8 notti su 21" oppure "2 notti, ne servono 5". */
export function occurrencesLabel(occurrences: number, nights: number): string {
  const word = occurrences === 1 ? 'notte' : 'notti';
  if (occurrences < MIN_OCCURRENCES) return `${occurrences} ${word}, ne servono ${MIN_OCCURRENCES}`;
  return `${occurrences} ${word} su ${nights}`;
}

const OUTCOMES = [
  { key: 'quality', label: 'Qualità' },
  { key: 'energy', label: 'Energia' },
  { key: 'mood', label: 'Umore' },
] as const;

export function CorrelationTable({
  rows,
  nights,
  title = 'Cosa si lega a qualità, energia e umore',
  className,
}: CorrelationTableProps) {
  const rootClass = ['card', 'stack', styles.root, className].filter(Boolean).join(' ');

  if (nights < MIN_NIGHTS) {
    return (
      <section className={rootClass} data-state="sotto-soglia">
        <h3 className={`eyebrow ${styles.title}`}>{title}</h3>
        <p className={`body-sm muted ${styles.text}`}>
          {`Servono almeno ${MIN_NIGHTS} notti. Per ora ne hai ${nights}.`}
        </p>
      </section>
    );
  }

  return (
    <section className={rootClass} data-state="calcolata">
      <h3 className={`eyebrow ${styles.title}`}>{title}</h3>
      <div className={styles.scroll} role="region" aria-label={title} tabIndex={0}>
        <div role="table" aria-label={title} className={`stack ${styles.table}`}>
          <div role="row" className={`corr ${styles.head}`}>
            <span role="columnheader" className={`eyebrow ${styles.factor}`}>
              Fattore
            </span>
            {OUTCOMES.map((o) => (
              <span key={o.key} role="columnheader" className={`eyebrow ${styles.col}`}>
                {o.label}
              </span>
            ))}
          </div>
          {rows.map((r) => {
            const few = r.occurrences < MIN_OCCURRENCES;
            return (
              <div key={r.factor} role="row" className="corr">
                <div role="rowheader" className={styles.factor}>
                  <div className="body-sm">{r.factor}</div>
                  <div className={styles.sub}>{occurrencesLabel(r.occurrences, nights)}</div>
                </div>
                {OUTCOMES.map((o) => {
                  const value = few ? null : r[o.key];
                  const tone = correlationTone(value);
                  return (
                    <div key={o.key} role="cell" className={`c ${tone}`}>
                      {tone === 'few' || value === null ? (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className={styles.srOnly}>{few ? 'ne servono 5' : 'non disponibile'}</span>
                        </>
                      ) : (
                        formatDiff(value)
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className={`caption muted ${styles.text}`}>
        Differenza media di voto (1–5) nelle notti con il fattore rispetto alle altre. Sono indizi, non cause.
        Servono almeno 14 notti e 5 occorrenze.
      </p>
    </section>
  );
}
