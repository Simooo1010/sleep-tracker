import { expect, test } from '@playwright/test';

// Storico: oggi = sabato 24 ottobre 2026 08:30 (Europe/Rome), 60 notti demo con 6 mancanti e 3 eccezioni.
// Non eseguito dall'agente: lo lancia l'orchestratore (progetti 'iphone' e 'desktop').

test('mostra ottobre 2026 con giorni colorati e scritti', async ({ page }) => {
  await page.goto('/storico');
  await expect(page.getByRole('heading', { level: 1, name: 'Storico' })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Ottobre 2026' })).toBeVisible();

  // 24 giorni passati selezionabili, ognuno con la parola di stato nel nome accessibile.
  const days = page.getByRole('button', { name: /^\S+ \d+ ottobre, / });
  await expect(days).toHaveCount(24);
  await expect(page.getByRole('button', { name: /^sabato 24 ottobre, \d+h \d{2}m, (confermata|stimata)$/ })).toBeVisible();

  // Il colore c'è (classi cell-6/7/8 o cell-miss) e accanto c'è sempre la durata scritta.
  const colored = page.locator('button.cell.cell-6, button.cell.cell-7, button.cell.cell-8');
  expect(await colored.count()).toBeGreaterThan(15);
  await expect(colored.first()).toContainText(/\d+h/);
  await expect(page.locator('button.cell-miss').first()).toContainText('—');

  // Oggi è selezionato e il dettaglio mostra la provenienza in parola.
  await expect(page.locator('button[aria-selected], [role="gridcell"][aria-selected="true"]').first()).toBeAttached();
  await expect(page.getByText(/Letto: .*Sveglia: /)).toBeVisible();
});

test('un clic su un giorno aggiorna ?d= e il dettaglio', async ({ page }) => {
  await page.goto('/storico');
  await page.getByRole('button', { name: /^martedì 13 ottobre, / }).click();
  await expect(page).toHaveURL(/\/storico\?m=2026-10&d=2026-10-13$/);
  await expect(page.getByRole('heading', { level: 4, name: /martedì 13 ottobre/i })).toBeVisible();
  await expect(page.getByRole('gridcell', { selected: true })).toHaveCount(1);
});

test('?d= nel futuro o malformato viene ignorato senza errore', async ({ page }) => {
  for (const url of ['/storico?d=2026-10-30', '/storico?m=2099-01', '/storico?m=abc&d=zzz', '/storico?m=2026-02&d=2026-02-29']) {
    const res = await page.goto(url);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Storico' })).toBeAttached();
  }
});

test('Mese precedente mostra settembre 2026; il successivo è disabilitato nel mese corrente', async ({ page }) => {
  await page.goto('/storico');
  await expect(page.getByRole('button', { name: 'Mese successivo' })).toBeDisabled();
  await page.getByRole('link', { name: 'Mese precedente' }).click();
  await expect(page).toHaveURL(/\/storico\?m=2026-09$/);
  await expect(page.getByRole('heading', { name: 'Settembre 2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^\S+ \d+ settembre, / })).toHaveCount(30);
  // Da settembre si può tornare avanti.
  await page.getByRole('link', { name: 'Mese successivo' }).click();
  await expect(page.getByRole('heading', { name: 'Ottobre 2026' })).toBeVisible();
});

test('telefono: nessun overflow orizzontale a 390px e frecce da almeno 44px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'solo telefono');
  await page.goto('/storico?d=2026-10-13');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.getByRole('link', { name: 'Mese precedente' }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // Il dettaglio sta sotto il calendario.
  const grid = await page.getByRole('grid').boundingBox();
  const detail = await page.getByRole('heading', { level: 4 }).boundingBox();
  expect(detail!.y).toBeGreaterThan(grid!.y + grid!.height - 1);
});

test('PC: calendario a sinistra e dettaglio a destra', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'solo PC');
  await page.goto('/storico?d=2026-10-13');
  const grid = await page.getByRole('grid').boundingBox();
  const detail = await page.getByRole('heading', { level: 4 }).boundingBox();
  expect(detail!.x).toBeGreaterThan(grid!.x + grid!.width - 1);
});

// Nei dati demo la sera del 7 settembre ha una nota (malattia): compare nel dettaglio della notte dell'8, in sola lettura.
test('la nota della giornata compare nel dettaglio, con la parola "Nota", e non è modificabile', async ({ page }) => {
  await page.goto('/storico?m=2026-09&d=2026-09-08');
  await expect(page.getByRole('heading', { level: 4, name: /8 settembre/i })).toBeVisible();
  await expect(page.getByText('Nota · giornata del 7 settembre')).toBeVisible();
  await expect(page.getByText(/Febbre dal pomeriggio/)).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('un giorno senza nota non mostra nessuna sezione Nota', async ({ page }) => {
  await page.goto('/storico?m=2026-09&d=2026-09-10');
  await expect(page.getByRole('heading', { level: 4, name: /10 settembre/i })).toBeVisible();
  await expect(page.getByText(/^Nota ·/)).toHaveCount(0);
});

test('il giorno del cambio d’ora è segnato nel calendario (anche se futuro) e nella legenda', async ({ page }) => {
  await page.goto('/storico');
  // Domenica 25 ottobre 2026: l'ora torna indietro. È un giorno futuro (oggi è sabato 24).
  const day = page.getByRole('gridcell', { name: /^domenica 25 ottobre, giorno futuro, cambio d'ora: un'ora in più$/ });
  await expect(day).toBeVisible();
  await expect(day.locator('svg')).toHaveCount(1); // segno vettoriale, non solo colore
  await expect(page.getByRole('list', { name: 'Legenda' })).toContainText("Orologio = cambio d'ora");
  // Nessun altro giorno del mese è segnato.
  await expect(page.locator('[aria-label*="cambio d\'ora"]')).toHaveCount(1);
});

test('marzo 2026: il passaggio all’ora legale è segnato il 29', async ({ page }) => {
  await page.goto('/storico?m=2026-03&d=2026-03-29');
  await expect(page.getByRole('button', { name: /^domenica 29 marzo, .*cambio d'ora: un'ora in meno$/ })).toBeVisible();
  await expect(page.getByText("Cambio d'ora: −1 h")).toBeVisible();
  await expect(page.getByText('Cambio applicato: la durata mostrata è quella reale.')).toBeVisible();
});
