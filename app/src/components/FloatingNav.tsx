import Link from 'next/link';

import styles from './FloatingNav.module.css';

/**
 * FloatingNav: navigazione principale (docs/design/system/components/FloatingNav).
 * Telefono: pillola flottante `navpill` con cinque voci. PC (da 60rem): barra laterale `side`
 * di 240px con otto voci e riepilogo di oggi. Il CSS mostra l'una o l'altra.
 * Il percorso attivo arriva come prop: nessun hook di routing qui dentro.
 */

export type NavKey = 'notte' | 'regolarita' | 'grafici' | 'analisi' | 'storico' | 'sera' | 'segnali' | 'impostazioni';

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  /** Tracciato SVG su griglia 24px, tratto 1.6px. */
  icon: string;
  /** Solo su PC: su telefono Analisi, Segnali e Impostazioni si aprono da pulsanti in alto. */
  desktopOnly?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'notte', label: 'Notte', href: '/', icon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z' },
  { key: 'regolarita', label: 'Regolarità', href: '/regolarita', icon: 'M4 7h9M4 12h13M4 17h7M18 5v14' },
  { key: 'grafici', label: 'Grafici', href: '/grafici', icon: 'M5 19V11M12 19V5M19 19v-6' },
  {
    key: 'analisi',
    label: 'Analisi',
    href: '/analisi',
    icon: 'M16 10.5a5.5 5.5 0 1 1-11 0a5.5 5.5 0 0 1 11 0ZM14.6 14.6 20 20M7.8 11.8l1.7-1.8 1.4 1.3 1.9-2.3',
    desktopOnly: true,
  },
  { key: 'storico', label: 'Storico', href: '/storico', icon: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4' },
  { key: 'sera', label: 'Sera', href: '/sera', icon: 'M4 17h16M7 17a5 5 0 0 1 10 0M12 6v3M5.6 9.6l1.8 1.8M18.4 9.6l-1.8 1.8' },
  {
    key: 'segnali',
    label: 'Segnali',
    href: '/segnali',
    icon: 'M4 9a12 12 0 0 1 16 0M7 12.5a8 8 0 0 1 10 0M10 16a4 4 0 0 1 4 0M12 19.5v.01',
    desktopOnly: true,
  },
  {
    key: 'impostazioni',
    label: 'Impostazioni',
    href: '/impostazioni',
    icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6',
    desktopOnly: true,
  },
];

export interface FloatingNavProps {
  /** Percorso corrente (es. da usePathname nel genitore). */
  pathname: string;
  /** Righe del riepilogo di oggi nella barra laterale, es. "Sveglia 07:20 · Primo uso 08:52". */
  today?: readonly string[];
  /** Chiamata al tocco di una voce: permette di evidenziarla subito, prima che la pagina arrivi. */
  onNavigate?: (href: string) => void;
}

function normalize(path: string): string {
  const p = path.split(/[?#]/)[0] ?? '';
  return p.length > 1 ? p.replace(/\/+$/, '') : p || '/';
}

/** Vero se la voce `href` corrisponde al percorso: `/` solo esatto, le altre anche con sottopercorsi. */
export function isNavActive(href: string, pathname: string): boolean {
  const path = normalize(pathname);
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

export function FloatingNav({ pathname, today = [], onNavigate }: FloatingNavProps) {
  const phoneItems = NAV_ITEMS.filter((item) => !item.desktopOnly);
  const lines = today.filter((line) => line.trim().length > 0);

  return (
    <>
      <div className={styles.pillWrap}>
        <nav className="navpill" aria-label="Principale">
          {phoneItems.map((item) => {
            const active = isNavActive(item.href, pathname);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={styles.pillLink}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate?.(item.href)}
              >
                <Icon d={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={styles.sideWrap}>
        <nav className={`side ${styles.side}`} aria-label="Principale">
          <div className="brand">Sleep Tracker</div>
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(item.href, pathname);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={styles.sideLink}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate?.(item.href)}
              >
                <Icon d={item.icon} />
                {item.label}
              </Link>
            );
          })}
          <div className={styles.sideFooter}>
            <section className={styles.today} aria-label="Riepilogo di oggi">
              <span className="body-strong">Oggi</span>
              {lines.length > 0 ? (
                lines.map((line, i) => (
                  <span key={i} className={`body-sm ${styles.todayLine}`}>
                    {line}
                  </span>
                ))
              ) : (
                <span className={`body-sm ${styles.todayLine}`}>Ancora nessun segnale.</span>
              )}
            </section>
          </div>
        </nav>
      </div>
    </>
  );
}

export default FloatingNav;
