/**
 * Tema dell'app (`chiaro` / `scuro`).
 * Di norma è automatico: segue il sistema (modalità `sistema`, anche quando il sistema cambia mentre l'app è aperta).
 * Chi vuole può forzare chiaro o scuro da Impostazioni; la scelta è ricordata in localStorage
 * (che può mancare, essere vuoto o lanciare: ogni accesso è in try/catch e non rompe mai il render).
 * Le funzioni di questo file non dipendono da React.
 */

export type Theme = 'chiaro' | 'scuro';

/** Chiave di localStorage con la scelta manuale del tema. */
export const THEME_STORAGE_KEY = 'sleep-tracker:tema';

export function isTheme(value: unknown): value is Theme {
  return value === 'chiaro' || value === 'scuro';
}

/** Tema da usare: la scelta salvata se valida, altrimenti quello del sistema. */
export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (isTheme(stored)) return stored;
  return systemDark ? 'scuro' : 'chiaro';
}

/** Modalità scelta dall'utente in Impostazioni: `sistema` (predefinita, automatica) oppure un tema fisso. */
export type ThemeMode = 'sistema' | Theme;

/** Evento interno: avvisa i componenti che la modalità è cambiata (l'evento `storage` arriva solo dalle altre schede). */
export const THEME_MODE_EVENT = 'sleep-tracker:modalita-tema';

/** Per `useSyncExternalStore`: si avvisa a ogni cambio di modalità, anche da un'altra scheda. */
export function subscribeThemeMode(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(THEME_MODE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(THEME_MODE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Vero se il sistema chiede il tema scuro; falso se non lo si può sapere. */
function systemPrefersDark(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

/** Modalità salvata; senza scelta valida (o senza localStorage) vale `sistema`. */
export function readThemeMode(): ThemeMode {
  return readStoredTheme() ?? 'sistema';
}

/**
 * Imposta la modalità e applica subito il tema. `sistema` cancella la scelta salvata e riprende il sistema;
 * lo script in <head> continua a seguirne i cambi.
 */
export function setThemeMode(mode: ThemeMode): void {
  if (mode === 'sistema') {
    try {
      globalThis.localStorage?.removeItem(THEME_STORAGE_KEY);
    } catch {
      // localStorage non disponibile: nessuna scelta da cancellare.
    }
    applyTheme(resolveTheme(null, systemPrefersDark()));
  } else {
    storeTheme(mode);
    applyTheme(mode);
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(THEME_MODE_EVENT));
}

/** L'altro tema. */
export function nextTheme(current: Theme): Theme {
  return current === 'scuro' ? 'chiaro' : 'scuro';
}

/** Scelta salvata, oppure null se manca, non è valida o localStorage non è disponibile. */
export function readStoredTheme(): Theme | null {
  try {
    const value = globalThis.localStorage?.getItem(THEME_STORAGE_KEY) ?? null;
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

/** Ricorda la scelta. Vero se salvata, falso se localStorage non lo permette. */
export function storeTheme(theme: Theme): boolean {
  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

/** Tema oggi applicato a <html> (`data-theme`); in mancanza, quello del sistema. */
export function appliedTheme(): Theme {
  if (typeof document === 'undefined') return 'chiaro';
  const attr = document.documentElement.getAttribute('data-theme');
  if (isTheme(attr)) return attr;
  return resolveTheme(null, systemPrefersDark());
}

/** Applica il tema a <html>. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Script inline per <head>: imposta `data-theme` prima del primo paint (scelta salvata, altrimenti sistema)
 * e, finché non c'è una scelta salvata, segue i cambi del sistema. Stessa logica di `resolveTheme`.
 */
export const themeInitScript = `(function(){var d=document.documentElement,k=${JSON.stringify(THEME_STORAGE_KEY)},m=null;try{m=matchMedia('(prefers-color-scheme: dark)')}catch(e){}var r=function(){var v=null;try{v=localStorage.getItem(k)}catch(e){}return v==='chiaro'||v==='scuro'?v:(m&&m.matches?'scuro':'chiaro')};d.setAttribute('data-theme',r());if(m){try{m.addEventListener('change',function(){d.setAttribute('data-theme',r())})}catch(e){}}})();`;
