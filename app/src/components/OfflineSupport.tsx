'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  SW_PATH,
  clearOfflineData,
  WARM_PATHS,
  formatSyncedAt,
  offlineSupported,
  readSyncedAt,
  writeSyncedAt,
} from '@/lib/offline';

import styles from './OfflineSupport.module.css';

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Registra il service worker, scarica in anticipo le sezioni (quando c'è rete) e mostra l'avviso «Sei offline».
 * Solo lettura: le modifiche richiedono la connessione (le Server Actions falliscono con il loro messaggio).
 * Sulla pagina di accesso cancella le copie salvate (uscita dal dispositivo: dati sanitari).
 */
export function OfflineSupport() {
  const pathname = usePathname() ?? '/';
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const bare = pathname === '/login' || pathname.startsWith('/login/');

  // La pagina di accesso si raggiunge solo dopo l'uscita (o a sessione scaduta, con rete): i dati salvati si cancellano.
  useEffect(() => {
    if (bare) void clearOfflineData();
  }, [bare]);

  useEffect(() => {
    if (bare || !online) return;
    const supported = offlineSupported({
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_FORCE_SW: process.env.NEXT_PUBLIC_FORCE_SW,
    });
    if (!supported) return;
    let cancelled = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; saved?: number } | null;
      if (data?.type === 'warmed' && (data.saved ?? 0) > 0) {
        const now = new Date().toISOString();
        writeSyncedAt(now);
        setSyncedAt(now);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    void navigator.serviceWorker
      .register(SW_PATH, { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (!cancelled) reg.active?.postMessage({ type: 'warm', urls: WARM_PATHS });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [bare, online]);

  if (online || bare) return null;
  const when = formatSyncedAt(syncedAt ?? readSyncedAt(), new Date());
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <strong className={styles.label}>Sei offline</strong>
      {' '}
      <span>
        {when ? `Vedi i dati salvati ${when}.` : 'Vedi i dati salvati su questo dispositivo.'} Per modificare serve la
        connessione.
      </span>
    </div>
  );
}

export default OfflineSupport;
