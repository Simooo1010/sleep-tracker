import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  THEME_STORAGE_KEY,
  appliedTheme,
  applyTheme,
  isTheme,
  nextTheme,
  readStoredTheme,
  readThemeMode,
  setThemeMode,
  resolveTheme,
  storeTheme,
  themeInitScript,
} from '../src/lib/theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
  it('usa la scelta salvata quando è valida, qualunque sia il sistema', () => {
    expect(resolveTheme('chiaro', true)).toBe('chiaro');
    expect(resolveTheme('scuro', false)).toBe('scuro');
  });

  it('senza scelta segue il sistema', () => {
    expect(resolveTheme(null, true)).toBe('scuro');
    expect(resolveTheme(null, false)).toBe('chiaro');
  });

  it('ignora valori salvati non validi', () => {
    for (const bad of ['', 'dark', 'light', 'Scuro', 'undefined']) {
      expect(resolveTheme(bad, true)).toBe('scuro');
      expect(resolveTheme(bad, false)).toBe('chiaro');
    }
  });
});

describe('nextTheme e isTheme', () => {
  it('alterna i due temi', () => {
    expect(nextTheme('chiaro')).toBe('scuro');
    expect(nextTheme('scuro')).toBe('chiaro');
  });

  it('riconosce solo i due temi', () => {
    expect(isTheme('chiaro')).toBe(true);
    expect(isTheme('scuro')).toBe(true);
    expect(isTheme('dark')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    data,
  };
}

describe('readStoredTheme / storeTheme', () => {
  it('salva e rilegge la scelta', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    expect(readStoredTheme()).toBeNull();
    expect(storeTheme('scuro')).toBe(true);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('scuro');
    expect(readStoredTheme()).toBe('scuro');
  });

  it('ignora un valore salvato non valido', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [THEME_STORAGE_KEY]: 'blu' }));
    expect(readStoredTheme()).toBeNull();
  });

  it('non lancia se localStorage lancia', () => {
    const boom = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom });
    expect(readStoredTheme()).toBeNull();
    expect(storeTheme('chiaro')).toBe(false);
  });

  it('non lancia se localStorage non esiste o il solo accesso lancia', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readStoredTheme()).toBeNull();
    expect(storeTheme('chiaro')).toBe(false);

    vi.stubGlobal('localStorage', null);
    expect(readStoredTheme()).toBeNull();
    expect(storeTheme('scuro')).toBe(false);
  });
});

describe('applyTheme / appliedTheme', () => {
  it('fuori dal browser non fa nulla e vale chiaro', () => {
    expect(() => applyTheme('scuro')).not.toThrow();
    expect(appliedTheme()).toBe('chiaro');
  });

  it('applica data-theme a <html> e lo rilegge', () => {
    const attrs = new Map<string, string>();
    vi.stubGlobal('document', {
      documentElement: {
        setAttribute: (k: string, v: string) => void attrs.set(k, v),
        getAttribute: (k: string) => attrs.get(k) ?? null,
      },
    });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(appliedTheme()).toBe('scuro'); // senza attributo: sistema scuro
    applyTheme('chiaro');
    expect(attrs.get('data-theme')).toBe('chiaro');
    expect(appliedTheme()).toBe('chiaro');
  });

  it('senza attributo e con matchMedia che lancia vale chiaro', () => {
    vi.stubGlobal('document', { documentElement: { getAttribute: () => null } });
    vi.stubGlobal('matchMedia', () => {
      throw new Error('no');
    });
    expect(appliedTheme()).toBe('chiaro');
  });
});

describe('themeInitScript', () => {
  function run(opts: { stored?: string | null; dark: boolean; storageThrows?: boolean }) {
    const attrs = new Map<string, string>();
    let listener: (() => void) | undefined;
    const media = {
      matches: opts.dark,
      addEventListener: (_: string, fn: () => void) => {
        listener = fn;
      },
    };
    const localStorage = {
      getItem: () => {
        if (opts.storageThrows) throw new Error('blocked');
        return opts.stored ?? null;
      },
    };
    const document = { documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) } };
    new Function('document', 'localStorage', 'matchMedia', themeInitScript)(document, localStorage, () => media);
    return {
      theme: () => attrs.get('data-theme'),
      setSystem: (dark: boolean) => {
        media.matches = dark;
        listener?.();
      },
      hasListener: () => listener !== undefined,
    };
  }

  it('applica il sistema senza scelta salvata e lo segue nei cambi', () => {
    const page = run({ dark: false });
    expect(page.theme()).toBe('chiaro');
    page.setSystem(true);
    expect(page.theme()).toBe('scuro');
  });

  it('la scelta salvata vince sul sistema, anche quando il sistema cambia', () => {
    const page = run({ stored: 'chiaro', dark: true });
    expect(page.theme()).toBe('chiaro');
    page.setSystem(false);
    expect(page.theme()).toBe('chiaro');
  });

  it('con localStorage che lancia ripiega sul sistema', () => {
    expect(run({ dark: true, storageThrows: true }).theme()).toBe('scuro');
  });

  it('ignora valori salvati non validi', () => {
    expect(run({ stored: 'viola', dark: false }).theme()).toBe('chiaro');
  });
});

describe('modalità del tema (automatica di default, manuale in Impostazioni)', () => {
  function setup(opts: { stored?: string; dark: boolean }) {
    const data = new Map<string, string>(opts.stored ? [[THEME_STORAGE_KEY, opts.stored]] : []);
    const attrs = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
    vi.stubGlobal('document', {
      documentElement: {
        setAttribute: (k: string, v: string) => void attrs.set(k, v),
        getAttribute: (k: string) => attrs.get(k) ?? null,
      },
    });
    vi.stubGlobal('matchMedia', () => ({ matches: opts.dark }));
    return { data, attrs };
  }

  it('senza scelta salvata la modalità è "sistema"', () => {
    setup({ dark: false });
    expect(readThemeMode()).toBe('sistema');
  });

  it('una scelta fissa viene salvata e applicata, "sistema" la cancella e riprende il sistema', () => {
    const { data, attrs } = setup({ dark: true });
    setThemeMode('chiaro');
    expect(readThemeMode()).toBe('chiaro');
    expect(attrs.get('data-theme')).toBe('chiaro');
    setThemeMode('sistema');
    expect(data.has(THEME_STORAGE_KEY)).toBe(false);
    expect(readThemeMode()).toBe('sistema');
    expect(attrs.get('data-theme')).toBe('scuro'); // il sistema è scuro
  });

  it('non lancia se localStorage lancia', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
      removeItem: () => {
        throw new Error('no');
      },
    });
    vi.stubGlobal('document', { documentElement: { setAttribute: () => undefined, getAttribute: () => null } });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(readThemeMode()).toBe('sistema');
    expect(() => setThemeMode('scuro')).not.toThrow();
    expect(() => setThemeMode('sistema')).not.toThrow();
  });
});
