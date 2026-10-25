import { expect, test } from '@playwright/test';

// Pagina Segnali (sola lettura). Dati demo: oggi = sabato 24 ottobre 2026 08:30 (Europe/Rome).
// Progetti: "iphone" (390 px, una colonna) e "desktop" (1280 px, righe a sinistra e registro a destra).

const isPhone = (name: string) => name === 'iphone';

test('mostra il titolo, le automazioni con il loro stato e il registro', async ({ page }) => {
  await page.goto('/segnali');
  await expect(page.getByRole('heading', { level: 1, name: 'Segnali' })).toBeVisible();
  await expect(page.getByText("Da qui vedi se i Comandi dell'iPhone stanno arrivando.")).toBeVisible();

  const main = page.locator('main#contenuto');
  for (const name of ['Sveglia interrotta', 'Riposo attivato', 'Check serale', 'Sonnellino rapido', 'Stima di riserva', 'Recupero sonnellino']) {
    await expect(main.locator('li.signal', { hasText: name })).toBeVisible();
  }
  // Ogni riga dice il proprio stato a parole.
  const states = main.locator('li.signal .badge');
  await expect(states.first()).toBeVisible();
  const texts = await states.allTextContents();
  expect(texts.length).toBeGreaterThanOrEqual(6);
  for (const t of texts) expect(['Attivo', 'Da configurare', 'Inattivo']).toContain(t.trim());

  await expect(main.getByRole('heading', { level: 2, name: 'Ultimi segnali' })).toBeVisible();
  expect(await main.locator('ol > li').count()).toBeGreaterThan(0);
  await expect(main.getByText('Come creare i Comandi: vedi docs/COMANDI_IOS.md')).toBeVisible();
});

test('nessuna parola di colpa e un solo h1', async ({ page }) => {
  await page.goto('/segnali');
  await expect(page.locator('h1')).toHaveCount(1);
  const text = (await page.locator('main#contenuto').innerText()).toLowerCase();
  for (const word of ['dimenticato', 'mancato', 'errore']) expect(text).not.toContain(word);
});

test('telefono: una colonna senza scorrimento orizzontale; PC: due colonne', async ({ page }, testInfo) => {
  await page.goto('/segnali');
  const rows = page.getByRole('heading', { level: 2, name: 'Automazioni' });
  const log = page.getByRole('heading', { level: 2, name: 'Ultimi segnali' });
  const rowsBox = await rows.boundingBox();
  const logBox = await log.boundingBox();
  expect(rowsBox).not.toBeNull();
  expect(logBox).not.toBeNull();

  if (isPhone(testInfo.project.name)) {
    expect(logBox!.y).toBeGreaterThan(rowsBox!.y);
    expect(Math.abs(logBox!.x - rowsBox!.x)).toBeLessThan(2);
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
  } else {
    expect(logBox!.x).toBeGreaterThan(rowsBox!.x + 100);
    expect(Math.abs(logBox!.y - rowsBox!.y)).toBeLessThan(2);
  }
});
