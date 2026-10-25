import type { Metadata } from 'next';

import { getNow } from '@/lib/clock';
import { getRepo } from '@/server/repo-factory';
import { loadRegularityPage } from '@/server/pages/regularity';
import type { RegularityView } from '@/server/views/regularity';

import { RegularityScreen } from './RegularityScreen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Regolarità · Sleep Tracker' };

const LOAD_ERROR_TEXT = 'Le notti non si caricano in questo momento. Riprova tra qualche istante.';

export default async function RegolaritaPage() {
  let view: RegularityView | null;
  try {
    view = (await loadRegularityPage(getRepo(), getNow())).view;
  } catch {
    view = null;
  }

  if (view === null) {
    return (
      <div>
        <h1 className="heading-md">Regolarità</h1>
        <p className="body-lg muted" role="status">
          {LOAD_ERROR_TEXT}
        </p>
      </div>
    );
  }
  return <RegularityScreen view={view} />;
}
