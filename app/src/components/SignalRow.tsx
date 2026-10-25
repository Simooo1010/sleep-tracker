import styles from './SignalRow.module.css';

/** Stato di una automazione, sempre scritto in parola. */
export type SignalStatus = 'attivo' | 'da-configurare' | 'inattivo';

export interface SignalRowProps {
  /** Nome dell'automazione: "Sveglia interrotta". */
  name: string;
  /** Una riga su come funziona, con l'evento tra virgolette: 'Comando automatico · invia "wake"'. */
  description: string;
  /** Quando è arrivato l'ultimo segnale, già formattato ("oggi 07:20"). Assente se mai arrivato. */
  lastEvent?: string | null;
  status: SignalStatus;
  /** "li" quando la riga sta in un elenco <ul>. Predefinito "div". */
  as?: 'div' | 'li';
}

const STATUS: Record<SignalStatus, { className: string; text: string }> = {
  attivo: { className: 'badge badge-ok', text: 'Attivo' },
  'da-configurare': { className: 'badge badge-out', text: 'Da configurare' },
  inattivo: { className: 'badge badge-missing', text: 'Inattivo' },
};

export function SignalRow({ name, description, lastEvent, status, as = 'div' }: SignalRowProps) {
  const Tag = as;
  const badge = STATUS[status];
  const last = typeof lastEvent === 'string' && lastEvent.trim() !== '' ? lastEvent : null;

  return (
    <Tag className={`signal ${styles.row}`}>
      <div className={styles.head}>
        <span className={`nm ${styles.name}`}>{name}</span>
        <span className={badge.className}>{badge.text}</span>
      </div>
      <p className={`caption muted ${styles.text}`}>{description}</p>
      <p className={`caption muted ${styles.text}`}>
        <span className={styles.srOnly}>Ultimo segnale: </span>
        {last ?? 'ancora nessun segnale'}
      </p>
    </Tag>
  );
}

export default SignalRow;
