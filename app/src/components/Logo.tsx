import Image from 'next/image';

import styles from './Logo.module.css';

/**
 * Logo: il segno (`/mark.svg`, nuvola con luna) su tessera bianca `icon-tile`, anche nel tema scuro,
 * con il nome "Sleep Tracker" in `font-display` peso 300 accanto (solo nelle intestazioni).
 * Usa il file vettoriale già in `public/`, mai ridisegnato.
 */

export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface LogoProps {
  /** sm 2rem, md 4rem, lg 7.5rem, xl 11.25rem. */
  size?: LogoSize;
  /** Mostra il nome accanto al segno. */
  withName?: boolean;
  /** Testo alternativo del segno quando il nome non è mostrato. */
  alt?: string;
  className?: string;
}

export function Logo({ size = 'md', withName = false, alt = 'Sleep Tracker', className }: LogoProps) {
  const root = [styles.logo, styles[size], className].filter(Boolean).join(' ');
  return (
    <span className={root}>
      <span className={`icon-tile ${styles.tile}`}>
        <Image src="/mark.svg" alt={withName ? '' : alt} width={1024} height={1024} unoptimized />
      </span>
      {withName && <span className={`serif ${styles.name}`}>Sleep Tracker</span>}
    </span>
  );
}

export default Logo;
