import { expect, test, type Page } from '@playwright/test';

// Pagina Notte (mattino). Dati demo: oggi = sabato 24 ottobre 2026, ore 08:30 (Europe/Rome);
// stanotte è "stimata". Il repo in memoria è unico per il server: i test che SCRIVONO (Conferma,
// Correggi) girano solo nel progetto "desktop" e si chiudono sempre con Annulla, così la notte
// torna com'era. Gli altri progetti leggono soltanto.

const isDesktop = (name: string) => name === 'desktop';
const isPhone = (name: string) => name === 'iphone';

const card = (page: Page) => page.getByRole('region', { name: 'Stanotte' });

/** "23:48" + 5 minuti → "23:53" (con giro a mezzanotte). */
function plusMinutes(time: string, delta: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (((h! * 60 + m! + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

test('la pagina ha un solo titolo e la scheda Stanotte con il badge Stimata', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Notte');
  await expect(page.getByRole('heading', { level: 2, name: 'Stanotte' })).toBeVisible();
  await expect(card(page).getByText('Stimata', { exact: true })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Conferma', exact: true })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Correggi orari' })).toBeVisible();
  // Un solo pulsante pieno nella scheda, e nessun voto di energia prima della conferma.
  await expect(card(page).locator('.btn-primary')).toHaveCount(1);
  await expect(card(page).getByRole('radiogroup')).toHaveCount(0);
});

test('nessuno scorrimento orizzontale', async ({ page }) => {
  await page.goto('/');
  await expect(card(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('telefono: in cima c’è un solo dato, la scheda Stanotte', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/');
  await expect(card(page)).toBeVisible();
  await expect(page.locator('.big:visible')).toHaveCount(1);
  await expect(card(page).locator('.big')).toHaveCount(1);
  await expect(card(page)).toBeInViewport();
  // La scheda viene prima di tutto il resto della pagina.
  const cardBox = await card(page).boundingBox();
  const otherHeading = page.getByRole('heading', { level: 2 }).filter({ hasNotText: 'Stanotte' }).first();
  if (await otherHeading.isVisible()) {
    const otherBox = await otherHeading.boundingBox();
    expect(otherBox!.y).toBeGreaterThan(cardBox!.y + cardBox!.height - 1);
  }
});

test('Conferma registra la notte e Annulla la ripristina', async ({ page }, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'scrive sul repo condiviso: solo desktop');
  await page.goto('/');
  const c = card(page);

  await c.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(c.getByText('Registrata. Grazie.')).toBeVisible();
  await expect(c.getByText('Confermata', { exact: true })).toBeVisible();
  await expect(c.getByRole('button', { name: 'Conferma', exact: true })).toHaveCount(0);
  // Dopo la conferma compare il voto di energia (facoltativo).
  await expect(c.getByRole('radiogroup', { name: 'Energia di questa mattina' })).toBeVisible();

  await c.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(c.getByText('Registrata. Grazie.')).toHaveCount(0);
  await expect(c.getByText('Stimata', { exact: true })).toBeVisible();
  await expect(c.getByRole('button', { name: 'Conferma', exact: true })).toBeVisible();

  // Il server ha davvero ripristinato la notte.
  await page.reload();
  await expect(card(page).getByText('Stimata', { exact: true })).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Conferma', exact: true })).toBeVisible();
});

test('Correggi orari: +5 minuti cambia l’orario mostrato e la conferma lo registra', async ({ page }, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'scrive sul repo condiviso: solo desktop');
  await page.goto('/');
  const c = card(page);

  await c.getByRole('button', { name: 'Correggi orari' }).click();
  const bedRow = c.getByRole('group', { name: 'Sono andato a letto' });
  const bedTime = bedRow.locator('[aria-live]');
  await expect(bedTime).toHaveText(/^\d{2}:\d{2}$/);
  const original = (await bedTime.textContent())!;
  const moved = plusMinutes(original, 5);

  await bedRow.getByRole('button', { name: 'Posticipa di 5 minuti' }).click();
  await expect(bedTime).toHaveText(moved);

  // Nel pannello c’è l’unico pulsante pieno (la Conferma della scheda lascia il posto a questa).
  await expect(c.locator('.btn-primary')).toHaveCount(1);
  await c.getByRole('button', { name: 'Conferma', exact: true }).click();
  await expect(c.getByText('Registrata. Grazie.')).toBeVisible();
  await expect(c.getByText(`Letto ${moved},`)).toBeAttached();

  // Annulla: tornano gli orari di prima.
  await c.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(c.getByText('Registrata. Grazie.')).toHaveCount(0);
  await expect(c.getByText(`Letto ${original},`)).toBeAttached();
  await page.reload();
  await expect(card(page).getByText(`Letto ${original},`)).toBeAttached();
  await expect(card(page).getByText('Stimata', { exact: true })).toBeVisible();
});

test('Chiudi lascia la notte com’è, senza scrivere nulla', async ({ page }, testInfo) => {
  test.skip(!isDesktop(testInfo.project.name), 'apre il pannello: solo desktop');
  await page.goto('/');
  const c = card(page);
  await c.getByRole('button', { name: 'Correggi orari' }).click();
  await expect(c.getByRole('group', { name: 'Correggi orari' })).toBeVisible();
  await c.getByRole('button', { name: 'Chiudi' }).click();
  await expect(c.getByRole('group', { name: 'Correggi orari' })).toHaveCount(0);
  await expect(c.getByText('Stimata', { exact: true })).toBeVisible();
});
