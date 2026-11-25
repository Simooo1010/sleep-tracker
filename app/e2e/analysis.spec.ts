import { expect, test } from '@playwright/test';

// Pagina Analisi (/analisi). Dati demo: oggi = sabato 24 ottobre 2026 08:30 (Europe/Rome).
// Progetti "iphone" (390 px: blocchi in colonna), "desktop" (1280 px) e "uhd" (3840 px: griglia a più colonne).
// Nell'E2E il gateway non è raggiungibile: il racconto arriva dalle regole.

const isPhone = (name: string) => name === 'iphone';

test('un solo h1 "Analisi", nessun errore e nessun testo rotto', async ({ page }) => {
  const response = await page.goto('/analisi');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Analisi' })).toHaveCount(1);
  const body = await page.locator('main#contenuto').innerText();
  expect(body).not.toMatch(/NaN|undefined|\bnull\b|Infinity/);
  for (const t of ['Le tue notti', 'Perché', 'Cosa cambiare', 'Domani', 'Il racconto', 'Su quali dati']) {
    await expect(page.getByRole('heading', { level: 2, name: t, exact: true })).toBeVisible();
  }
  await expect(page.locator('main .btn-primary')).toHaveCount(0);
});

test('la voce Analisi è attiva nella navigazione', async ({ page }, testInfo) => {
  await page.goto('/analisi');
  if (isPhone(testInfo.project.name)) {
    // Su telefono Analisi è un pulsante in alto; nella pillola nessuna voce è attiva.
    await expect(page.getByRole('link', { name: 'Analisi', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('nav.navpill [aria-current="page"]')).toHaveCount(0);
  } else {
    const nav = page.getByRole('navigation', { name: 'Principale' });
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Analisi');
  }
});

test('il selettore del periodo cambia URL e contenuto', async ({ page }) => {
  await page.goto('/analisi');
  const group = page.getByRole('group', { name: 'Periodo dell’analisi' });
  await expect(group.getByRole('link')).toHaveCount(3);
  await expect(group.getByRole('link', { name: '14 notti' })).toHaveAttribute('aria-current', 'page');
  const coverage = page.locator('[data-section="copertura"]');
  await expect(coverage).toContainText(/su 14 notti/);

  await group.getByRole('link', { name: '30 notti' }).click();
  await expect(page).toHaveURL(/\/analisi\?periodo=30$/);
  await expect(group.getByRole('link', { name: '30 notti' })).toHaveAttribute('aria-current', 'page');
  await expect(group.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(coverage).toContainText(/su 30 notti/);

  await group.getByRole('link', { name: '7 notti' }).click();
  await expect(page).toHaveURL(/\/analisi\?periodo=7$/);
  await expect(coverage).toContainText(/su 7 notti/);
});

test('un periodo non valido torna a 14 notti', async ({ page }) => {
  await page.goto('/analisi?periodo=99');
  await expect(page.getByRole('heading', { level: 1, name: 'Analisi' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Periodo dell’analisi' }).getByRole('link', { name: '14 notti' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('il selettore ha voci da almeno 44 px', async ({ page }) => {
  await page.goto('/analisi');
  for (const link of await page.getByRole('group', { name: 'Periodo dell’analisi' }).getByRole('link').all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('telefono: blocchi in colonna, tutti visibili senza aprire nulla', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/analisi');
  const sections = page.locator('main [data-section]');
  const count = await sections.count();
  expect(count).toBeGreaterThanOrEqual(6);
  let lastBottom = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const box = (await sections.nth(i).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(lastBottom);
    lastBottom = box.y + box.height;
  }
  await expect(page.getByRole('button', { name: 'Indietro' })).toHaveCount(0);
});

test('PC e 4K: più colonne affiancate, contenuto entro content-max', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'solo PC');
  // Senza animazioni di entrata: lo spostamento in corso falserebbe le coordinate.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/analisi');
  const perche = (await page.locator('[data-section="perche"]').boundingBox())!;
  const azioni = (await page.locator('[data-section="cosa-cambiare"]').boundingBox())!;
  expect(Math.round(perche.y)).toBe(Math.round(azioni.y));
  expect(azioni.x).toBeGreaterThan(perche.x);
  const main = (await page.locator('main#contenuto').boundingBox())!;
  expect(main.width).toBeLessThanOrEqual(1480 + 1);
  if (testInfo.project.name === 'uhd') {
    // Su 4K tre colonne: anche la previsione sta sulla stessa riga.
    const domani = (await page.locator('[data-section="domani"]').boundingBox())!;
    expect(Math.round(domani.y)).toBe(Math.round(perche.y));
  }
});

test('nessuno scorrimento orizzontale', async ({ page }) => {
  await page.goto('/analisi');
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(o.scroll).toBeLessThanOrEqual(o.client);
});

test('entrata morbida, disattivata con prefers-reduced-motion', async ({ page }) => {
  const animation = () =>
    page.locator('[data-section="perche"]').evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, duration: parseFloat(s.animationDuration) };
    });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/analisi');
  const on = await animation();
  expect(on.name).not.toBe('none');
  expect(on.duration).toBeLessThanOrEqual(0.2);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/analisi');
  expect((await animation()).name).toBe('none');
  await expect(page.locator('[data-section="perche"]')).toHaveCSS('opacity', '1');
});

test('il racconto arriva anche con il gateway non raggiungibile', async ({ page }) => {
  await page.goto('/analisi');
  const racconto = page.locator('[data-section="racconto"]');
  await expect(racconto.locator('article').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Sto preparando il racconto…')).toBeHidden();
});
