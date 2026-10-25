import { expect, test } from '@playwright/test';

// Pagina Grafici (/grafici). Dati demo: oggi = sabato 24 ottobre 2026 08:30 (Europe/Rome), 60 notti.
// Progetti "iphone" (390 px: elenco di voci, una sezione per volta) e "desktop" (1280 px: tutto insieme).
// Nell'E2E il gateway non è raggiungibile: gli insight arrivano dalle regole (badge "Regole").

const isPhone = (name: string) => name === 'iphone';

test('un solo h1 "Grafici", nessun errore e nessun testo rotto', async ({ page }) => {
  const response = await page.goto('/grafici');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Grafici' })).toHaveCount(1);
  const body = await page.locator('main#contenuto').innerText();
  expect(body).not.toMatch(/NaN|undefined|\bnull\b/);
  await expect(page.getByRole('navigation', { name: 'Principale' }).locator('[aria-current="page"]')).toHaveText('Grafici');
});

test('PC: DurationChart, Heatmap e tabella delle correlazioni sono visibili insieme', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'Vista larga: solo PC');
  await page.goto('/grafici');
  await expect(page.getByText('Durata e debito, ultime 14 notti', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Giorni della settimana', level: 3 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Cosa si lega a qualità, energia e umore' })).toBeVisible();
  await expect(page.getByText('Sono indizi, non cause.')).toBeVisible();
  await expect(page.getByText('Trend mensile')).toBeVisible();
  await expect(page.getByLabel('Previsione di energia')).toBeVisible();
  await expect(page.getByText(/Stima su \d+ notti/)).toBeVisible();
  await expect(page.getByText('Ultimi sonnellini')).toBeVisible();
  // L'elenco delle voci è solo per il telefono.
  await expect(page.getByRole('list', { name: 'Sezioni dei grafici' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Indietro' })).toHaveCount(0);
});

test('PC: la copertura è sempre visibile', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'Vista larga: solo PC');
  await page.goto('/grafici');
  await expect(page.getByText(/Calcolata su 12 su 14 notti/)).toBeVisible();
});

test('telefono: elenco di sette voci, una sezione per volta con Indietro', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'Elenco di voci: solo telefono');
  await page.goto('/grafici');
  const list = page.getByRole('list', { name: 'Sezioni dei grafici' });
  await expect(list).toBeVisible();
  for (const title of ['Insight', 'Durata e debito', 'Giorni della settimana', 'Fattori', 'Trend', 'Domani', 'Sonnellini']) {
    await expect(list.getByRole('button', { name: new RegExp(`^${title}`) })).toBeVisible();
  }
  // Nessun grafico è visibile finché non si apre una voce.
  await expect(page.getByText('Durata e debito, ultime 14 notti', { exact: true })).toBeHidden();

  await list.getByRole('button', { name: /^Durata e debito/ }).click();
  await expect(page.getByText('Durata e debito, ultime 14 notti', { exact: true })).toBeVisible();
  await expect(list).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'Durata e debito' })).toBeVisible();
  // Una sola sezione alla volta: la heatmap resta nascosta.
  await expect(page.getByRole('heading', { name: 'Giorni della settimana', level: 3 })).toBeHidden();

  await page.getByRole('button', { name: 'Indietro' }).filter({ visible: true }).click();
  await expect(list).toBeVisible();
  await expect(page.getByText('Durata e debito, ultime 14 notti', { exact: true })).toBeHidden();
});

test('telefono: la sezione Fattori mostra la tabella come indizi', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'Elenco di voci: solo telefono');
  await page.goto('/grafici');
  await page.getByRole('button', { name: /^Fattori/ }).click();
  await expect(page.getByRole('table', { name: 'Cosa si lega a qualità, energia e umore' })).toBeVisible();
  await expect(page.getByText('Sono indizi, non cause.')).toBeVisible();
});

test('la pagina si carica anche con il gateway non raggiungibile: insight a regole', async ({ page }, testInfo) => {
  await page.goto('/grafici');
  if (isPhone(testInfo.project.name)) {
    await page.getByRole('button', { name: /^Insight/ }).click();
  }
  // Gli insight arrivano dopo la pagina (Suspense): attesa breve, mai un errore.
  const badge = page.locator('article [class*="badge"]', { hasText: 'Regole' }).first();
  await expect(badge).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('article', { hasText: /aggiornato (alle \d\d:\d\d|di recente)/ }).first()).toBeVisible();
  await expect(page.getByText('Sto preparando gli indizi…')).toBeHidden();
});
