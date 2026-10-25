'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useSyncExternalStore, type ReactNode } from 'react';

import { appliedTheme, applyTheme, nextTheme, storeTheme, type Theme } from '@/lib/theme';

import styles from './AppShell.module.css';
import { FloatingNav, NAV_ITEMS, isNavActive } from './FloatingNav';

/**
 * AppShell: guscio comune delle schermate (docs/design/system/Schermate.md, Navigazione).
 * Telefono: riga in alto con titolo della sezione, Segnali, Impostazioni e tema; contenuto; pillola flottante.
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

// Il tema vive nell'attributo data-theme di <html> (impostato dallo script in <head>, senza flash):
// lo si osserva come sorgente esterna. Sul server e nel primo render vale 'chiaro'.
function subscribeTheme(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const serverTheme = (): Theme => 'chiaro';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const theme = useSyncExternalStore(subscribeTheme, appliedTheme, serverTheme);

  const toggleTheme = useCallback(() => {
    const next = nextTheme(appliedTheme());
    applyTheme(next);
    storeTheme(next);
  }, []);

  const other = nextTheme(theme);
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
            href="/segnali"
            className={`btn btn-secondary ${styles.action}`}
            aria-current={segnaliActive ? 'page' : undefined}
          >
            Segnali
          </Link>
          <Link
            href="/impostazioni"
            className={`btn btn-secondary ${styles.action}`}
            aria-current={impostazioniActive ? 'page' : undefined}
          >
            Impostazioni
          </Link>
          <button
            type="button"
            className={`btn btn-secondary ${styles.action}`}
            aria-label={`Tema ${theme}, passa al tema ${other}`}
            onClick={toggleTheme}
          >
            Tema {theme}
          </button>
        </div>
      </div>

      <div className={styles.navSlot}>
        <FloatingNav pathname={pathname} theme={theme} onToggleTheme={toggleTheme} />
      </div>

      <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </div>
  );
}

export default AppShell;
