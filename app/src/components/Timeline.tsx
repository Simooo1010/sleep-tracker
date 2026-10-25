import { useId } from 'react';

import styles from './Timeline.module.css';

/**
 * Tipo di evento, decide il punto sul binario:
 * - `confermato`: segnale arrivato (Riposo, sveglia interrotta), punto azzurro;
 * - `serale`: check serale o primo uso del mattino, punto salvia;
 * - `da-confermare`: ad esempio un possibile risveglio, punto vuoto tratteggiato.
 */
export type TimelineEventKind = 'confermato' | 'serale' | 'da-confermare';

export interface TimelineEvent {
  /** Chiave stabile; se manca si usa la posizione. */
  id?: string;
  /** Ora in 24 ore ("23:48"). Assente se non nota. */
  time?: string | null;
  /** Cosa è successo: "Riposo attivato". */
  title: string;
  /** Da dove arriva: "Comando Full Immersion", "Movimento del telefono · da confermare". */
  source: string;
  kind: TimelineEventKind;
}

export interface TimelineProps {
  events: readonly TimelineEvent[];
  /** Titolo della sezione. Predefinito "La notte, in ordine". */
  title?: string;
  /** Testo quando non ci sono eventi. */
  emptyText?: string;
}

const DOT: Record<TimelineEventKind, string> = {
  confermato: 'dot',
  serale: 'dot sage',
  'da-confermare': 'dot est',
};

function sourceText(event: TimelineEvent): string {
  const source = event.source.trim();
  if (event.kind !== 'da-confermare' || /da confermare/i.test(source)) return source;
  // Il punto tratteggiato non basta da solo: lo stato si legge anche in parola.
  return source === '' ? 'Da confermare' : `${source} · da confermare`;
}

export function Timeline({
  events,
  title = 'La notte, in ordine',
  emptyText = 'Ancora nessun segnale per questa notte.',
}: TimelineProps) {
  const headingId = useId();

  return (
    <section className={`card ${styles.card}`} aria-labelledby={headingId}>
      <h2 id={headingId} className={`eyebrow ${styles.heading}`}>
        {title}
      </h2>
      {events.length === 0 ? (
        <p className={`muted body-sm ${styles.empty}`}>{emptyText}</p>
      ) : (
        <ol className={styles.list}>
          {events.map((event, index) => {
            const time = typeof event.time === 'string' && event.time.trim() !== '' ? event.time : null;
            const isLast = index === events.length - 1;
            return (
              <li key={event.id ?? `${index}`} className="tl">
                <div className={`t ${styles.time}`}>
                  {time ?? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className={styles.srOnly}>Ora mancante</span>
                    </>
                  )}
                </div>
                <div className="rail" aria-hidden="true">
                  <div className={DOT[event.kind]} />
                  {isLast ? null : <div className="line" />}
                </div>
                <div className="body">
                  <div className={`title ${styles.title}`}>{event.title}</div>
                  <div className="src">{sourceText(event)}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default Timeline;
