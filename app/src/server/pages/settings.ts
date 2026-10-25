/**
 * Dati della pagina Impostazioni: l'elenco dei token dei Comandi (solo metadati, mai l'hash)
 * e le frasi con cui la pagina li descrive. Nessun accesso a variabili globali: il repo arriva dal chiamante.
 * Questo modulo importa solo tipi: lo usa anche il componente client per formattare i token appena creati.
 */
import type { ApiTokenInfo, Repo } from '@/server/types';

export interface SettingsPageData {
  tokens: ApiTokenInfo[];
}

export async function loadSettingsPage(repo: Repo): Promise<SettingsPageData> {
  return { tokens: await repo.listTokens() };
}

const TIME_ZONE = 'Europe/Rome';

const dayFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE });

/** "24 ottobre 2026", o null se la data non è valida. */
export function formatTokenDay(iso: string): string | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : dayFormat.format(new Date(t));
}

/** "Creato il 24 ottobre 2026". */
export function createdText(info: Pick<ApiTokenInfo, 'createdAt'>): string {
  const day = formatTokenDay(info.createdAt);
  return day ? `Creato il ${day}` : 'Creato di recente';
}

/** "Ultimo uso 25 ottobre 2026, 08:12" oppure "Mai usato". */
export function lastUsedText(info: Pick<ApiTokenInfo, 'lastUsedAt'>): string {
  if (info.lastUsedAt === null) return 'Mai usato';
  const t = Date.parse(info.lastUsedAt);
  if (Number.isNaN(t)) return 'Mai usato';
  return `Ultimo uso ${dayFormat.format(new Date(t))}, ${timeFormat.format(new Date(t))}`;
}

/** Sintesi per la voce dell'elenco su telefono: "2 token attivi", "Nessun token attivo". */
export function tokensSummary(tokens: readonly Pick<ApiTokenInfo, 'active'>[]): string {
  const n = tokens.filter((t) => t.active).length;
  if (n === 0) return 'Nessun token attivo';
  return n === 1 ? '1 token attivo' : `${n} token attivi`;
}
