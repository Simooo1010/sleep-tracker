import { useId, type ReactNode } from 'react';

import styles from './SessionCard.module.css';

/** Stato della notte, come in Dati e calcoli: confermata, stimata o mancante. */
export type SessionStatus = 'confermata' | 'stimata' | 'mancante';

export interface SessionRegularity {
  /** Scarti già formattati, ad esempio "Letto +8 min · Sveglia −12 min". */
  text: string;
  /** Letto e sveglia entro la tolleranza: aggiunge la parola "OK", altrimenti "Fuori". */
  inTolerance: boolean;
}

export interface SessionCardProps {
  status: SessionStatus;
  /** Durata compatta già formattata ("7h 32m"). Assente se mancante. */
  duration?: string | null;
  /** Ora di letto in 24 ore ("23:48"). */
  bedtime?: string | null;
  /** Ora di sveglia in 24 ore ("07:20"). */
  wakeTime?: string | null;
  /** Come è stata ricostruita o confermata la notte. */
  explanation?: string | null;
  /** Nota in più sotto la spiegazione (es. cambio d'ora). */
  note?: string | null;
  /** Pillola di regolarità (su PC). */
  regularity?: SessionRegularity | null;
  /** Etichetta in alto. Predefinita "Stanotte". */
  title?: string;
  /** "lg" telefono, "xl" PC; senza valore passa da lg a xl in base alla larghezza. */
  size?: 'lg' | 'xl';
  onConfirm?: () => void;
  onCorrect?: () => void;
  onUndo?: () => void;
  /** Spazio per il voto di energia (MoonRating). */
  children?: ReactNode;
}

const BADGE: Record<SessionStatus, { className: string; text: string }> = {
  confermata: { className: 'badge badge-confirmed', text: 'Confermata' },
  stimata: { className: 'badge badge-estimated', text: 'Stimata' },
  mancante: { className: 'badge badge-missing', text: 'Mancante' },
};

const BAR: Record<SessionStatus, string> = {
  confermata: 'night-bar',
  stimata: 'night-bar is-estimated',
  mancante: 'night-bar is-missing',
};

const MISSING_EXPLANATION = 'Nessun segnale per questa notte. Se ricordi gli orari, puoi aggiungerli.';

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function SessionCard({
  status,
  duration,
  bedtime,
  wakeTime,
  explanation,
  note,
  regularity,
  title = 'Stanotte',
  size,
  onConfirm,
  onCorrect,
  onUndo,
  children,
}: SessionCardProps) {
  const headingId = useId();
  const badge = BADGE[status];
  const hasDuration = present(duration) && status !== 'mancante';
  const bed = present(bedtime) ? bedtime : null;
  const wake = present(wakeTime) ? wakeTime : null;
  const why = present(explanation) ? explanation : status === 'mancante' ? MISSING_EXPLANATION : null;
  const bigClass = cx('big', size === 'xl' ? 'big-xl' : 'big-lg', size === undefined && styles.fluid);
  const timesLabel = `Letto ${bed ?? 'mancante'}, sveglia ${wake ?? 'mancante'}`;

  return (
    <section className={cx('card', styles.card)} aria-labelledby={headingId}>
      <h2 id={headingId} className={cx('eyebrow', styles.heading)}>
        {title}
      </h2>

      {hasDuration ? (
        <p className={bigClass}>{duration}</p>
      ) : (
        <p className={bigClass}>
          <span aria-hidden="true">—</span>
          <span className={styles.srOnly}>Durata mancante</span>
        </p>
      )}

      <div className={styles.times}>
        <span className={styles.srOnly}>{timesLabel}</span>
        <span className={styles.time} aria-hidden="true">
          {bed ?? '—'}
        </span>
        <div className={BAR[status]} aria-hidden="true" />
        <span className={styles.time} aria-hidden="true">
          {wake ?? '—'}
        </span>
      </div>

      <div className={styles.badges}>
        <span className={badge.className}>{badge.text}</span>
        {regularity && present(regularity.text) ? (
          <span className={cx('badge', regularity.inTolerance ? 'badge-ok' : 'badge-out')}>
            {`${regularity.text} · ${regularity.inTolerance ? 'OK' : 'Fuori'}`}
          </span>
        ) : null}
      </div>

      {why ? <p className={cx('muted', styles.explanation)}>{why}</p> : null}
      {present(note) ? (
        <p className={cx('muted', styles.explanation)} data-clock-change="true">
          {note}
        </p>
      ) : null}

      {status === 'stimata' && onConfirm ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onConfirm}>
          Conferma
        </button>
      ) : null}

      {status === 'confermata' ? (
        <div className={styles.registered} role="status">
          <span>Registrata. Grazie.</span>
          {onUndo ? (
            <button type="button" className={cx('btn', 'btn-ghost', styles.undo)} onClick={onUndo}>
              Annulla
            </button>
          ) : null}
        </div>
      ) : null}

      {onCorrect ? (
        <button type="button" className={cx('btn', 'btn-ghost', styles.correct)} onClick={onCorrect}>
          {status === 'mancante' ? 'Aggiungi orari' : 'Correggi orari'}
        </button>
      ) : null}

      {children ? <div className={styles.slot}>{children}</div> : null}
    </section>
  );
}

export default SessionCard;
