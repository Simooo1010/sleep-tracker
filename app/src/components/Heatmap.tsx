import styles from './Heatmap.module.css';

/**
 * Heatmap: durata del sonno per giorno della settimana nelle ultime settimane.
 * Spec: docs/design/system/components/Heatmap/README.md. Classi: `.card`, `.eyebrow`, `.cell*` di bundle.css.
 * Ogni cella scrive sempre la durata (`7h 32m`) o `—`: il colore non è mai l'unica informazione.
 * Stimata = bordo tratteggiato, mancante = bordo punteggiato; lo stato è anche nel testo per i lettori di schermo.
 */

export type HeatmapStatus = 'confermata' | 'stimata' | 'mancante';

export interface HeatmapCell {
  /** Durata in minuti; null se la notte non ha durata. */
  minutes: number | null;
  status: HeatmapStatus;
}

export interface HeatmapProps {
  /**
   * Sette righe, da lunedì a domenica. Ogni riga elenca le durate dalla settimana più vecchia alla più recente
   * (di solito 4). Righe più corte vengono completate con notti mancanti.
   */
  days: readonly (readonly HeatmapCell[])[];
  /** Nomi delle colonne per i lettori di schermo. Default "Settimana 1" … "Settimana N". */
  weekLabels?: readonly string[];
  /** Titolo. Default "Durata per giorno della settimana". */
  title?: string;
  className?: string;
}

export type DurationBand = 'sage' | 'blue' | 'peach';

/** Fascia di colore: 8h o più salvia, 7h–8h azzurro, meno di 7h pesca. Minuti arrotondati come nel testo. */
export function durationBand(minutes: number): DurationBand {
  const m = Math.round(minutes);
  if (m >= 480) return 'sage';
  if (m >= 420) return 'blue';
  return 'peach';
}

/** Durata compatta "7h 32m" (minuti a due cifre). Valori non validi o negativi: "—". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '—';
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const BAND_CLASS: Record<DurationBand, string> = { sage: 'cell-8', blue: 'cell-7', peach: 'cell-6' };

const WEEKDAYS: readonly { short: string; full: string }[] = [
  { short: 'Lun', full: 'lunedì' },
  { short: 'Mar', full: 'martedì' },
  { short: 'Mer', full: 'mercoledì' },
  { short: 'Gio', full: 'giovedì' },
  { short: 'Ven', full: 'venerdì' },
  { short: 'Sab', full: 'sabato' },
  { short: 'Dom', full: 'domenica' },
];

/** Una cella ha una durata da mostrare solo se non è mancante e ha minuti validi. */
function hasDuration(cell: HeatmapCell): cell is HeatmapCell & { minutes: number } {
  return cell.status !== 'mancante' && cell.minutes !== null && Number.isFinite(cell.minutes) && cell.minutes >= 0;
}

/** Classi di bundle.css per una cella. */
export function heatmapCellClass(cell: HeatmapCell): string {
  if (!hasDuration(cell)) return cell.status === 'stimata' ? 'cell cell-miss cell-est' : 'cell cell-miss';
  const base = `cell ${BAND_CLASS[durationBand(cell.minutes)]}`;
  return cell.status === 'stimata' ? `${base} cell-est` : base;
}

const MISSING: HeatmapCell = { minutes: null, status: 'mancante' };

export function Heatmap({ days, weekLabels, title = 'Durata per giorno della settimana', className }: HeatmapProps) {
  const columns = Math.max(0, ...days.map((r) => r.length));
  const labels = Array.from({ length: columns }, (_, i) => weekLabels?.[i] ?? `Settimana ${i + 1}`);
  const rootClass = ['card', 'stack', styles.root, className].filter(Boolean).join(' ');

  return (
    <section className={rootClass}>
      <h3 className={`eyebrow ${styles.title}`}>{title}</h3>
      <table className={styles.table}>
        <caption className={styles.srOnly}>
          {`${title}: ultime ${columns} settimane, dalla più vecchia alla più recente.`}
        </caption>
        <thead className={styles.srOnly}>
          <tr>
            <th scope="col">Giorno</th>
            {labels.map((l, i) => (
              <th key={i} scope="col">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((w, r) => (
            <tr key={w.short}>
              <th scope="row" className={styles.day}>
                <span aria-hidden="true">{w.short}</span>
                <span className={styles.srOnly}>{w.full}</span>
              </th>
              {Array.from({ length: columns }, (_, c) => {
                const cell = days[r]?.[c] ?? MISSING;
                const shown = hasDuration(cell);
                return (
                  <td key={c} className={styles.td}>
                    <div className={`${heatmapCellClass(cell)} ${styles.cell}`}>
                      {shown ? formatDuration(cell.minutes) : '—'}
                      {cell.status !== 'confermata' || !shown ? (
                        <span className={styles.srOnly}>{`, ${shown ? cell.status : 'mancante'}`}</span>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`caption muted ${styles.note}`}>
        {`Ultime ${columns} settimane, dalla più vecchia.`}
      </p>
      <ul className={`caption muted ${styles.legend}`} aria-label="Legenda">
        <li>
          <span className={`cell cell-8 ${styles.swatch}`} aria-hidden="true" />8h o più
        </li>
        <li>
          <span className={`cell cell-7 ${styles.swatch}`} aria-hidden="true" />7h–8h
        </li>
        <li>
          <span className={`cell cell-6 ${styles.swatch}`} aria-hidden="true" />Meno di 7h
        </li>
        <li>
          <span className={`cell cell-7 cell-est ${styles.swatch}`} aria-hidden="true" />Tratteggio = stimata
        </li>
        <li>
          <span className={`cell cell-miss ${styles.swatch}`} aria-hidden="true" />Punti = mancante
        </li>
      </ul>
    </section>
  );
}
