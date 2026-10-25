import { getNow } from '@/lib/clock';
import { getRepo } from '@/server/repo-factory';
import { loadEveningPage, type EveningPageData } from '@/server/pages/evening';

import { EveningScreen } from './EveningScreen';
import styles from './EveningScreen.module.css';

// Legge dal repo a ogni richiesta e dipende dall'ora: mai prerenderizzata.
export const dynamic = 'force-dynamic';

const LOAD_ERROR_TEXT = 'Il check serale non si apre in questo momento. Riprova tra poco.';

export default async function SeraPage() {
  let data: EveningPageData | null = null;
  try {
    data = await loadEveningPage(getRepo(), getNow());
  } catch {
    data = null;
  }

  return (
    <div className={styles.page}>
      <h1 className={`eyebrow ${styles.pageTitle}`}>Check serale</h1>
      {data ? (
        <EveningScreen today={data.today} tonightNightDate={data.tonightNightDate} view={data.view} />
      ) : (
        <p className={`body ${styles.message}`} role="status">
          {LOAD_ERROR_TEXT}
        </p>
      )}
    </div>
  );
}
