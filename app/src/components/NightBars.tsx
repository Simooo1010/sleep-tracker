/**
 * NightBars: confronto tra notti, una barra oraria per notte sullo stesso asse 21:00 → 11:00,
 * con le fasce di tolleranza (mediana ± 30 min) di letto e sveglia e gli scarti OK/Fuori.
 * Spec: docs/design/system/components/NightBars/README.md.
 */
import {
  AXIS_TICKS,
  DEFAULT_TOLERANCE_MIN,
  PROVENIENZA_NOTTE,
  axisPct,
  bandSpan,
  bedToAxis,
  cx,
  formatBedClock,
  formatClock,
  formatSigned,
  isNum,
  nightSpan,
  wakeToAxis,
  type Provenienza,
} from './chartGeometry';
import styles from './NightBars.module.css';

export interface NightBarsNight {
  /** Etichetta breve della riga, es. 'M 21' oppure 'Oggi'. */
  label: string;
  /** Etichetta estesa per il riassunto accessibile, es. 'martedì 21 ottobre'. Default: label. */
  fullLabel?: string;
  /** Orario di letto in minuti dalle 18:00 locali (23:30 → 330). null = mancante. */
  bedMin: number | null;
  /** Orario di sveglia in minuti dalla mezzanotte locale (07:20 → 440). null = mancante. */
  wakeMin: number | null;
  provenance: Provenienza;
  /** Scarto del letto dalla mediana, minuti con segno. null = mancante. */
  bedDevMin: number | null;
  /** Scarto della sveglia dalla mediana, minuti con segno. null = mancante. */
  wakeDevMin: number | null;
  /** Notte regolare (letto e sveglia nella tolleranza). Se assente si ricava dagli scarti. */
  regular?: boolean | null;
}

export interface NightBarsProps {
  /** Notti dall'alto in basso (di solito l'ultima è 'Oggi'). */
  nights: NightBarsNight[];
  /** Mediana a 14 giorni dell'orario di letto, minuti dalle 18:00. null = non disponibile. */
  medianBedMin: number | null;
  /** Mediana a 14 giorni dell'orario di sveglia, minuti dalla mezzanotte. null = non disponibile. */
  medianWakeMin: number | null;
  /** Tolleranza in minuti (default 30). */
  toleranceMin?: number;
  /** Titolo del grafico (default 'Confronto tra notti'). */
  title?: string;
}

export type NightVerdict = 'ok' | 'fuori' | 'mancante';

/** OK / Fuori / Mancante: usa `regular` se dato, altrimenti gli scarti contro la tolleranza. */
export function nightVerdict(
  n: Pick<NightBarsNight, 'provenance' | 'bedDevMin' | 'wakeDevMin' | 'regular'>,
  toleranceMin: number = DEFAULT_TOLERANCE_MIN,
): NightVerdict {
  if (n.provenance === 'mancante') return 'mancante';
  if (n.regular === true) return 'ok';
  if (n.regular === false) return 'fuori';
  if (!isNum(n.bedDevMin) || !isNum(n.wakeDevMin)) return 'mancante';
  const tol = Math.abs(toleranceMin);
  return Math.abs(n.bedDevMin) <= tol && Math.abs(n.wakeDevMin) <= tol ? 'ok' : 'fuori';
}

/** Testo degli scarti 'letto / sveglia': '+8 / −4'; un dato assente diventa '—'. Entrambi assenti → null. */
export function formatDeviationPair(bedDevMin: number | null, wakeDevMin: number | null): string | null {
  const b = formatSigned(bedDevMin);
  const w = formatSigned(wakeDevMin);
  if (b === null && w === null) return null;
  return `${b ?? '—'} / ${w ?? '—'}`;
}

const VERDICT_WORD: Record<NightVerdict, string> = { ok: 'OK', fuori: 'Fuori', mancante: 'Mancante' };
const VERDICT_BADGE: Record<NightVerdict, string> = {
  ok: 'badge-ok',
  fuori: 'badge-out',
  mancante: 'badge-missing',
};

