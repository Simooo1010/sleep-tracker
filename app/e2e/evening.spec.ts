import { expect, test } from '@playwright/test';

// Pagina Sera. Dati demo: oggi = sabato 24 ottobre 2026, 08:30 (Europe/Rome).
// Progetto "iphone": una domanda per schermata. Progetto "desktop": una scheda con tutti i passi.

const isPhone = (name: string) => name === 'iphone';

const QUESTIONS = ['Quanto sei stanco?', "Com'è il tuo umore?", 'Cosa è successo oggi?', 'Hai fatto un sonnellino?'];

test('ha un solo h1 "Check serale"', async ({ page }) => {
  await page.goto('/sera');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check serale');
});

test('telefono: si percorrono i passi senza rispondere a niente fino a "Vado a dormire"', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/sera');

  for (let i = 0; i < QUESTIONS.length; i++) {
    await expect(page.getByRole('heading', { name: QUESTIONS[i]! })).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i + 1));
    // Una sola domanda per volta.
    for (let j = 0; j < QUESTIONS.length; j++) {
      if (j !== i) await expect(page.getByRole('heading', { name: QUESTIONS[j]! })).toHaveCount(0);
    }
    if (i < QUESTIONS.length - 1) {
      // Nessun passo è obbligatorio: Avanti è sempre attivo.
      const next = page.getByRole('button', { name: 'Avanti' });
      await expect(next).toBeEnabled();
      await next.click();
      // Il focus passa al titolo del nuovo passo.
      await expect(page.getByRole('heading', { name: QUESTIONS[i + 1]! })).toBeFocused();
    }
  }

  // Ultimo passo: riepilogo e unico pulsante pieno.
  await expect(page.getByText('Riepilogo')).toBeVisible();
  await expect(page.locator('.btn-primary:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Vado a dormire' }).click();
  await expect(page.getByRole('status')).toContainText('Buonanotte');
  await expect(page.getByRole('status')).toContainText('Check salvato');
});

test('telefono: Indietro torna al passo precedente e le risposte restano', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/sera');
  await page.getByRole('radio', { name: 'Stanchezza 4 di 5' }).click();
  await expect(page.getByRole('radio', { name: 'Stanchezza 4 di 5' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByRole('heading', { name: QUESTIONS[0]! })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Stanchezza 4 di 5' })).toHaveAttribute('aria-checked', 'true');
});

test('desktop: tutti i passi sono visibili in una sola scheda con un solo pulsante pieno', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'solo PC');
  await page.goto('/sera');

  for (const q of QUESTIONS) await expect(page.getByRole('heading', { name: q })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avanti' })).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.locator('.btn-primary:visible')).toHaveCount(1);

  // Salva senza rispondere a niente.
  await page.getByRole('button', { name: 'Vado a dormire' }).click();
  await expect(page.getByRole('status')).toContainText('Buonanotte');
});

test('desktop: le risposte si selezionano e si salvano', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'solo PC');
  await page.goto('/sera');
  await page.getByRole('radio', { name: 'Stanchezza 2 di 5' }).click();
  await page.getByRole('button', { name: 'Sereno' }).click();
  await expect(page.getByRole('button', { name: 'Sereno' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '30 min' }).click();
  await expect(page.getByRole('button', { name: '30 min' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Vado a dormire' }).click();
  await expect(page.getByRole('status')).toContainText('Buonanotte');
});

test('nessuno scorrimento orizzontale', async ({ page }) => {
  await page.goto('/sera');
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
});
