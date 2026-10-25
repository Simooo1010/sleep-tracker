import { getNow } from '@/lib/clock';
import { loadEveningPage, type EveningPageData } from '@/server/pages/evening';
import { getRepo } from '@/server/repo-factory';

import { EveningScreen } from './EveningScreen';
import styles from './page.module.css';

// Legge dal repo a ogni richiesta e dipende dall'ora: mai prerenderizzata.
export const dynamic = 'force-dynamic';

const LOAD_ERROR_TEXT = 'Il check serale non si apre in questo momento. Riprova tra poco.';

async function load(): Promise<EveningPageData | null> {
  try {
    return await loadEveningPage(getRepo(), getNow());
  } catch {
    return null;
  }
}

export default async function SeraPage() {
  const data = await load();

  return (
    <>
      <h1 className={`eyebrow ${styles.heading}`}>Check serale</h1>
      {data ? (
        <EveningScreen today={data.today} tonightNightDate={data.tonightNightDate} view={data.view} />
      ) : (
        <p className={`body ${styles.message}`} role="status">
          {LOAD_ERROR_TEXT}
        </p>
      )}
    </>
  );
}