function devPhrase(what: 'letto' | 'sveglia', dev: number | null): string {
  const s = formatSigned(dev);
  return s === null ? `scarto ${what} mancante` : `scarto ${what} ${s} min`;
}

/** Frase accessibile per una notte. */
export function describeNight(n: NightBarsNight, toleranceMin: number = DEFAULT_TOLERANCE_MIN): string {
  const name = n.fullLabel ?? n.label;
  const verdict = VERDICT_WORD[nightVerdict(n, toleranceMin)];
  const span = n.provenance === 'mancante' ? null : nightSpan(n.bedMin, n.wakeMin);
  if (span === null) return `${name}: notte mancante.`;
  const bed = formatBedClock(n.bedMin);
  const wake = formatClock(n.wakeMin);
  return `${name}: ${bed} → ${wake}, ${PROVENIENZA_NOTTE[n.provenance].toLowerCase()}, ${devPhrase('letto', n.bedDevMin)}, ${devPhrase('sveglia', n.wakeDevMin)}, ${verdict}.`;
}

/** Riassunto accessibile dell'intero grafico. */
export function describeNightBars(props: NightBarsProps): string {
  const tol = props.toleranceMin ?? DEFAULT_TOLERANCE_MIN;
  const counts = { ok: 0, fuori: 0, mancante: 0 };
  for (const n of props.nights) counts[nightVerdict(n, tol)] += 1;
  const total = props.nights.length;
  const bed = formatBedClock(props.medianBedMin);
  const wake = formatClock(props.medianWakeMin);
  const ref =
    bed !== null && wake !== null
      ? `Mediana del letto ${bed}, della sveglia ${wake}, tolleranza ± ${tol} min.`
      : `Mediana ${bed !== null ? `del letto ${bed}` : 'del letto mancante'}, ${wake !== null ? `della sveglia ${wake}` : 'della sveglia mancante'}.`;
  const notti = total === 1 ? 'notte' : 'notti';
  return `${props.title ?? 'Confronto tra notti'}: ${total} ${notti} sull'asse 21:00 → 11:00. ${counts.ok} nella tolleranza, ${counts.fuori} fuori, ${counts.mancante} mancanti. ${ref}`;
}

const BAR_CLASS: Record<Provenienza, string | undefined> = {
  confermato: undefined,
  automatico: styles.auto,
  stimato: 'is-estimated',
  mancante: 'is-missing',
};

