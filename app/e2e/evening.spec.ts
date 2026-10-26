import { expect, test, type Locator, type Page } from '@playwright/test';

// Pagina Sera (check serale). Dati demo: oggi = sabato 24 ottobre 2026 08:30 (Europe/Rome).
// Progetti: "iphone" (390 px, una domanda per schermata) e "desktop" (1280 px, una scheda con tutti i passi).

const isPhone = (name: string) => name === 'iphone';

const QUESTIONS = ['Quanto sei stanco?', "Com'è il tuo umore?", 'Cosa è successo oggi?', 'Hai fatto un sonnellino?'];

const NOTE_LABEL = 'Descrivi la giornata (solo se è stata davvero particolare)';

/** Contatore visibile "12 su 30" (la vista nascosta, telefono o PC, ha un suo contatore uguale). */
const counter = (main: Locator, text: string) => main.locator('p:visible').filter({ hasText: new RegExp(`^${text}$`) });

/** Apre il passo 3 "Cosa è successo oggi?": su telefono con due Avanti, su PC è già visibile. */
async function goToDayStep(page: Page, phone: boolean) {
  await page.goto('/sera');
  const main = page.locator('main#contenuto');
  if (phone) {
    await main.getByRole('button', { name: 'Avanti' }).click();
    await main.getByRole('button', { name: 'Avanti' }).click();
    await expect(main.getByRole('heading', { level: 2, name: 'Cosa è successo oggi?' })).toBeVisible();
  }
  return main;
}

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

