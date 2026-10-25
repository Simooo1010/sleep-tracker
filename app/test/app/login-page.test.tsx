import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => jar }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('@/app/login/actions', () => ({ actionLogin: async () => undefined, actionLogout: async () => undefined }));

import LoginPage from '@/app/login/page';
import { createSessionCookieValue } from '@/lib/auth';

const PASSWORD = 'prova-password-12345';

async function render(params: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('APP_AUTH', undefined);
  vi.stubEnv('APP_LOGIN_PASSWORD', PASSWORD);
  jar.get.mockReturnValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('pagina di accesso', () => {
  it('modo on: h1, campo password con etichetta e un solo pulsante pieno "Entra"', async () => {
    const html = await render();
    expect(html).toContain('<h1');
    expect(html).toContain('Accesso');
    expect(html).toMatch(/<label[^>]*for="password"[^>]*>Password<\/label>/);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toContain('type="password"');
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toContain('>Entra<');
    expect(html).not.toContain('role="alert"');
  });

  it('errore: messaggio calmo in role="alert"', async () => {
    const html = await render({ errore: '1' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Password non corretta.');
  });

  it('next ostile viene sanitizzato nel campo nascosto', async () => {
    expect(await render({ next: 'https://evil.com' })).toContain('name="next" value="/"');
    expect(await render({ next: '//evil.com' })).toContain('name="next" value="/"');
    expect(await render({ next: '/storico' })).toContain('name="next" value="/storico"');
  });

  it('modo closed: spiega la configurazione e non mostra il form', async () => {
    vi.stubEnv('APP_LOGIN_PASSWORD', undefined);
    const html = await render();
    expect(html).toContain('Accesso non configurato.');
    expect(html).toContain('APP_LOGIN_PASSWORD');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="password"');
  });

  it('modo off: redirect a /', async () => {
    vi.stubEnv('APP_AUTH', 'off');
    await expect(render()).rejects.toThrow('NEXT_REDIRECT:/');
  });

  it('già dentro: niente form, solo "Esci" secondario', async () => {
    jar.get.mockReturnValue({ value: await createSessionCookieValue(PASSWORD, Date.now()) });
    const html = await render({ next: '/storico' });
    expect(html).not.toContain('type="password"');
    expect(html).toContain('>Esci<');
    expect(html).toContain('href="/storico"');
    expect(html.match(/btn-primary/g)).toHaveLength(1);
  });
});
