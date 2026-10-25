import type { Metadata } from 'next';
import { Suspense } from 'react';

import { getNow } from '@/lib/clock';
import { getRepo } from '@/server/repo-factory';
import { loadAnalysisPage, parseAnalysisPeriod } from '@/server/pages/analysis';
import type { AnalysisView } from '@/server/views/analysis-types';

import { AiNarrative } from './AiNarrative';
import { AnalysisScreen } from './AnalysisScreen';

// Legge ogni volta dal repo e dall'orologio dell'app: niente cache statica.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Analisi · Sleep Tracker' };

const LOAD_ERROR_TEXT = 'L’analisi non si carica in questo momento. Riprova tra qualche istante: le tue notti sono al sicuro.';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalisiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = parseAnalysisPeriod(sp.periodo);
  const repo = getRepo();
  const now = getNow();

  let view: AnalysisView | null;
  try {
    view = (await loadAnalysisPage(repo, now, period)).view;
  } catch {
    view = null;
  }

  if (view === null) {
    return (
      <div>
        <h1 className="heading-md">Analisi</h1>
        <p className="body-lg muted" role="status">
          {LOAD_ERROR_TEXT}
        </p>
      </div>
    );
  }

  return (
    <AnalysisScreen
      view={view}
      narrative={
        // Il testo AI può aspettare il gateway: la pagina intanto è già leggibile.
        <Suspense fallback={<p className="body-sm muted">Sto preparando il racconto…</p>}>
          <AiNarrative repo={repo} now={now} period={view.period} />
        </Suspense>
      }
    />
  );
}
