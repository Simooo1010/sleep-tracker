import { Suspense } from 'react';

import { getNow } from '@/lib/clock';
import { getRepo } from '@/server/repo-factory';
import { loadChartsPage } from '@/server/pages/charts';

import { ChartsScreen } from './ChartsScreen';
import { InsightsSection } from './InsightsSection';

// Legge ogni volta dal repo e dall'orologio dell'app: niente cache statica.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Grafici · Sleep Tracker' };

export default async function ChartsPage() {
  const repo = getRepo();
  const now = getNow();
  const { view } = await loadChartsPage(repo, now);

  return (
    <ChartsScreen
      view={view}
      insights={
        // Gli insight possono aspettare il gateway: la pagina intanto è già leggibile.
        <Suspense fallback={<p className="body-sm muted">Sto preparando gli indizi…</p>}>
          <InsightsSection repo={repo} now={now} />
        </Suspense>
      }
    />
  );
}
