import { expect, test, type Page } from '@playwright/test';

// Guscio comune: navigazione responsive, interruttore del tema, link "Salta al contenuto".
// Il progetto "iphone" (390 px) mostra la pillola; "desktop" (1280 px) la barra laterale.

const isPhone = (name: string) => name === 'iphone';

const dataTheme = (page: Page) => page.locator('html').getAttribute('data-theme');

test('telefono: pillola visibile, barra laterale no; PC il contrario', async ({ page }, testInfo) => {
  await page.goto('/');
  const navs = page.getByRole('navigation', { name: 'Principale' });
  const pill = page.locator('nav.navpill');
  const side = page.locator('nav.side');

  if (isPhone(testInfo.project.name)) {
    await expect(pill).toBeVisible();
    await expect(side).toBeHidden();
    await expect(navs).toHaveCount(1); // la barra nascosta non è esposta ai lettori di schermo
    await expect(pill.getByRole('link')).toHaveCount(5);
    // Segnali e Impostazioni: pulsanti nella riga in alto, titolo della sezione.
    await expect(page.getByRole('link', { name: 'Segnali' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Impostazioni' })).toBeVisible();
    await expect(page.getByText('Notte', { exact: true }).first()).toBeVisible();
    // La pillola sta staccata dai bordi (14px laterali) e in fondo.
    const box = await pill.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(14 - 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 - 16 + 1);
  } else {
    await expect(side).toBeVisible();
    await expect(pill).toBeHidden();
    await expect(navs).toHaveCount(1);
    await expect(side.getByRole('link')).toHaveCount(7);
    const sideBox = await side.boundingBox();
    expect(sideBox!.width).toBeGreaterThanOrEqual(239);
    expect(sideBox!.width).toBeLessThanOrEqual(241);
    // Il contenuto sta a destra della barra laterale.
    const main = await page.locator('main#contenuto').boundingBox();
    expect(main!.x).toBeGreaterThanOrEqual(sideBox!.x + sideBox!.width);
  }
});

test('la voce attiva è segnata con aria-current', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principale' });
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Notte');
});

test('il contenuto lascia 120px in fondo su telefono e la pillola non lo copre', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/');
  const padding = await page.locator('main#contenuto').evaluate((el) => {
    const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return parseFloat(getComputedStyle(el).paddingBottom) / rootFont;
  });
  expect(padding).toBeCloseTo(7.5, 1);
});

test('l\'interruttore del tema cambia data-theme e lo ricorda dopo il ricaricamento', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await dataTheme(page)).toBe('chiaro');

  const toggle = page.getByRole('button', { name: /^Tema chiaro, passa al tema scuro/ });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
  await expect(page.getByRole('button', { name: /^Tema scuro, passa al tema chiaro/ })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(22, 26, 34)');

  // Persiste al ricaricamento, anche se il sistema è chiaro, e senza flash (applicato prima del paint).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
  await expect(page.getByRole('button', { name: /^Tema scuro, passa al tema chiaro/ })).toBeVisible();

  // Si può tornare indietro e anche questo è ricordato.
  await page.getByRole('button', { name: /^Tema scuro, passa al tema chiaro/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chiaro');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chiaro');
});

test('senza scelta manuale il tema segue il sistema, con la scelta no', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chiaro');

  await page.getByRole('button', { name: /^Tema chiaro, passa al tema scuro/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
});

test('con localStorage che lancia la pagina si apre e il tema si cambia comunque', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chiaro');
  await page.getByRole('button', { name: /^Tema chiaro, passa al tema scuro/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
  expect(errors).toEqual([]);
});

test('nessuno scorrimento orizzontale', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
});

test('il link "Salta al contenuto" è il primo con Tab, compare e porta al contenuto', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Salta al contenuto' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenuto$/);
  await expect(page.locator('main#contenuto')).toBeFocused();
});

test('ordine di Tab: salta al contenuto, poi navigazione', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  // Dopo il link di salto: su telefono i comandi in alto (Segnali), su PC la prima voce della barra laterale.
  const next = isPhone(testInfo.project.name)
    ? page.getByRole('link', { name: 'Segnali' })
    : page.locator('nav.side').getByRole('link', { name: 'Notte' });
  await expect(next).toBeFocused();
});
