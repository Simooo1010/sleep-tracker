import { getNow } from '@/lib/clock';
import { loadSignalsPage, type SignalsPageData } from '@/server/pages/signals';
import { getRepo } from '@/server/repo-factory';

import { SignalsScreen } from './SignalsScreen';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Segnali · Sleep Tracker' };

export default async function SegnaliPage() {
  let data: SignalsPageData | null = null;
  try {
    data = await loadSignalsPage(getRepo(), getNow());
  } catch {
    data = null;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className="serif display-md">Segnali</h1>
        <p className="body muted">Da qui vedi se i Comandi dell&apos;iPhone stanno arrivando.</p>
      </header>

      {data ? (
        <SignalsScreen view={data.view} />
      ) : (
        <p className="body muted" role="status">
          I segnali non sono disponibili in questo momento. Riprova tra poco.
        </p>
      )}

      <p className="caption muted">Come creare i Comandi: vedi docs/COMANDI_IOS.md</p>
    </div>
  );
}
