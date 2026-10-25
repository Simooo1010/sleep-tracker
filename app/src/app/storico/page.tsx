import type { Metadata } from 'next';

import { getNow } from '@/lib/clock';
import { getRepo } from '@/server/repo-factory';
import { loadHistoryPage } from '@/server/pages/history';

import { HistoryScreen } from './HistoryScreen';

// I dati cambiano a ogni segnale e l'ora è quella del momento: mai prerenderizzata.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Storico' };

type SearchParams = Record<string, string | string[] | undefined>;

/** Un parametro ripetuto (?m=a&m=b) vale come il primo. */
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function StoricoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { today, view } = await loadHistoryPage(getRepo(), getNow(), { m: first(sp.m), d: first(sp.d) });
  return <HistoryScreen view={view} today={today} />;
}
