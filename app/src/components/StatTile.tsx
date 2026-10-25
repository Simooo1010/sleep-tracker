import type { Provenance } from '../domain/types';
import { Coverage, type CoverageMark } from './Coverage';
import styles from './StatTile.module.css';

/**
 * StatTile: tessera con etichetta, valore in serif, nota e copertura.
 * Spec: docs/design/system/components/StatTile/README.md. Classi: `.tile`, `.tile-*` di bundle.css.
 * Nessuna freccia o icona: la nota scrive il confronto.
 */

/** Accento per significato: blu durata/scarti, salvia regolarità, pesca debito/avvisi, giallo energia/sonnellini. */
export type StatTileTone = 'blue' | 'sage' | 'peach' | 'yellow';

export interface StatTileCoverage {
  used: number;
  total: number;
  estimated?: number;
  marks?: readonly CoverageMark[];
}

export interface StatTileProps {
  /** Etichetta, mostrata in maiuscolo (es. "Durata media"). */
  label: string;
  /** Valore già formattato (`7h 18m`, `± 24 min`). null = mancante. */
  value: string | null;
  /** Nota di una riga ("14 notti", "12 min sopra la media del mese"). */
  note?: string;
  tone: StatTileTone;
  /** Provenienza del valore: se indicata è scritta come parola (badge). */
  provenance?: Provenance;
  /** Copertura della statistica ("Calcolata su 9 su 14 notti"). */
  coverage?: StatTileCoverage;
  /** Soglia minima di notti: sotto soglia il valore resta nascosto. Richiede `coverage`. */
  minNights?: number;
}

const PROVENANCE_BADGE: Record<Provenance, { cls: string; word: string }> = {
  automatico: { cls: 'badge-auto', word: 'Automatico' },
  confermato: { cls: 'badge-confirmed', word: 'Confermato' },
  stimato: { cls: 'badge-estimated', word: 'Stimato' },
  mancante: { cls: 'badge-missing', word: 'Mancante' },
};

/** Un valore è utilizzabile solo se è una stringa non vuota senza NaN/undefined. */
function usableValue(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '' || /NaN|undefined|Infinity/.test(t)) return null;
  return t;
}

function usedOf(c: StatTileCoverage): number {
  if (c.marks && c.marks.length > 0) return c.marks.filter((m) => m !== 'mancante').length;
  return typeof c.used === 'number' && Number.isFinite(c.used) ? Math.max(0, Math.round(c.used)) : 0;
}

export function StatTile({ label, value, note, tone, provenance, coverage, minNights }: StatTileProps) {
  const hidden =
    coverage !== undefined &&
    typeof minNights === 'number' &&
    Number.isFinite(minNights) &&
    minNights > 0 &&
    usedOf(coverage) < minNights;
  const v = usableValue(value);
  const missing = !hidden && (v === null || provenance === 'mancante');
  const effective: Provenance | undefined = missing ? 'mancante' : provenance;
  const badge = !hidden && effective !== undefined && effective !== 'mancante' ? PROVENANCE_BADGE[effective] : null;
  const state = hidden ? 'sotto-soglia' : missing ? 'mancante' : (effective ?? 'calcolata');
  const cleanNote = usableValue(note ?? null);

  return (
    <div className={`tile tile-${tone}`} role="group" aria-label={label} data-state={state}>
      <div className={styles.head}>
        <div className="k">{label}</div>
        {badge ? <span className={`badge ${badge.cls}`}>{badge.word}</span> : null}
      </div>
      {hidden ? null : missing ? (
        <div className={styles.slot}>
          <span className="badge badge-missing">Mancante</span>
        </div>
      ) : (
        <div className="v">{v}</div>
      )}
      {cleanNote && !hidden ? <div className="n">{cleanNote}</div> : null}
      {coverage ? (
        <div className={styles.coverage}>
          <Coverage
            used={coverage.used}
            total={coverage.total}
            estimated={coverage.estimated}
            marks={coverage.marks}
            minNights={minNights}
          />
        </div>
      ) : null}
    </div>
  );
}
