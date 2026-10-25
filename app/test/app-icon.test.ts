import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { APP_ICONS, FAVICON_ID, TOUCH_ICON_ID, iconInitScript } from '../src/lib/app-icon';

const publicDir = join(import.meta.dirname, '..', 'public');

describe('icone chiaro/scuro', () => {
  it.each(Object.values(APP_ICONS).flatMap((i) => [i.touch, i.favicon]))('%s esiste in public/', (src) => {
    expect(existsSync(join(publicDir, src))).toBe(true);
  });

  it('la variante scura ha le dimensioni attese e sfondo scuro', () => {
    const png = readFileSync(join(publicDir, 'apple-touch-icon-dark.png'));
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe('180x180');
    expect(readFileSync(join(__dirname, '..', '..', 'docs/design/logo/app-icon-dark.svg'), 'utf8')).toContain('fill="#161a22"');
  });

  function run(dark: boolean) {
    const attrs: Record<string, string> = {};
    const el = (id: string) => ({ setAttribute: (_: string, v: string) => (attrs[id] = v) });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: dark, addEventListener: () => undefined }) });
    vi.stubGlobal('document', { getElementById: (id: string) => el(id) });
    new Function(iconInitScript)();
    vi.unstubAllGlobals();
    return attrs;
  }

  it('lo script sceglie le icone scure col sistema scuro e chiare altrimenti', () => {
    expect(run(true)).toEqual({ [TOUCH_ICON_ID]: APP_ICONS.scuro.touch, [FAVICON_ID]: APP_ICONS.scuro.favicon });
    expect(run(false)).toEqual({ [TOUCH_ICON_ID]: APP_ICONS.chiaro.touch, [FAVICON_ID]: APP_ICONS.chiaro.favicon });
  });

  it('lo script non lancia senza matchMedia', () => {
    vi.stubGlobal('window', {});
    expect(() => new Function(iconInitScript)()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
