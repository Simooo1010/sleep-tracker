import { InsightCard, type InsightOrigin } from '@/components/InsightCard';
import { loadInsights } from '@/server/insights';
import type { InsightsResult } from '@/server/insights';
import type { Repo } from '@/server/types';
import type { AnalysisPeriod } from '@/server/views/analysis-types';

import { updatedLabelOf } from '../grafici/InsightsSection';
import styles from '../grafici/InsightsSection.module.css';

export interface AiNarrativeProps {
  repo: Repo;
  now: Date;
  /** Finestra del periodo scelto (7, 14 o 30 giorni). */
  period: AnalysisPeriod;
}

/**
 * Racconto AI della pagina Analisi: gli insight del gateway sulla finestra del periodo
 * (AI se il gateway c'è, altrimenti regole locali). Solo statistiche aggregate escono dal server.
 * Errori del repo → frase calma con role="status", mai un'eccezione. Il `<Suspense>` lo mette chi lo usa.
 */
export async function AiNarrative({ repo, now, period }: AiNarrativeProps) {
  let result: InsightsResult;
  try {
    result = await loadInsights(repo, now, {}, period);
  } catch {
    return (
      <p role="status" className={`body-sm muted ${styles.text}`}>
        Per ora non riesco a leggere i tuoi dati. Riprova tra poco: le tue notti sono al sicuro.
      </p>
    );
  }

  if (result.items.length === 0) {
    return (
      <p role="status" className={`body-sm muted ${styles.text}`}>
        Per ora non ho indizi da mostrarti. Compariranno con qualche notte in più.
      </p>
    );
  }

  const origin: InsightOrigin = result.source === 'ai' ? 'ai' : 'regole';
  const used = Math.max(0, Math.min(Math.round(result.nightsUsed) || 0, period));
  const updatedLabel = updatedLabelOf(result.updatedAt);

  return (
    <div className={styles.list}>
      {result.items.map((item, index) => (
        <InsightCard
          key={`${index}-${item.title}`}
          title={item.title}
          body={item.body}
          origin={origin}
          updatedLabel={updatedLabel}
          updatedAt={result.updatedAt}
          coverage={{ used, total: period }}
          headingLevel={3}
        />
      ))}
    </div>
  );
}

export default AiNarrative;
