import { useId } from 'react';

import { Coverage, type CoverageMark } from './Coverage';
import styles from './InsightCard.module.css';

/**
 * InsightCard: osservazione breve con origine dichiarata (AI o Regole) e momento dell'aggiornamento.
 * Spec: docs/design/system/components/InsightCard/README.md. Classi: `.card`, `.badge-ai`, `.badge-rules`.
 * Sotto soglia l'insight non compare: "Dati insufficienti" e quante notti mancano.
 */

export type InsightOrigin = 'ai' | 'regole';

export interface InsightCoverage {
  used: number;
  total: number;
  estimated?: number;
  marks?: readonly CoverageMark[];
}

export interface InsightCardProps {
  /** Una frase, senza verbi causali ("Il tuo orario sta scivolando"). */
  title: string;
  /** Una o due frasi con i numeri reali. */
  body: string;
  /** `ai` = generato dal modello, `regole` = calcolato dalle statistiche. */
  origin: InsightOrigin;
  /** Quando è stato aggiornato: "Stamattina", "Ogni lunedì", "Aggiornato ieri". */
  updatedLabel: string;
  /** Istante ISO dell'aggiornamento, per `<time dateTime>`. */
  updatedAt?: string;
  /** Copertura dei dati, mostrata dentro la scheda. */
  coverage?: InsightCoverage;
  /** Soglia minima di notti: sotto soglia l'insight resta nascosto. Richiede `coverage`. */
  minNights?: number;
  /** Livello del titolo. Default 3. */
  headingLevel?: 2 | 3 | 4;
}

const ORIGIN: Record<InsightOrigin, { cls: string; word: string }> = {
  ai: { cls: 'badge-ai', word: 'AI' },
  regole: { cls: 'badge-rules', word: 'Regole' },
};

function usable(s: string | undefined): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t === '' || /NaN|undefined|Infinity/.test(t) ? null : t;
}

function usedOf(c: InsightCoverage): number {
  if (c.marks && c.marks.length > 0) return c.marks.filter((m) => m !== 'mancante').length;
  return typeof c.used === 'number' && Number.isFinite(c.used) ? Math.max(0, Math.round(c.used)) : 0;
}

export function InsightCard({
  title,
  body,
  origin,
  updatedLabel,
  updatedAt,
  coverage,
  minNights,
  headingLevel = 3,
}: InsightCardProps) {
  const titleId = useId();
  const below =
    coverage !== undefined &&
    typeof minNights === 'number' &&
    Number.isFinite(minNights) &&
    minNights > 0 &&
    usedOf(coverage) < minNights;
  const t = usable(title);
  const b = usable(body);
  const insufficient = below || t === null || b === null;
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const badge = ORIGIN[origin];
  const when = usable(updatedLabel);

  return (
    <article
      className={`card stack ${styles.root}`}
      aria-labelledby={titleId}
      data-origin={origin}
      data-state={insufficient ? 'insufficiente' : 'visibile'}
    >
      <div className="row">
        <span className={`badge ${badge.cls}`}>{badge.word}</span>
        {when ? (
          updatedAt ? (
            <time className="caption muted" dateTime={updatedAt}>
              {when}
            </time>
          ) : (
            <span className="caption muted">{when}</span>
          )
        ) : null}
      </div>
      <Heading id={titleId} className={`serif title ${styles.title}`}>
        {insufficient ? 'Dati insufficienti' : t}
      </Heading>
      {insufficient ? null : <p className={`body-sm muted ${styles.body}`}>{b}</p>}
      {coverage ? (
        <Coverage
          used={coverage.used}
          total={coverage.total}
          estimated={coverage.estimated}
          marks={coverage.marks}
          minNights={minNights}
        />
      ) : null}
    </article>
  );
}
