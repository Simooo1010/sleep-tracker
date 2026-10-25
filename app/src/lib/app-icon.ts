/**
 * Icona dell'app in modalità scura (sfondo `--ground` del tema scuro al posto del bianco, stesso segno).
 * Safari ignora `media` su `apple-touch-icon` (l'icona si scarica una volta, quando si aggiunge alla Home),
 * quindi si sceglie l'`href` da script in base alla modalità del sistema, prima che l'utente possa condividere/aggiungere.
 * File in `public/`, copie di `docs/design/logo/`.
 */

export const APP_ICONS = {
  chiaro: { touch: '/apple-touch-icon.png', favicon: '/favicon-32.png' },
  scuro: { touch: '/apple-touch-icon-dark.png', favicon: '/favicon-32-dark.png' },
} as const;

export const TOUCH_ICON_ID = 'apple-touch-icon';
export const FAVICON_ID = 'favicon';

/** Script inline per `<head>`, dopo i `<link>` delle icone: allinea le icone alla modalità del sistema e la segue nei cambi. */
export const iconInitScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var i=${JSON.stringify(APP_ICONS)};var a=function(){var s=m.matches?i.scuro:i.chiaro;var t=document.getElementById('${TOUCH_ICON_ID}');var f=document.getElementById('${FAVICON_ID}');if(t)t.setAttribute('href',s.touch);if(f)f.setAttribute('href',s.favicon)};a();if(m.addEventListener)m.addEventListener('change',a)}catch(e){}})();`;
