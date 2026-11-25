/**
 * Supporto offline in sola lettura: costanti e funzioni pure/di rete per il service worker (`public/sw.js`).
 * Il service worker salva le pagine già viste e scarica in anticipo le sezioni; qui si registra, si chiede il
 * precaricamento e si cancella tutto al logout (dati sanitari: non devono restare sul dispositivo).
 */

export const SW_PATH = '/sw.js';
export const SYNCED_AT_KEY = 'st-offline-synced-at';

/** Sezioni scaricate in anticipo, per renderle consultabili offline. */
export const WARM_PATHS = ['/', '/sera', '/regolarita', '/grafici', '/analisi', '/storico', '/segnali', '/impostazioni'] as const;

/** Il service worker esiste solo su HTTPS/localhost e non in sviluppo (le chiavi dei file cambiano a ogni modifica). */
export function offlineSupported(env: { NODE_ENV?: string; NEXT_PUBLIC_FORCE_SW?: string }): boolean {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  return env.NODE_ENV === 'production' || env.NEXT_PUBLIC_FORCE_SW === '1';
}

export function formatSyncedAt(iso: string | null, now: Date, timeZone = 'Europe/Rome'): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const day = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone });
  const time = then.toLocaleTimeString('it-IT', { timeZone, hour: '2-digit', minute: '2-digit' });
  if (day(then) === day(now)) return `oggi alle ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  if (day(then) === day(yesterday)) return `ieri alle ${time}`;
  const date = then.toLocaleDateString('it-IT', { timeZone, day: 'numeric', month: 'long' });
  return `il ${date} alle ${time}`;
}

export function readSyncedAt(): string | null {
  try {
    return window.localStorage.getItem(SYNCED_AT_KEY);
  } catch {
    return null;
  }
}

export function writeSyncedAt(iso: string): void {
  try {
    window.localStorage.setItem(SYNCED_AT_KEY, iso);
  } catch {
    // Storage non disponibile (finestra privata): l'avviso offline non mostra l'orario.
  }
}

/** Cancella pagine salvate e orario di sincronizzazione. Da chiamare prima dell'uscita (logout). */
export async function clearOfflineData(): Promise<void> {
  try {
    window.localStorage.removeItem(SYNCED_AT_KEY);
  } catch {
    // niente da cancellare
  }
  try {
    if ('caches' in window) {
      for (const key of await caches.keys()) {
        if (key.startsWith('st-')) await caches.delete(key);
      }
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: 'clear' });
  } catch {
    // best effort
  }
}
