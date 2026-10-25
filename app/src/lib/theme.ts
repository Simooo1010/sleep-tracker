/**
 * Tema dell'app (`chiaro` / `scuro`).
 * Senza scelta manuale si segue il sistema; la scelta manuale è ricordata in localStorage
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
  let dark: boolean;
  try {
    dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    dark = false;
  }
  return resolveTheme(null, dark);
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
