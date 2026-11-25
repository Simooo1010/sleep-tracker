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
    // Analisi, Segnali e Impostazioni: pulsanti nella riga in alto, titolo della sezione.
    await expect(page.getByRole('link', { name: 'Analisi' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Segnali' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Impostazioni' })).toBeVisible();
    await expect(page.getByText('Notte', { exact: true }).first()).toBeVisible();
    // La pillola sta staccata dai bordi (14px laterali) e in fondo.
    const box = await pill.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(14 - 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 - 14 + 1);
  } else {
    await expect(side).toBeVisible();
    await expect(pill).toBeHidden();
    await expect(navs).toHaveCount(1);
    await expect(side.getByRole('link')).toHaveCount(8);
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

// Il tema è automatico (segue il sistema); la scelta manuale sta in Impostazioni.
async function openAppearance(page: Page, testInfo: { project: { name: string } }) {
  await page.goto('/impostazioni');
  if (isPhone(testInfo.project.name)) await page.locator('main button.list-row').filter({ hasText: 'Aspetto' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Aspetto' })).toBeVisible();
}

test('nessun interruttore del tema nel guscio: né in alto né nella barra laterale', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Tema/ })).toHaveCount(0);
});

test('il tema è automatico: segue il sistema e ne segue i cambi', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(22, 26, 34)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chiaro');
});

test('Impostazioni > Aspetto: scelta fissa ricordata dopo il ricaricamento; Automatico riprende il sistema', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openAppearance(page, testInfo);
  const auto = page.getByRole('button', { name: 'Automatico', exact: true });
  await expect(auto).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Scuro', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
  await expect(page.getByRole('button', { name: 'Scuro', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  expect(await dataTheme(page)).toBe('scuro'); // persiste, anche con sistema chiaro

  await openAppearance(page, testInfo);
  await page.getByRole('button', { name: 'Automatico', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chiaro');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro'); // di nuovo adattivo
});

test('con localStorage che lancia la pagina si apre e il tema segue il sistema', async ({ page }) => {
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
  await page.emulateMedia({ colorScheme: 'dark' });
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
  // Dopo il link di salto: su telefono i comandi in alto (Analisi), su PC la prima voce della barra laterale.
  const next = isPhone(testInfo.project.name)
    ? page.getByRole('link', { name: 'Analisi' })
    : page.locator('nav.side').getByRole('link', { name: 'Notte' });
  await expect(next).toBeFocused();
});

test('telefono: Analisi, Segnali e Impostazioni stanno su una sola riga (barra in alto compatta)', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'Solo telefono');
  await page.goto('/');
  const tops = await Promise.all(
    [page.getByRole('link', { name: 'Analisi' }), page.getByRole('link', { name: 'Segnali' }), page.getByRole('link', { name: 'Impostazioni' })].map(
      async (l) => Math.round((await l.first().boundingBox())?.y ?? -1),
    ),
  );
  expect(new Set(tops).size).toBe(1);
});

test('la voce di navigazione si evidenzia subito al tocco, prima che arrivi la pagina', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'Solo telefono');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Ritarda le richieste di navigazione: l'evidenziazione non deve aspettarle.
  await page.route(/\/grafici/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const link = page.locator('nav.navpill').getByRole('link', { name: 'Grafici' });
  await link.click();
  await expect(link).toHaveAttribute('aria-current', 'page', { timeout: 500 });
});

test('telefono: il titolo sta sotto la barra di stato e la pillola è a 14px dal fondo come ai lati', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'Solo telefono');
  await page.goto('/');
  // Chromium non emula env(safe-area-inset-*): si impone il valore di un iPhone con isola (47px) e indicatore home (34px).
  await page.addStyleTag({ content: ':root{--safe-top:47px!important;--safe-bottom:34px!important}' });
  const title = await page.locator('main').evaluate(() => document.querySelector('p.title')!.getBoundingClientRect().top);
  expect(title).toBeGreaterThanOrEqual(47);
  const vh = page.viewportSize()!.height;
  const pill = (await page.locator('nav.navpill').boundingBox())!;
  expect(Math.round(vh - (pill.y + pill.height))).toBe(14);
  expect(Math.round(pill.x)).toBe(14);
  // Senza zone sicure (altri telefoni, Android, PC) il margine resta 14px.
  await page.addStyleTag({ content: ':root{--safe-top:0px!important;--safe-bottom:0px!important}' });
  const pill0 = (await page.locator('nav.navpill').boundingBox())!;
  expect(Math.round(vh - (pill0.y + pill0.height))).toBe(14);
});

test('telefono: il pulsante Analisi in alto si evidenzia subito al tocco e porta alla pagina', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'Solo telefono');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.route(/\/analisi/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const link = page.getByRole('link', { name: 'Analisi', exact: true });
  await link.click();
  await expect(link).toHaveAttribute('aria-current', 'page', { timeout: 500 });
  await expect(page).toHaveURL(/\/analisi$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Analisi' })).toHaveCount(1);
});
