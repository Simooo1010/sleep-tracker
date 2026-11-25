import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getNow } from '@/lib/clock';
import { loadNightEditPage } from '@/server/pages/night-edit';
import { getRepo } from '@/server/repo-factory';

import { NightEditScreen } from './NightEditScreen';

// I dati cambiano a ogni segnale e l'ora è quella del momento: mai prerenderizzata.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Modifica notte' };

export default async function ModificaNottePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const data = await loadNightEditPage(getRepo(), getNow(), date);
  if (!data) notFound();
  return <NightEditScreen view={data.view} />;
}
