import { expect, test } from '@playwright/test';

// Pagina Sera (check serale). Dati demo: oggi = sabato 24 ottobre 2026 08:30 (Europe/Rome).
// Progetti: "iphone" (390 px, una domanda per schermata) e "desktop" (1280 px, una scheda con tutti i passi).

const isPhone = (name: string) => name === 'iphone';

const QUESTIONS = ['Quanto sei stanco?', "Com'è il tuo umore?", 'Cosa è successo oggi?', 'Hai fatto un sonnellino?'];

test('un solo h1 e nessun scorrimento orizzontale', async ({ page }) => {
  await page.goto('/sera');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Check serale');
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
});

test('telefono: percorre i quattro passi senza rispondere a niente e salva', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/sera');

  const main = page.locator('main#contenuto');
  for (const [i, question] of QUESTIONS.entries()) {
    // Una sola domanda per schermata.
    await expect(main.getByRole('heading', { level: 2, name: question })).toBeVisible();
    await expect(main.getByRole('heading', { level: 2 })).toHaveCount(1);
    const bar = main.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', String(i + 1));
    await expect(bar).toHaveAttribute('aria-valuemax', '4');

    if (i === 0) await expect(main.getByRole('button', { name: 'Indietro' })).toHaveCount(0);
    else await expect(main.getByRole('button', { name: 'Indietro' })).toBeVisible();

    if (i < QUESTIONS.length - 1) {
      // Nessuna risposta è obbligatoria: Avanti è sempre attivo.
      const next = main.getByRole('button', { name: 'Avanti' });
      await expect(next).toBeEnabled();
      await next.click();
      // Il focus passa al titolo del nuovo passo.
      await expect(main.getByRole('heading', { level: 2, name: QUESTIONS[i + 1] })).toBeFocused();
    }
  }

  // Ultimo passo: riepilogo e l'unico pulsante pieno.
  await expect(main.getByText('Riepilogo')).toBeVisible();
  await expect(main.locator('.btn-primary:visible')).toHaveCount(1);
  await main.getByRole('button', { name: 'Vado a dormire' }).click();

  const done = main.getByRole('status');
  await expect(done).toContainText('Buonanotte');
  await expect(done).toContainText('Check salvato.');
  await expect(main.getByRole('button', { name: 'Vado a dormire' })).toHaveCount(0);
});

test('telefono: si può tornare indietro e le risposte restano', async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo.project.name), 'solo telefono');
  await page.goto('/sera');
  const main = page.locator('main#contenuto');

  await main.getByRole('radio', { name: 'Stanchezza 4 di 5' }).click();
  await main.getByRole('button', { name: 'Avanti' }).click();
  await main.getByRole('button', { name: 'Sereno' }).click();
  await main.getByRole('button', { name: 'Indietro' }).click();
  await expect(main.getByRole('radio', { name: 'Stanchezza 4 di 5' })).toHaveAttribute('aria-checked', 'true');
  await main.getByRole('button', { name: 'Avanti' }).click();
  await expect(main.getByRole('button', { name: 'Sereno' })).toHaveAttribute('aria-pressed', 'true');
});

test('PC: una scheda con tutti i passi visibili e un solo pulsante pieno', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'solo PC');
  await page.goto('/sera');
  const main = page.locator('main#contenuto');

  await expect(main.getByRole('heading', { level: 1, name: 'Check serale' })).toBeVisible();
  await expect(main.getByRole('heading', { level: 2, name: 'Come stai stasera?' })).toBeVisible();
  for (const question of QUESTIONS) {
    await expect(main.getByRole('heading', { level: 3, name: question })).toBeVisible();
  }
  await expect(main.getByRole('progressbar')).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Avanti' })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Indietro' })).toHaveCount(0);
  await expect(main.locator('.btn-primary:visible')).toHaveCount(1);

  await expect(main.getByRole('radio')).toHaveCount(5);
  await expect(main.getByRole('button', { name: 'Neutro' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Sport' })).toBeVisible();
  await expect(main.getByRole('button', { name: '30 min' })).toBeVisible();
  await expect(main.getByText('Giornata particolare')).toBeVisible();
});

test('PC: i chip si accendono con aria-pressed e il salvataggio senza risposte funziona', async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo.project.name), 'solo PC');
  await page.goto('/sera');
  const main = page.locator('main#contenuto');

  const sport = main.getByRole('button', { name: 'Sport', exact: true });
  await expect(sport).toHaveAttribute('aria-pressed', 'false');
  await sport.click();
  await expect(sport).toHaveAttribute('aria-pressed', 'true');
  await sport.click();
  await expect(sport).toHaveAttribute('aria-pressed', 'false');

  await main.getByRole('button', { name: 'Vado a dormire' }).click();
  const done = main.getByRole('status');
  await expect(done).toContainText('Buonanotte');
  await expect(main.getByRole('button', { name: 'Vado a dormire' })).toHaveCount(0);
});

test('nessuna parola di colpa nel testo della pagina', async ({ page }) => {
  await page.goto('/sera');
  const text = (await page.locator('main#contenuto').innerText()).toLowerCase();
  for (const word of ['dimenticato', 'mancato', 'errore', 'obbligatorio']) expect(text).not.toContain(word);
});
