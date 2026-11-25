import { expect, test, type Page } from '@playwright/test';

/*
 * L'avviso «Sei offline» e l'idratazione senza rete non si provano qui: il server di sviluppo non idrata offline
 * (runtime HMR). Sono stati verificati su una build di produzione (vedi docs/HANDOFF.md §16).
 * Lettura offline: gira sul SECONDO server (password attiva, service worker forzato con NEXT_PUBLIC_FORCE_SW).
 * Password di PROVA, non è un segreto. Ogni test ha un contesto nuovo.
 */
const PASSWORD = 'prova-password-12345';

async function signInAndWarm(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entra' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Notte di / })).toBeVisible();
  // Il precaricamento delle sezioni segna l'orario quando ha salvato almeno una pagina.
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('st-offline-synced-at')), { timeout: 30_000 }).not.toBeNull();
  // Seconda visita con il service worker già attivo: nello sviluppo i file del runtime (HMR) si salvano solo così.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /^Notte di / })).toBeVisible();
}

test('offline: le sezioni salvate si aprono senza rete', async ({ page, context }) => {
  await signInAndWarm(page);
  await page.goto('/storico');
  await expect(page.getByRole('heading', { level: 1, name: 'Storico' })).toBeAttached();
  await context.setOffline(true);
  await page.goto('/storico');
  await expect(page.getByRole('heading', { level: 1, name: 'Storico' })).toBeAttached();

  // Altre sezioni salvate in anticipo (mai visitate prima di andare offline).
  await page.goto('/regolarita');
  await expect(page.getByRole('heading', { level: 1, name: 'Regolarità' })).toBeAttached();
});

test('offline: una pagina mai salvata mostra la schermata di cortesia, non un errore del browser', async ({ page, context }) => {
  await signInAndWarm(page);
  await context.setOffline(true);
  await page.goto('/analisi?periodo=7');
  await expect(page.getByRole('heading', { name: 'Sei offline' })).toBeVisible();
  await expect(page.getByText('non è ancora stata salvata')).toBeVisible();
});

test('uscita: le copie salvate vengono cancellate e offline non si vede più nulla', async ({ page, context }) => {
  await signInAndWarm(page);
  await page.goto('/impostazioni');
  await page.getByRole('button', { name: /Sessione/ }).click();
  await page.getByRole('button', { name: 'Esci' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('st-pages')).length === 0 || (await (await caches.open((await caches.keys()).find((k) => k.startsWith('st-pages')) as string)).keys()).length === 0)).toBe(true);
  expect(await page.evaluate(() => window.localStorage.getItem('st-offline-synced-at'))).toBeNull();

  await context.setOffline(true);
  await page.goto('/storico');
  await expect(page.getByRole('heading', { name: 'Sei offline' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Storico' })).toHaveCount(0);
});
