// Prompt for AI-generated insights. Only eligible aggregate stats are sent.
import type { ChatMessage } from '../types.ts';
import type { InsightStats } from './schema.ts';
import type { SectionKey } from './thresholds.ts';

export function buildInsightMessages(eligible: InsightStats, hidden: SectionKey[]): ChatMessage[] {
  const system = [
    'Sei l\'assistente di un sleep tracker personale. Scrivi in italiano, tono semplice e non giudicante, frasi brevi.',
    'Ricevi SOLO statistiche aggregate (minuti, quote 0-1, orari HH:MM). Usa esclusivamente questi dati: non inventare numeri.',
    'Regole:',
    '- Massimo 6 insight, ognuno con una categoria tra: coverage, duration, debt, regularity, drift, weekday_weekend, naps, correlation.',
    '- La regolarità si misura rispetto alla mediana degli ultimi 14 giorni con tolleranza indicata (default ±30 min); il weekend conta come i feriali.',
    '- Le correlazioni sono indizi, non cause: dillo esplicitamente.',
    '- Non fare diagnosi mediche e non nominare farmaci; suggerimenti solo di igiene del sonno generale.',
    '- Se la copertura dati è bassa, dichiaralo.',
    hidden.length
      ? `- NON generare insight su queste sezioni (dati insufficienti): ${hidden.join(', ')}.`
      : '- Tutte le sezioni presenti hanno dati sufficienti.',
    '- severity: positive (va bene), info (neutro), attention (da tenere d\'occhio). confidence: low/medium/high in base al numero di notti.',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Statistiche aggregate:\n${JSON.stringify(eligible)}` },
  ];
}
