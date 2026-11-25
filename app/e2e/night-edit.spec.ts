import { expect, test, type Page } from '@playwright/test';

// Modifica notte dallo Storico. Dati demo: oggi = sabato 24 ottobre 2026, ore 08:30 (Europe/Rome).
// Il repo in memoria è unico per il server: i test che SCRIVONO girano solo nel progetto "desktop".

const isDesktop = (name: string) => name === 'desktop';

/** Riempie un campo orario dopo che React ha preso in carico il campo (prima dell'idratazione il valore andrebbe perso). */
async function fillTime(page: Page, label: string, value: string) {
  const field = page.getByLabel(label);
  await expect
    .poll(() => field.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))), { timeout: 15_000 })
    .toBe(true);
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

test('la schermata di modifica si apre dallo Storico con un solo pulsante pieno', async ({ page }) => {
  await page.goto('/storico?m=2026-10&d=2026-10-13');
  await page.getByRole('link', { name: /Modifica notte|Aggiungi i dati della notte/ }).click();
  await expect(page).toHaveURL(/\/storico\/2026-10-13$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Modifica notte' })).toBeVisible();
  await expect(page.getByLabel('Sono andato a letto')).toBeVisible();
  await expect(page.getByLabel('Mi sono svegliato')).toBeVisible();
  await expect(page.locator('.btn-primary')).toHaveCount(1);
  // Senza modifiche non si può salvare: nessun salvataggio per sbaglio.
  await expect(page.getByRole('button', { name: 'Salva notte' })).toBeDisabled();
  // La voce Storico resta quella attiva nella navigazione.
  await expect(page.getByRole('link', { name: 'Storico' }).first()).toHaveAttribute('aria-current', 'page');
});

test('nessuno scroll orizzontale', async ({ page }) => {
  await page.goto('/storico/2026-10-13');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('date future o malformate danno 404', async ({ page }) => {
  for (const d of ['2026-10-30', '2099-01-01', 'abc', '2026-02-30']) {
    const res = await page.goto(`/storico/${d}`);
    expect(res?.status()).toBe(404);
  }
});

test('Da sistemare porta alla modifica di una notte recente', async ({ page }) => {
  await page.goto('/storico');
  const todo = page.getByRole('heading', { level: 2, name: 'Da sistemare' });
  test.skip((await todo.count()) === 0, 'Nessuna notte da sistemare nei dati demo.');
  const first = todo.locator('xpath=following::a[contains(@href,"/storico/2026-")][1]');
  const href = await first.getAttribute('href');
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Modifica notte' })).toBeVisible();
});

test('modificare più notti di fila: salva, ricarica e ritrova i dati', async ({ page }, info) => {
  test.skip(!isDesktop(info.project.name), 'Scrive nel repo condiviso: solo desktop.');

  // Notte del 9 ottobre: orari + qualità + un fattore e la nota della sera prima.
  await page.goto('/storico/2026-10-09');
  await fillTime(page, 'Sono andato a letto', '00:15');
  await fillTime(page, 'Mi sono svegliato', '07:45');
  await page.getByRole('radio', { name: 'Qualità 4 di 5' }).click();
  await page.getByRole('radio', { name: 'Energia 3 di 5' }).click();
  await page.getByRole('button', { name: 'Sport', exact: true }).click();
  await page.getByLabel('Nota sulla giornata').fill('Cena fuori con amici');
  await page.getByRole('button', { name: 'Salva notte' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Notte salvata.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salva notte' })).toBeDisabled();

  // Passa alla notte dopo senza tornare al calendario e modificane un'altra.
  await page.getByRole('link', { name: /Notte dopo/ }).click();
  await expect(page).toHaveURL(/\/storico\/2026-10-10$/);
  await fillTime(page, 'Sono andato a letto', '23:50');
  await fillTime(page, 'Mi sono svegliato', '07:20');
  await page.getByRole('button', { name: 'Salva notte' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Notte salvata.' })).toBeVisible();

  // Ricaricando i valori sono quelli salvati.
  await page.goto('/storico/2026-10-09');
  await expect(page.getByLabel('Sono andato a letto')).toHaveValue('00:15');
  await expect(page.getByLabel('Mi sono svegliato')).toHaveValue('07:45');
  await expect(page.getByRole('radio', { name: 'Qualità 4 di 5' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Sport', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Nota sulla giornata')).toHaveValue('Cena fuori con amici');

  // Lo Storico mostra la notte come confermata, con nota e orari.
  await page.goto('/storico?m=2026-10&d=2026-10-09');
  await expect(page.getByText('00:15 → 07:45')).toBeVisible();
  await expect(page.getByText('Cena fuori con amici')).toBeVisible();
  await expect(page.getByRole('button', { name: /^venerdì 9 ottobre, 7h 30m, confermata$/ })).toBeVisible();
});

test('modifiche non salvate: chiede conferma prima di cambiare notte', async ({ page }) => {
  await page.goto('/storico/2026-10-12');
  await page.getByRole('radio', { name: 'Energia 2 di 5' }).click();
  await page.getByRole('link', { name: /Notte prima/ }).click();
  await expect(page.getByText('Hai modifiche non salvate. Salvarle prima di spostarti?')).toBeVisible();
  await page.getByRole('button', { name: 'Resta qui' }).click();
  await expect(page).toHaveURL(/\/storico\/2026-10-12$/);
  await page.getByRole('link', { name: /Notte prima/ }).click();
  await page.getByRole('button', { name: 'Vai senza salvare' }).click();
  await expect(page).toHaveURL(/\/storico\/2026-10-11$/);
});

test('orari incoerenti: il salvataggio è bloccato e il motivo è scritto', async ({ page }) => {
  await page.goto('/storico/2026-10-12');
  await fillTime(page, 'Sono andato a letto', '08:00');
  await fillTime(page, 'Mi sono svegliato', '07:00');
  await expect(page.getByText(/Il letto deve venire prima della sveglia|più di 16 ore/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salva notte' })).toBeDisabled();
});
