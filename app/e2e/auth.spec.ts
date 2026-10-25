import { expect, test, type Page } from '@playwright/test';

/*
 * Accesso con password: gira sul SECONDO server (porta E2E_AUTH_PORT, vedi playwright.config.ts) dove
 * APP_LOGIN_PASSWORD è attiva. Password di PROVA, non è un segreto. Ogni test ha un contesto nuovo (senza cookie).
 */
const PASSWORD = 'prova-password-12345';

async function signIn(page: Page, password = PASSWORD): Promise<void> {
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Entra' }).click();
}

test('senza cookie la home reindirizza a /login?next=/ e la pagina non ha navigazione', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Accesso' })).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Entra' })).toBeVisible();
  // Nessun guscio: niente navigazione, niente tema, niente link di salto.
  await expect(page.locator('nav')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Tema/ })).toHaveCount(0);
  // Un solo pulsante pieno.
  await expect(page.locator('.btn-primary')).toHaveCount(1);
});

test('una pagina interna reindirizza con il proprio percorso in next', async ({ page }) => {
  await page.goto('/storico');
  await expect(page).toHaveURL(/\/login\?next=%2Fstorico$/);
  await signIn(page);
  await expect(page).toHaveURL(/\/storico$/);
});

test('password sbagliata: messaggio calmo in role=alert e nessun cookie', async ({ page, context }) => {
  await page.goto('/login');
  await signIn(page, 'password-sbagliata-1');
  await expect(page.locator('p[role="alert"]')).toHaveText('Password non corretta.');
  await expect(page).toHaveURL(/\/login\?errore=1/);
  expect((await context.cookies()).filter((c) => c.name === 'st_session')).toHaveLength(0);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('password giusta: arriva alla home e il cookie è httpOnly', async ({ page, context }) => {
  await page.goto('/');
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /^Notte di / })).toBeVisible();
  await expect(page.locator('nav.navpill')).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name === 'st_session');
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.path).toBe('/');
  expect(cookie?.value).toMatch(/^v1\.\d+\.[0-9a-f]{64}$/);
  // Il cookie non è leggibile dalla pagina.
  expect(await page.evaluate(() => document.cookie)).not.toContain('st_session');
});

test('/api/events non fa redirect: risponde 401 (token) e le altre richieste non-GET 401 JSON', async ({ request }) => {
  const events = await request.post('/api/events', { data: { type: 'wake' }, maxRedirects: 0 });
  expect(events.status()).toBe(401);
  expect(await events.json()).toEqual({ ok: false, error: 'Non autorizzato.' });

  const action = await request.post('/', { data: {}, headers: { 'next-action': 'x' }, maxRedirects: 0 });
  expect(action.status()).toBe(401);
  expect(await action.json()).toEqual({ ok: false, error: 'Accesso richiesto.' });
});

test('i file pubblici restano raggiungibili senza accesso', async ({ request }) => {
  for (const path of ['/manifest.webmanifest', '/apple-touch-icon.png', '/favicon-32.png']) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
  }
});

test('dopo actionLogout si torna a /login e la home è di nuovo chiusa', async ({ page, context }) => {
  await page.goto('/');
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/login');
  await expect(page.getByText("Hai già effettuato l'accesso.")).toBeVisible();
  await page.getByRole('button', { name: 'Esci' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Entra' })).toBeVisible();
  expect((await context.cookies()).filter((c) => c.name === 'st_session')).toHaveLength(0);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
});

for (const next of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)']) {
  test(`next=${next} non esce dal sito: dopo l'accesso si arriva a /`, async ({ page, baseURL }) => {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await signIn(page);
    await page.waitForURL((url) => url.pathname === '/' || url.hostname !== new URL(baseURL ?? '').hostname);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL ?? '').origin);
    expect(new URL(page.url()).pathname).toBe('/');
  });
}