test('+ Aggiungi: campo "Altro imprevisto" con contatore, vuoti rifiutati, nuovo chip subito attivo', async ({ page }, testInfo) => {
  const main = await goToDayStep(page, isPhone(testInfo.project.name));
  await expect(main.getByRole('textbox', { name: 'Altro imprevisto' })).toHaveCount(0);

  const add = main.getByRole('button', { name: 'Aggiungi un altro imprevisto' });
  await expect(add).toHaveAttribute('aria-expanded', 'false');
  await add.click();
  await expect(add).toHaveAttribute('aria-expanded', 'true');
  const field = main.getByRole('textbox', { name: 'Altro imprevisto' });
  await expect(field).toBeFocused();
  await expect(counter(main, '0 su 30')).toBeVisible();

  // Vuoto: rifiutato con parole calme, il campo resta aperto.
  await main.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(main.getByRole('alert')).toHaveText("Scrivi il nome dell'imprevisto.");
  await expect(field).toHaveAttribute('aria-invalid', 'true');

  // Massimo 30 caratteri.
  await field.fill('x'.repeat(45));
  await expect(field).toHaveValue('x'.repeat(30));
  await expect(counter(main, '30 su 30')).toBeVisible();

  // Invio crea il chip, già attivo; il campo si chiude e il focus torna a + Aggiungi.
  await field.fill('  Cena   fuori ');
  await field.press('Enter');
  const chip = main.getByRole('button', { name: 'Cena fuori', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(main.getByRole('textbox', { name: 'Altro imprevisto' })).toHaveCount(0);
  await expect(add).toBeFocused();

  // Un nome già presente non crea un doppione: si accende quello che c'è.
  await add.click();
  await main.getByRole('textbox', { name: 'Altro imprevisto' }).fill('VIAGGIO');
  await main.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(main.getByRole('button', { name: /^viaggio$/i })).toHaveAttribute('aria-pressed', 'true');
  await add.click();
  await main.getByRole('textbox', { name: 'Altro imprevisto' }).fill('cena fuori');
  await main.getByRole('textbox', { name: 'Altro imprevisto' }).press('Enter');
  await expect(main.getByRole('button', { name: 'Cena fuori', exact: true })).toHaveCount(1);
  await expect(chip).toHaveAttribute('aria-pressed', 'true');

  // Esc chiude senza creare niente.
  await add.click();
  await main.getByRole('textbox', { name: 'Altro imprevisto' }).fill('Da buttare');
  await main.getByRole('textbox', { name: 'Altro imprevisto' }).press('Escape');
  await expect(main.getByRole('button', { name: 'Da buttare' })).toHaveCount(0);
  await expect(main.getByRole('textbox', { name: 'Altro imprevisto' })).toHaveCount(0);
});

test('descrizione della giornata: facoltativa, max 280 con contatore, sotto i chip, nessun nuovo pulsante pieno', async ({
  page,
}, testInfo) => {
  const phone = isPhone(testInfo.project.name);
  const main = await goToDayStep(page, phone);

  const note = main.getByRole('textbox', { name: NOTE_LABEL });
  await expect(note).toBeVisible();
  await expect(note).not.toHaveAttribute('required', /.*/);
  await expect(counter(main, '0 su 280')).toBeVisible();
  // Sta sotto i chip degli imprevisti.
  const chipBox = await main.getByRole('button', { name: 'Alcol', exact: true }).last().boundingBox();
  const noteBox = await note.boundingBox();
  expect(noteBox!.y).toBeGreaterThan(chipBox!.y);

  await note.fill('Cena fuori con amici, rientrato tardi.');
  await expect(counter(main, '38 su 280')).toBeVisible();
  await note.fill('y'.repeat(300));
  await expect(note).toHaveValue('y'.repeat(280));
  await expect(counter(main, '280 su 280')).toBeVisible();

  // Nessun quinto passo e un solo pulsante pieno per schermata.
  await expect(main.locator('.btn-primary:visible')).toHaveCount(phone ? 0 : 1);
  if (phone) {
    await expect(main.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4');
    await note.fill('Cena fuori con amici');
    await main.getByRole('button', { name: 'Avanti' }).click();
    // Riepilogo: la nota compare con la parola "Nota".
    await expect(main.getByText('Riepilogo')).toBeVisible();
    await expect(main.getByText('Nota', { exact: true })).toBeVisible();
    await expect(main.locator('dd:visible', { hasText: 'Cena fuori con amici' })).toBeVisible();
    await expect(main.locator('.btn-primary:visible')).toHaveCount(1);
  }
});

test('PC: imprevisto libero e nota si salvano, restano dopo il ricaricamento e poi si ripulisce', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'scrive nel repo in memoria: solo desktop');
  const main = await goToDayStep(page, false);

  await main.getByRole('button', { name: 'Aggiungi un altro imprevisto' }).click();
  await main.getByRole('textbox', { name: 'Altro imprevisto' }).fill('Cena fuori');
  await main.getByRole('textbox', { name: 'Altro imprevisto' }).press('Enter');
  await main.getByRole('textbox', { name: NOTE_LABEL }).fill('Cena fuori con amici, rientrato tardi.');
  await main.getByRole('button', { name: 'Vado a dormire' }).click();
  await expect(main.getByRole('status')).toContainText('Buonanotte');

  await page.reload();
  await expect(main.getByRole('button', { name: 'Cena fuori', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(main.getByRole('textbox', { name: NOTE_LABEL })).toHaveValue('Cena fuori con amici, rientrato tardi.');

  // Ripulisce: il repo in memoria è condiviso con gli altri test.
  await main.getByRole('button', { name: 'Cena fuori', exact: true }).click();
  await main.getByRole('textbox', { name: NOTE_LABEL }).fill('');
  await main.getByRole('button', { name: 'Vado a dormire' }).click();
  await expect(main.getByRole('status')).toContainText('Buonanotte');
  await page.reload();
  await expect(main.getByRole('button', { name: 'Cena fuori', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(main.getByRole('textbox', { name: NOTE_LABEL })).toHaveValue('');
});

test('nessuna parola di colpa nel testo della pagina', async ({ page }) => {
  await page.goto('/sera');
  const text = (await page.locator('main#contenuto').innerText()).toLowerCase();
  for (const word of ['dimenticato', 'mancato', 'errore', 'obbligatorio']) expect(text).not.toContain(word);
});
