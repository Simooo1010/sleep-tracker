import styles from './ListRow.module.css';

/** Colore del puntino: distingue le righe vicine, non ha significato di stato. */
export type ListRowAccent = 'blue' | 'sage' | 'peach' | 'yellow';

export interface ListRowProps {
  /** Nome della sezione: "Confronto tra notti". */
  title: string;
  /** Dato chiave già formattato: "Debito 1h 05m", "9 su 14 nella tolleranza". */
  summary?: string | null;
  accent?: ListRowAccent;
  /** Con href la riga è un link; altrimenti è un pulsante che chiama onOpen. */
  href?: string;
  onOpen?: () => void;
}

function Chevron() {
  return (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ListRow({ title, summary, accent = 'blue', href, onOpen }: ListRowProps) {
  const hasSummary = typeof summary === 'string' && summary.trim() !== '';
  const content = (
    <>
      <span className={`dot ${styles[accent]}`} aria-hidden="true" />
      <span className="tx">
        <span className="tt">{title}</span>
        {hasSummary ? <span className="ss">{summary}</span> : null}
      </span>
      <Chevron />
    </>
  );

  if (href) {
    return (
      <a className={`list-row ${styles.link}`} href={href} onClick={onOpen}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={`list-row ${styles.button}`} onClick={onOpen}>
      {content}
    </button>
  );
}

export default ListRow;
