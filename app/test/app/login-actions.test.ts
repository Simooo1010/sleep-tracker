import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => jar }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { actionLogin, actionLogout } from '@/app/login/actions';
import { SESSION_COOKIE, createSessionCookieValue, verifySessionCookieValue } from '@/lib/auth';
import { isAuthorized } from '@/lib/auth-server';

const PASSWORD = 'prova-password-12345';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

/** Esegue l'azione con i timer finti e restituisce l'URL del redirect (le azioni terminano sempre con redirect). */
async function redirectOf(run: () => Promise<void>): Promise<string> {
  let settled = false;
  const pending = run().then(
    () => 'nessun redirect',
    (e: Error) => e.message.replace('NEXT_REDIRECT:', ''),
  );
  void pending.then(() => {
    settled = true;
  });
  // Web Crypto risolve fuori dal ciclo dei timer finti: si alternano avanzamenti del tempo e cessioni reali.
  while (!settled) {
    await vi.advanceTimersByTimeAsync(400);
    await realTick();
  }
  return pending;
}

const realTick = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('APP_AUTH', undefined);
  vi.stubEnv('APP_LOGIN_PASSWORD', PASSWORD);
  jar.set.mockReset();
  jar.delete.mockReset();
  jar.get.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('actionLogin', () => {
  it('password giusta: imposta il cookie httpOnly valido e va a next', async () => {
    const url = await redirectOf(() => actionLogin(form({ password: PASSWORD, next: '/storico' })));
    expect(url).toBe('/storico');
    expect(jar.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = jar.set.mock.calls[0] ?? [];
    expect(name).toBe(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 3600 });
    expect(await verifySessionCookieValue(value, PASSWORD, Date.now())).toBe(true);
  });

  it('attende 400 ms anche con la password giusta', async () => {
    let done = false;
    const pending = actionLogin(form({ password: PASSWORD })).catch(() => {
      done = true;
    });
    // Attende che il controllo della password finisca e parta il timer da 400 ms.
    while (vi.getTimerCount() === 0) await realTick();
    await vi.advanceTimersByTimeAsync(399);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
  });

  it('password sbagliata: nessun cookie, redirect con errore', async () => {
    const url = await redirectOf(() => actionLogin(form({ password: 'sbagliata-sbagliata', next: '/storico' })));
    expect(url).toBe('/login?errore=1&next=%2Fstorico');
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('next assente: errore senza next', async () => {
    expect(await redirectOf(() => actionLogin(form({ password: 'no' })))).toBe('/login?errore=1');
  });

  it.each(['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)'])(
    'next ostile %s → torna a /',
    async (next) => {
      expect(await redirectOf(() => actionLogin(form({ password: PASSWORD, next })))).toBe('/');
      expect(jar.set).toHaveBeenCalledTimes(1);
    },
  );

  it('input non valido (assente, vuoto, oltre 200 caratteri, file) → errore, nessun cookie', async () => {
    for (const data of [form({}), form({ password: '' }), form({ password: 'x'.repeat(201) })]) {
      expect(await redirectOf(() => actionLogin(data))).toBe('/login?errore=1');
    }
    const withFile = new FormData();
    withFile.set('password', new Blob(['x']), 'f.txt');
    expect(await redirectOf(() => actionLogin(withFile))).toBe('/login?errore=1');
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('modo closed: nessun accesso possibile, nemmeno con la password', async () => {
    vi.stubEnv('APP_LOGIN_PASSWORD', undefined);
    expect(await redirectOf(() => actionLogin(form({ password: '' })))).toBe('/login');
    expect(await redirectOf(() => actionLogin(form({ password: 'qualunque-cosa-12' })))).toBe('/login');
    expect(jar.set).not.toHaveBeenCalled();
  });

  it('modo off: redirect a / senza cookie', async () => {
    vi.stubEnv('APP_AUTH', 'off');
    expect(await redirectOf(() => actionLogin(form({ password: PASSWORD })))).toBe('/');
    expect(jar.set).not.toHaveBeenCalled();
  });
});

describe('actionLogout', () => {
  it('cancella il cookie e va a /login', async () => {
    expect(await redirectOf(() => actionLogout())).toBe('/login');
    expect(jar.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});

describe('isAuthorized', () => {
  it("'off' → true senza leggere i cookie", async () => {
    vi.stubEnv('APP_AUTH', 'off');
    expect(await isAuthorized()).toBe(true);
    expect(jar.get).not.toHaveBeenCalled();
  });

  it("'closed' → false anche con un cookie ben formato", async () => {
    vi.stubEnv('APP_LOGIN_PASSWORD', undefined);
    jar.get.mockReturnValue({ value: await createSessionCookieValue(PASSWORD, Date.now()) });
    expect(await isAuthorized()).toBe(false);
  });

  it("'off' ignorato in produzione", async () => {
    vi.stubEnv('APP_AUTH', 'off');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_LOGIN_PASSWORD', undefined);
    expect(await isAuthorized()).toBe(false);
  });

  it("'on': cookie valido → true; assente, scaduto o errato → false", async () => {
    jar.get.mockReturnValue({ value: await createSessionCookieValue(PASSWORD, Date.now()) });
    expect(await isAuthorized()).toBe(true);
    jar.get.mockReturnValue(undefined);
    expect(await isAuthorized()).toBe(false);
    jar.get.mockReturnValue({ value: await createSessionCookieValue(PASSWORD, Date.now() - 1e10, 1000) });
    expect(await isAuthorized()).toBe(false);
    jar.get.mockReturnValue({ value: await createSessionCookieValue('altra-password-lunga', Date.now()) });
    expect(await isAuthorized()).toBe(false);
  });

  it('se cookies() lancia → false (fail-closed)', async () => {
    jar.get.mockImplementation(() => {
      throw new Error('fuori da una richiesta');
    });
    expect(await isAuthorized()).toBe(false);
  });
});
