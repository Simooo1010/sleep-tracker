'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';

import styles from './AppShell.module.css';
import { FloatingNav, NAV_ITEMS, isNavActive } from './FloatingNav';

/**
 * AppShell: guscio comune delle schermate (docs/design/system/Schermate.md, Navigazione).
 * Telefono: riga in alto con titolo della sezione, Analisi, Segnali e Impostazioni; contenuto; pillola flottante.
 * Il tema è automatico (segue il sistema); la scelta manuale sta solo in Impostazioni.
 * PC (da 60rem): barra laterale di 240px a sinistra, contenuto a destra centrato con `content-max`.
 * Il titolo non è un titolo di documento: ogni pagina mette il proprio <h1>.
 */

export const SKIP_LINK_LABEL = 'Salta al contenuto';
export const MAIN_ID = 'contenuto';

/** Percorsi senza guscio (niente navigazione): la pagina di accesso. */
export function isBareRoute(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/login/');
}

/** Titolo della sezione per il percorso (dalle etichette della navigazione). */
export function sectionTitle(pathname: string): string {
  return NAV_ITEMS.find((item) => isNavActive(item.href, pathname))?.label ?? 'Sleep Tracker';
}

export function AppShell({ children }: { children: ReactNode }) {
  const currentPath = usePathname() ?? '/';
  // Evidenziazione ottimistica: al tocco la voce si accende subito; vale finché il percorso reale non cambia.
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const pathname = pending !== null && pending.from === currentPath ? pending.to : currentPath;
  const onNavigate = useCallback((to: string) => setPending({ from: currentPath, to }), [currentPath]);

  const analisiActive = isNavActive('/analisi', pathname);
  const segnaliActive = isNavActive('/segnali', pathname);
  const impostazioniActive = isNavActive('/impostazioni', pathname);

  // Pagina di accesso: nessuna navigazione (la pagina porta il proprio <main>).
  if (isBareRoute(pathname)) return <>{children}</>;

  return (
    <div className={styles.root}>
      <a className={styles.skip} href={`#${MAIN_ID}`}>
        {SKIP_LINK_LABEL}
      </a>

      <div className={styles.topbar}>
        <p className={`title ${styles.sectionTitle}`}>{sectionTitle(pathname)}</p>
        <div className={styles.actions}>
          <Link
            href="/analisi"
            className={`btn btn-secondary ${styles.action}`}
            aria-current={analisiActive ? 'page' : undefined}
            onClick={() => onNavigate('/analisi')}
          >
            Analisi
          </Link>
          <Link
            href="/segnali"
            className={`btn btn-secondary ${styles.action}`}
            aria-current={segnaliActive ? 'page' : undefined}
            onClick={() => onNavigate('/segnali')}
          >
            Segnali
          </Link>
          <Link
            href="/impostazioni"
            className={`btn btn-secondary ${styles.action}`}
            aria-current={impostazioniActive ? 'page' : undefined}
            onClick={() => onNavigate('/impostazioni')}
          >
            Impostazioni
          </Link>
        </div>
      </div>

      <div className={styles.navSlot}>
        <FloatingNav pathname={pathname} onNavigate={onNavigate} />
      </div>

      <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  );
}

export default AppShell;
