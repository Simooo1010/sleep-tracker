import type { Metadata } from 'next';
import Link from 'next/link';

import { getNow } from '@/lib/clock';
import { loadNightEditPage } from '@/server/pages/night-edit';
import { getRepo } from '@/server/repo-factory';

import { NightEditScreen } from './NightEditScreen';
import styles from './NightEditScreen.module.css';

// I dati cambiano a ogni segnale e l'ora è quella del momento: mai prerenderizzata.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Modifica notte' };

export default async function ModificaNottePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const data = await loadNightEditPage(getRepo(), getNow(), date);
  if (!data) {
    // Messaggio nella pagina (non `notFound()`): con lo streaming del loading.tsx radice il 404 lascerebbe il contenuto vuoto.
    return (
      <div className={styles.page}>
        <h1 className={`heading-md ${styles.pageTitle}`}>Notte non trovata</h1>
        <p className="body muted">Questa data non esiste oppure è ancora nel futuro: si possono modificare solo le notti passate.</p>
        <Link href="/storico" className="btn btn-secondary">
          Torna allo Storico
        </Link>
      </div>
    );
  }
  return <NightEditScreen view={data.view} />;
}
