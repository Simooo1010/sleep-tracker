import { expect, test, type Page } from '@playwright/test';

// Nessuno scorrimento orizzontale su telefono, a 390 px (iPhone) e a 320 px (iPhone SE), su ogni pagina
// e con ogni voce dell'elenco aperta (le sezioni a tutto schermo contengono i grafici più larghi).
// Solo progetto "iphone": su PC il contenuto è centrato con larghezza massima.

const PAGES = ['/', '/sera', '/grafici', '/storico', '/segnali', '/regolarita'] as const;
const WIDTHS = [390, 320] as const;

// Il viewport si fissa alla creazione del contesto (test.use), non con page.setViewportSize: nell'emulazione
// mobile il secondo modo non riproduce il layout viewport che si allarga quando il contenuto sborda.

const overflow = (page: Page) =>
  page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    body: document.body.scrollWidth,
  }));

/** Elementi visibili che escono dalla finestra a destra (per un messaggio d'errore utile). */
const offenders = (page: Page, w: number) =>
  page.evaluate((w) => {
    return Array.from(document.body.querySelectorAll('*'))
      .filter((el) => {
        const b = el.getBoundingClientRect();
        // La barra flottante è `fixed`: segue la finestra allargata e non è la causa dello scorrimento.
        return b.width > 0 && b.right > w + 0.5 && !el.closest('nav, [class*="pillWrap"]');
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)}`);
  }, w);

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 640 } });

    for (const path of PAGES) {
      test(`${path}: nessuno scorrimento orizzontale, anche con ogni voce aperta`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'iphone', 'solo telefono');
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

        const check = async (what: string) => {
          const o = await overflow(page);
          const why = `${path} ${what}: scrollWidth ${o.scroll}, body ${o.body}, innerWidth ${o.inner} (${(await offenders(page, width)).join(', ')})`;
          expect(o.inner, why).toBe(width);
          expect(o.scroll, why).toBeLessThanOrEqual(o.inner);
          expect(o.body, why).toBeLessThanOrEqual(o.inner);
        };

        await check('elenco');

        // Ogni voce ListRow (pulsante) apre una sezione a tutto schermo e "Indietro" torna all'elenco.
        const rows = page.locator('main button.list-row:visible');
        const count = await rows.count();
        for (let i = 0; i < count; i += 1) {
          const row = page.locator('main button.list-row:visible').nth(i);
          const title = (await row.locator('.tt').textContent()) ?? `voce ${i + 1}`;
          await row.click();
          await check(`sezione "${title}"`);
          await page.getByRole('button', { name: 'Indietro' }).first().click();
          await expect(page.locator('main button.list-row:visible')).toHaveCount(count);
        }
      });
    }
  });
}
