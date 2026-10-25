import { loadSettingsPage, type SettingsPageData } from '@/server/pages/settings';
import { getRepo } from '@/server/repo-factory';

import { ImpostazioniScreen } from './ImpostazioniScreen';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Impostazioni · Sleep Tracker' };

async function load(): Promise<SettingsPageData | null> {
  try {
    return await loadSettingsPage(getRepo());
  } catch {
    return null;
  }
}

export default async function ImpostazioniPage() {
  const data = await load();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className="serif display-md">Impostazioni</h1>
        <p className="body muted">Qui gestisci l&apos;accesso dei Comandi dell&apos;iPhone e la sessione.</p>
      </header>

      {data ? (
        <ImpostazioniScreen initialTokens={data.tokens} />
      ) : (
        <p className="body muted" role="status">
          Le impostazioni non sono disponibili in questo momento. Riprova tra poco.
        </p>
      )}
    </div>
  );
}
