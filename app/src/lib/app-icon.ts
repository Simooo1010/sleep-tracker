/**
 * Icona dell'app in modalità scura (sfondo `--ground` del tema scuro al posto del bianco, stesso segno).
 * Safari ignora `media` su `apple-touch-icon` (l'icona si scarica una volta, quando si aggiunge alla Home),
 * quindi si cambia l'`href` dopo l'idratazione in base alla modalità del sistema (da `AppIconSync`).
 * Non da uno script inline: React rigenera i `<link>` in conflitto e il DOM resta con due icone.
 * File in `public/`, copie di `docs/design/logo/`.
 */

export const APP_ICONS = {
  chiaro: { touch: '/apple-touch-icon.png', favicon: '/favicon-32.png' },
  scuro: { touch: '/apple-touch-icon-dark.png', favicon: '/favicon-32-dark.png' },
} as const;

export const TOUCH_ICON_ID = 'apple-touch-icon';
export const FAVICON_ID = 'favicon';

/** Allinea le icone nel DOM alla modalità del sistema. Ritorna la funzione che toglie l'ascolto dei cambi. */
export function syncAppIcons(doc: Document, win: Window): () => void {
  const query = win.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const set = query.matches ? APP_ICONS.scuro : APP_ICONS.chiaro;
    doc.getElementById(TOUCH_ICON_ID)?.setAttribute('href', set.touch);
    doc.getElementById(FAVICON_ID)?.setAttribute('href', set.favicon);
  };
  apply();
  query.addEventListener('change', apply);
  return () => query.removeEventListener('change', apply);
}
