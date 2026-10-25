import { NightScreen } from '@/app/NightScreen';
import { getNow } from '@/lib/clock';
import { getRepo } from '@/server/repo-factory';
import { loadNightPage, type NightPageData } from '@/server/pages/night';

import styles from './NightScreen.module.css';

// I dati cambiano a ogni conferma e dipendono dall'ora: mai in cache.
export const dynamic = 'force-dynamic';

// Next consente alle pagine solo alcune esportazioni: il testo resta locale.
const UNREACHABLE_TEXT = 'Il servizio dati non è raggiungibile. Riprova tra poco.';

async function load(): Promise<NightPageData | null> {
  try {
    return await loadNightPage(getRepo(), getNow());
  } catch {
    // Nessun dettaglio all'utente: l'errore tecnico non lo aiuta e può contenere dati interni.
    return null;
  }
}

export default async function NightPage() {
  const data = await load();

  if (data === null) {
    return (
      <>
        <h1 className={`title ${styles.pageTitle}`}>Notte</h1>
        <section className="card" aria-label="Servizio non raggiungibile">
          <p className="body muted" role="status">
            {UNREACHABLE_TEXT}
          </p>
        </section>
      </>
    );
  }

  const { today, view } = data;
  return (
    <>
      <h1 className={`title ${styles.pageTitle}`}>{`Notte di ${view.dateLabel}`}</h1>
      <NightScreen view={view} todayDate={today} />
    </>
  );
}