export function NightBars(props: NightBarsProps) {
  const { nights, medianBedMin, medianWakeMin } = props;
  const tol = props.toleranceMin ?? DEFAULT_TOLERANCE_MIN;
  const title = props.title ?? 'Confronto tra notti';
  const bedCenter = isNum(medianBedMin) ? bedToAxis(medianBedMin) : null;
  const wakeCenter = isNum(medianWakeMin) ? wakeToAxis(medianWakeMin) : null;
  const bedBand = bandSpan(bedCenter, tol);
  const wakeBand = bandSpan(wakeCenter, tol);
  const bedLine = bedCenter === null ? null : axisPct(bedCenter);
  const wakeLine = wakeCenter === null ? null : axisPct(wakeCenter);
  const rows = Math.max(1, nights.length);

  return (
    <figure className={cx('card', styles.root)}>
      <figcaption className="eyebrow">{title}</figcaption>

      <div className={styles.grid} role="img" aria-label={describeNightBars(props)}>
        <div className={styles.ticks} aria-hidden="true">
          {AXIS_TICKS.map((t) => (
            <span
              key={t.label}
              className={cx(styles.tick, t.axisMin === 0 && styles.tickStart)}
              style={{ left: `${axisPct(t.axisMin) ?? 0}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>

        <div className={styles.overlay} style={{ gridRow: `2 / span ${rows}` }} aria-hidden="true">
          {bedBand && bedBand.width > 0 && (
            <div className="band" style={{ left: `${bedBand.left}%`, width: `${bedBand.width}%` }} />
          )}
          {wakeBand && wakeBand.width > 0 && (
            <div className="band" style={{ left: `${wakeBand.left}%`, width: `${wakeBand.width}%` }} />
          )}
          {bedLine !== null && <div className="avg" style={{ left: `${bedLine}%` }} />}
          {wakeLine !== null && <div className="avg" style={{ left: `${wakeLine}%` }} />}
        </div>

        {nights.map((n, i) => {
          const verdict = nightVerdict(n, tol);
          const span = n.provenance === 'mancante' ? null : nightSpan(n.bedMin, n.wakeMin);
          const missing = span === null;
          const devs = missing ? null : formatDeviationPair(n.bedDevMin, n.wakeDevMin);
          const row = { gridRow: i + 2 };
          return (
            <div key={`${n.label}-${i}`} className={styles.row} style={row}>
              <span className={styles.label}>{n.label}</span>
              <div className={cx('track', styles.track)}>
                <div
                  className={cx('hbar', missing ? 'is-missing' : BAR_CLASS[n.provenance])}
                  style={missing ? undefined : { left: `${span.left}%`, width: `${span.width}%` }}
                />
              </div>
              <span className={styles.devs}>
                {devs !== null && <span className="muted">{devs}</span>}
                <span className={cx('badge', missing ? 'badge-missing' : VERDICT_BADGE[verdict], styles.badge)}>
                  {missing ? 'Mancante' : VERDICT_WORD[verdict]}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <ul className={styles.legend}>
        <li>
          <i className={cx(styles.sw, styles.swBand)} aria-hidden="true" />
          Fascia = mediana ± {tol} min
        </li>
        <li>
          <i className={cx(styles.sw, styles.swMedian)} aria-hidden="true" />
          Linea tratteggiata = mediana
        </li>
        <li>
          <i className={cx(styles.sw, styles.swConfirmed)} aria-hidden="true" />
          Pieno = confermata
        </li>
        <li>
          <i className={cx(styles.sw, styles.swAuto)} aria-hidden="true" />
          Contorno = automatica
        </li>
        <li>
          <i className={cx(styles.sw, styles.swEstimated)} aria-hidden="true" />
          Tratteggiato = stimata
        </li>
        <li>
          <i className={cx(styles.sw, styles.swMissing)} aria-hidden="true" />
          Punti = mancante
        </li>
      </ul>

      <table className={styles.srOnly}>
        <caption>{title}: orari e scarti dalla mediana per notte</caption>
        <thead>
          <tr>
            <th scope="col">Notte</th>
            <th scope="col">Orari</th>
            <th scope="col">Provenienza</th>
            <th scope="col">Scarto letto</th>
            <th scope="col">Scarto sveglia</th>
            <th scope="col">Esito</th>
          </tr>
        </thead>
        <tbody>
          {nights.map((n, i) => {
            const span = n.provenance === 'mancante' ? null : nightSpan(n.bedMin, n.wakeMin);
            const missing = span === null;
            return (
              <tr key={`${n.label}-${i}`}>
                <th scope="row">{n.fullLabel ?? n.label}</th>
                <td>{missing ? 'Mancante' : `${formatBedClock(n.bedMin)} → ${formatClock(n.wakeMin)}`}</td>
                <td>{missing ? 'Mancante' : PROVENIENZA_NOTTE[n.provenance]}</td>
                <td>{missing ? 'Mancante' : (formatSigned(n.bedDevMin) ?? 'Mancante')}</td>
                <td>{missing ? 'Mancante' : (formatSigned(n.wakeDevMin) ?? 'Mancante')}</td>
                <td>{missing ? 'Mancante' : VERDICT_WORD[nightVerdict(n, tol)]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}

export default NightBars;
