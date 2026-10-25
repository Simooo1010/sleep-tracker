import base from '../loading.module.css';
import styles from './AnalysisScreen.module.css';

/** Attesa della pagina Analisi: stessa forma della pagina (titolo, anello, periodo, schede), nessun testo inventato. */
export default function Loading() {
  return (
    <div className={base.wrap} role="status" aria-label="Caricamento">
      <div className={base.title} />
      <div className={styles.skeletonRing} />
      <div className={styles.skeletonPeriods} />
      <div className={base.card} />
      <div className={base.card} />
    </div>
  );
}
