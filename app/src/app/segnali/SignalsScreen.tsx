import { Badge } from '@/components/Badge';
import { SignalRow, type SignalStatus } from '@/components/SignalRow';
import type { SignalRowView, SignalsView } from '@/server/views';

import styles from './SignalsScreen.module.css';

/**
 * Schermata Segnali (sola lettura): una riga per automazione con stato a parole e ultimo evento,
 * una nota neutra se serve, il registro degli ultimi eventi.
 * Telefono: una colonna. Da 60rem: righe a sinistra, registro a destra.
 * Spec: docs/design/system/Schermate.md §Segnali. Nessun rimprovero: un segnale fermo è "in pausa".
 */

/** Le righe "di riserva" (stima, recupero) sono sempre disponibili: stato Attivo. */
function rowStatus(row: SignalRowView): SignalStatus {
  return row.status === 'riserva' ? 'attivo' : row.status;
}

function rowDescription(row: SignalRowView): string {
  return row.status === 'inattivo' ? `${row.description} · in pausa, l'app non lo attende` : row.description;
}

export function SignalsScreen({ view }: { view: SignalsView }) {
  const warning = view.warnings[0] ?? null;

  return (
    <div className={styles.root}>
      {view.emptyText ? <p className="body muted">{view.emptyText}</p> : null}

      {warning ? (
        <div className={`card card-soft card-blue ${styles.note}`} role="status">
          <p className={`body-sm ${styles.text}`}>{warning.text}</p>
        </div>
      ) : null}

      <div className={styles.columns}>
        <section className={`card ${styles.panel}`} aria-labelledby="segnali-automazioni">
          <h2 id="segnali-automazioni" className={`title ${styles.panelTitle}`}>
            Automazioni
          </h2>
          <ul className={styles.list}>
            {view.rows.map((row) => (
              <SignalRow
                key={row.key}
                as="li"
                name={row.name}
                description={rowDescription(row)}
                lastEvent={row.lastText}
                status={rowStatus(row)}
              />
            ))}
          </ul>
        </section>

        <section className={`card ${styles.panel}`} aria-labelledby="segnali-registro">
          <h2 id="segnali-registro" className={`title ${styles.panelTitle}`}>
            {view.log.title}
          </h2>
          {view.log.emptyText ? (
            <p className={`body-sm muted ${styles.text}`}>{view.log.emptyText}</p>
          ) : (
            <ol className={styles.log}>
              {view.log.items.map((item) => (
                <li key={`${item.ts}-${item.what}`} className={styles.logItem}>
                  <div className={styles.logHead}>
                    <p className={`body-strong ${styles.logWhen}`}>{item.when}</p>
                    <Badge variant={item.result === 'Stima usata' ? 'estimated' : 'auto'}>{item.result}</Badge>
                  </div>
                  <p className={`body-sm muted ${styles.logWhat}`}>{item.what}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

export default SignalsScreen;
