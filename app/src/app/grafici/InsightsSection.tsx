import { InsightCard, type InsightOrigin } from '@/components/InsightCard';
import { loadInsights } from '@/server/insights';
import type { InsightsResult } from '@/server/insights';
import type { Repo } from '@/server/types';
import { formatClock } from '@/server/views/format';

import styles from './InsightsSection.module.css';

/** Finestra su cui si contano le notti degli insight (ultimi 30 giorni). */
export const INSIGHT_WINDOW_NIGHTS = 30;

export interface InsightsSectionProps {
  repo: Repo;
  now: Date;
}

/** 'aggiornato alle 08:30' (Europe/Rome); se l'istante non è valido, una frase generica senza orario. */
export function updatedLabelOf(updatedAt: string): string {
  const clock = formatClock(updatedAt);
  return clock === '—' ? 'aggiornato di recente' : `aggiornato alle ${clock}`;
}

/**
 * Insight testuali: `loadInsights` risponde sempre (AI se il gateway c'è, altrimenti regole).
 * Se per un imprevisto lancia, la sezione resta vuota: la pagina non si rompe e non sgrida.
 */
export async function InsightsSection({ repo, now }: InsightsSectionProps) {
  let result: InsightsResult;
  try {
    result = await loadInsights(repo, now);
  } catch {
    return null;
  }

  const origin: InsightOrigin = result.source === 'ai' ? 'ai' : 'regole';
  const used = Math.max(0, Math.min(Math.round(result.nightsUsed) || 0, INSIGHT_WINDOW_NIGHTS));
  const updatedLabel = updatedLabelOf(result.updatedAt);

  if (result.items.length === 0) {
    return (
      <p className={`body-sm muted ${styles.text}`}>Per ora non ho indizi da mostrarti. Compariranno con qualche notte in più.</p>
    );
  }

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
          coverage={{ used, total: INSIGHT_WINDOW_NIGHTS }}
          headingLevel={3}
        />
      ))}
    </div>
  );
}

export default InsightsSection;
