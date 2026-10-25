import { expect, test } from '@playwright/test';

// Pagina Regolarità. Dati demo: oggi = sabato 24 ottobre 2026 08:30 (Europe/Rome), deriva del letto di circa +35 min.
// Progetti: "iphone" (390 px, un dato per volta) e "desktop" (1280 px, viste larghe).

const isPhone = (name: string) => name === 'iphone';

test('una sola intestazione h1 "Regolarità", nessun pulsante pieno', async ({ page }) => {
  await page.goto('/regolarita');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Regolarità');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('main#contenuto .btn-primary')).toHaveCount(0);
});

test('PC: confronto tra notti, cinque indicatori, deriva con badge, feriali e weekend', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'solo PC');
  await page.goto('/regolarita');

  await expect(page.getByRole('img', { name: /^Confronto tra notti: 15 notti/ })).toBeVisible();
  for (const label of ['Scarto letto', 'Scarto sveglia', 'Nella tolleranza', 'Punto medio', 'Social jet lag']) {
    await expect(page.getByRole('group', { name: label })).toBeVisible();
  }

  const drift = page.getByRole('img', { name: /^Deriva della mediana\. Deriva \+\d+ min in \d+ settimane/ });
  await expect(drift).toBeVisible();
  await expect(page.locator('figure').filter({ has: drift }).locator('.badge')).toHaveText(/^\+\d+ min in \d+ settimane$/);

  // Il titolo c'è anche nell'elenco del telefono (nascosto su PC): si guarda solo la vista larga.
  const desktop = page.locator('[data-layout="desktop"]');
  await expect(desktop.getByText('Feriali e weekend', { exact: true })).toBeVisible();
  await expect(desktop.getByRole('table', { name: /^Feriali e weekend/ })).toBeVisible();
  await expect(desktop.getByText(/^Social jet lag [+−]?\d+ min$/)).toBeVisible();
  await expect(desktop.getByText(/Calcolata su \d+ su 14 notti/).first()).toBeVisible();

  // Le voci dell'elenco del telefono non si vedono su PC.
  await expect(page.getByRole('button', { name: /Cinque indicatori/ })).toBeHidden();
});

test('telefono: un solo numero grande con il badge di deriva, poi le voci elenco', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/regolarita');

  const big = page.locator('.display-lg:visible');
  await expect(big).toHaveCount(1);
  await expect(big).toHaveText(/^\d+ su \d+$/);
  await expect(page.getByText(/^Deriva \+\d+ min in \d+ settimane$/)).toBeVisible();
  await expect(page.getByText(/Calcolata su \d+ su 14 notti/).first()).toBeVisible();

  // I grafici stanno dietro le voci, non nella schermata principale.
  await expect(page.getByRole('img', { name: /^Confronto tra notti/ })).toBeHidden();
  for (const title of ['Confronto tra notti', 'Cinque indicatori', 'Deriva del letto', 'Feriali e weekend']) {
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible();
  }
});

test('telefono: una voce apre il grafico a tutto schermo e "Indietro" riporta all’elenco', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/regolarita');

  await page.getByRole('button', { name: /Deriva del letto/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Deriva del letto' })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Deriva della mediana/ })).toBeVisible();
  const back = page.getByRole('button', { name: 'Indietro' });
  await expect(back).toBeVisible();
  const backBox = await back.boundingBox();
  const heading = await page.getByRole('heading', { level: 2 }).boundingBox();
  expect(backBox!.y).toBeLessThan(heading!.y);

  await back.click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cinque indicatori/ })).toBeVisible();

  await page.getByRole('button', { name: /Confronto tra notti/ }).click();
  await expect(page.getByRole('img', { name: /^Ultime 14 notti e stanotte: 15 notti/ })).toBeVisible();
});

test('nessuno scorrimento orizzontale, anche con ogni sezione aperta', async ({ page }, testInfo) => {
  const overflow = () =>
    page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));

  await page.goto('/regolarita');
  let o = await overflow();
  expect(o.scroll).toBeLessThanOrEqual(o.client);

  if (isPhone(testInfo.project.name)) {
    for (const title of ['Confronto tra notti', 'Cinque indicatori', 'Deriva del letto', 'Feriali e weekend']) {
      await page.getByRole('button', { name: new RegExp(title) }).click();
      o = await overflow();
      expect(o.scroll, title).toBeLessThanOrEqual(o.client);
      await page.getByRole('button', { name: 'Indietro' }).click();
    }
  }
});

// Confronto tra notti (NightBars) su telefono molto stretto: iPhone SE a 320×640. Il viewport si fissa alla
// creazione del contesto, così l'emulazione mobile allarga il layout viewport se il contenuto sborda.
test.describe('320 px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('telefono: "Confronto tra notti" sta in 320 px, senza scroll e con le ore dell’asse leggibili', async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'solo telefono');
    await page.goto('/regolarita');
    await page.getByRole('button', { name: /Confronto tra notti/ }).click();

    const chart = page.getByRole('img', { name: /^Ultime 14 notti e stanotte: 15 notti/ });
    await expect(chart).toBeVisible();

    const o = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(o.inner).toBe(320);
    expect(o.scroll).toBeLessThanOrEqual(320);

    // Nulla esce dalla scheda: righe, scarti e badge sono tutti dentro la figura (nessun contenuto tagliato).
    const geometry = await chart.evaluate((grid) => {
      const fig = grid.closest('figure')!.getBoundingClientRect();
      const outside = Array.from(grid.querySelectorAll('*'))
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && (b.left < fig.left - 0.5 || b.right > fig.right + 0.5);
        })
        .map((el) => el.tagName);
      // Ore dell'asse (aria-hidden): leggibili, cioè senza sovrapporsi tra loro.
      const ticks = Array.from(grid.querySelectorAll('[aria-hidden="true"] > span')).filter((s) =>
        /^\d\d$/.test(s.textContent ?? ''),
      );
      const boxes = ticks.map((t) => t.getBoundingClientRect());
      const gaps = boxes.slice(1).map((b, i) => b.left - boxes[i]!.right);
      return { outside, labels: ticks.map((t) => t.textContent), gaps };
    });
    expect(geometry.outside).toEqual([]);
    expect(geometry.labels).toEqual(['21', '00', '03', '06', '09']);
    for (const gap of geometry.gaps) expect(gap).toBeGreaterThanOrEqual(4);

    // Le 14 notti più stanotte hanno tutte il loro esito a parole (la tabella accessibile resta completa).
    await expect(page.getByRole('table', { name: /^Ultime 14 notti e stanotte/ })).toHaveCount(1);
    await expect(chart.locator('.badge')).toHaveCount(15);
  });

  test('nessuno scorrimento orizzontale a 320 px, con ogni sezione aperta', async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), 'solo telefono');
    await page.goto('/regolarita');
    for (const title of ['Confronto tra notti', 'Cinque indicatori', 'Deriva del letto', 'Feriali e weekend']) {
      await page.getByRole('button', { name: new RegExp(title) }).click();
      const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(o.scroll, title).toBeLessThanOrEqual(320);
      expect(o.inner, title).toBe(320);
      await page.getByRole('button', { name: 'Indietro' }).click();
    }
  });
});
