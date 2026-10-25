import styles from './loading.module.css';

/** Schermata di attesa mostrata subito al cambio sezione, mentre il server prepara i dati. */
export default function Loading() {
  return (
    <div className={styles.wrap} role="status" aria-label="Caricamento">
      <div className={styles.title} />
      <div className={styles.card} />
      <div className={styles.card} />
    </div>
  );
}
