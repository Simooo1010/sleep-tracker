import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE, createSessionCookieValue } from '../src/lib/auth';
import { config, isPublicPath, proxy } from '../src/proxy';

const PASSWORD = 'prova-password-12345';
const ORIGIN = 'http://localhost:3000';

function req(path: string, init: { method?: string; cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (init.cookie !== undefined) headers.set('cookie', `${SESSION_COOKIE}=${init.cookie}`);
  return new NextRequest(`${ORIGIN}${path}`, { method: init.method ?? 'GET', headers });
}

const passes = (res: Response) => res.headers.get('x-middleware-next') === '1';
const location = (res: Response) => res.headers.get('location');

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('APP_AUTH', undefined);
  vi.stubEnv('APP_LOGIN_PASSWORD', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('proxy — modo off', () => {
  beforeEach(() => vi.stubEnv('APP_AUTH', 'off'));

  it('passa tutto, anche le Server Actions', async () => {
    expect(passes(await proxy(req('/')))).toBe(true);
    expect(passes(await proxy(req('/storico')))).toBe(true);
    expect(passes(await proxy(req('/', { method: 'POST' })))).toBe(true);
  });

  it('APP_AUTH=off in produzione NON spegne il controllo (fail-closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await proxy(req('/'));
    expect(passes(res)).toBe(false);
    expect(res.status).toBe(307);
    expect(new URL(location(res) ?? '').pathname).toBe('/login');
  });
});

describe('proxy — modo closed (password non configurata)', () => {
  it('redirect a /login senza next', async () => {
    const res = await proxy(req('/regolarita?x=1'));
    expect(res.status).toBe(307);
    const url = new URL(location(res) ?? '');
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe('/login');
    expect(url.search).toBe('');
  });

  it('password troppo corta → closed', async () => {
    vi.stubEnv('APP_LOGIN_PASSWORD', 'breve');
    const res = await proxy(req('/'));
    expect(new URL(location(res) ?? '').pathname).toBe('/login');
  });

  it('un cookie, anche ben formato, non apre', async () => {
    const cookie = await createSessionCookieValue(PASSWORD, Date.now());
    const res = await proxy(req('/', { cookie }));
    expect(passes(res)).toBe(false);
    expect(res.status).toBe(307);
  });

  it('Server Actions → 401 JSON', async () => {
    const res = await proxy(req('/', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'Accesso richiesto.' });
  });

  it('i percorsi esclusi passano comunque', async () => {
    expect(passes(await proxy(req('/login')))).toBe(true);
    expect(passes(await proxy(req('/api/events', { method: 'POST' })))).toBe(true);
  });
});

describe('proxy — modo on', () => {
  beforeEach(() => vi.stubEnv('APP_LOGIN_PASSWORD', PASSWORD));

  it('senza cookie: redirect a /login?next=<percorso>', async () => {
    const res = await proxy(req('/'));
    expect(res.status).toBe(307);
    const url = new URL(location(res) ?? '');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe('/');

    const deep = new URL(location(await proxy(req('/storico?mese=2026-10'))) ?? '');
    expect(deep.searchParams.get('next')).toBe('/storico?mese=2026-10');
  });

  it('toglie _rsc dal percorso di ritorno', async () => {
    const url = new URL(location(await proxy(req('/grafici?_rsc=abc'))) ?? '');
    expect(url.searchParams.get('next')).toBe('/grafici');
  });

  it('il percorso di ritorno è sempre relativo e sicuro', async () => {
    for (const path of ['//evil.com', '/\\evil.com']) {
      const res = await proxy(req(path));
      if (res.status === 307) {
        const next = new URL(location(res) ?? '').searchParams.get('next');
        expect(next === '/' || (next?.startsWith('/') && !next.startsWith('//'))).toBe(true);
      }
    }
  });

  it('cookie valido → passa', async () => {
    const cookie = await createSessionCookieValue(PASSWORD, Date.now());
    expect(passes(await proxy(req('/', { cookie })))).toBe(true);
    expect(passes(await proxy(req('/storico', { cookie })))).toBe(true);
    expect(passes(await proxy(req('/', { cookie, method: 'POST' })))).toBe(true);
  });

  it('cookie scaduto, manomesso, di un\'altra password o strano → redirect', async () => {
    const good = await createSessionCookieValue(PASSWORD, Date.now());
    const expired = await createSessionCookieValue(PASSWORD, Date.now() - 100_000, 1000);
    const other = await createSessionCookieValue('un-altra-password-lunga', Date.now());
    const flipped = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a');
    for (const cookie of [expired, other, flipped, 'garbage', '', 'v1..']) {
      const res = await proxy(req('/', { cookie }));
      expect(res.status, cookie).toBe(307);
      expect(new URL(location(res) ?? '').pathname).toBe('/login');
    }
  });

  it('non-GET senza sessione → 401 JSON, mai redirect', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await proxy(req('/sera', { method }));
      expect(res.status, method).toBe(401);
      expect(location(res)).toBeNull();
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
      expect(await res.json()).toEqual({ ok: false, error: 'Accesso richiesto.' });
    }
  });

  it('non-GET con cookie scaduto → 401', async () => {
    const expired = await createSessionCookieValue(PASSWORD, Date.now() - 100_000, 1000);
    expect((await proxy(req('/', { method: 'POST', cookie: expired }))).status).toBe(401);
  });

  it('percorsi esclusi passano senza cookie', async () => {
    for (const path of [
      '/login',
      '/login?next=/',
      '/api/events',
      '/_next/static/chunks/a.js',
      '/_next/image?url=x',
      '/favicon.ico',
      '/favicon-32.png',
      '/manifest.webmanifest',
      '/apple-touch-icon.png',
      '/icon-192.png',
      '/icon-512.png',
      '/apple-touch-icon-dark.png',
      '/favicon-32-dark.png',
      '/icon-192-dark.png',
      '/icon-512-dark.png',
      '/mark.svg',
      '/robots.txt',
    ]) {
      expect(passes(await proxy(req(path))), path).toBe(true);
    }
    expect(passes(await proxy(req('/login', { method: 'POST' })))).toBe(true);
    expect(passes(await proxy(req('/api/events', { method: 'POST' })))).toBe(true);
  });

  it('niente scorciatoie: percorsi simili a quelli esclusi sono protetti', async () => {
    for (const path of [
      '/login-evil',
      '/login/../storico',
      '/api/events/extra',
      '/api/other',
      '/api',
      '/_nextfoo',
      '/favicon.ico.evil',
      '/robots.txt/x',
      '/segnali',
      '/impostazioni',
    ]) {
      if (isPublicPath(new URL(`${ORIGIN}${path}`).pathname)) continue;
      const res = await proxy(req(path));
      expect(passes(res), path).toBe(false);
    }
    expect(isPublicPath('/login-evil')).toBe(false);
    expect(isPublicPath('/api/events/extra')).toBe(false);
    expect(isPublicPath('/_nextfoo')).toBe(false);
    expect(isPublicPath('/segnali')).toBe(false);
  });

  it('data di sistema usata: cookie valido oggi, scaduto tra 31 giorni', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T08:00:00Z'));
    const cookie = await createSessionCookieValue(PASSWORD, Date.now());
    expect(passes(await proxy(req('/', { cookie })))).toBe(true);
    vi.setSystemTime(new Date('2026-11-26T08:00:00Z'));
    expect((await proxy(req('/', { cookie }))).status).toBe(307);
  });
});

describe('config.matcher', () => {
  it('copre le pagine e non gli asset statici di Next', () => {
    expect(config.matcher).toHaveLength(1);
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test('/')).toBe(true);
    expect(re.test('/storico')).toBe(true);
    expect(re.test('/api/events')).toBe(true);
    expect(re.test('/_next/static/x.js')).toBe(false);
    expect(re.test('/_next/image')).toBe(false);
  });
});

describe('service worker', () => {
  it('/sw.js è pubblico (altrimenti il browser lo riceverebbe come redirect al login)', () => {
    expect(isPublicPath('/sw.js')).toBe(true);
    expect(isPublicPath('/sw.js/extra')).toBe(false);
  });
});
