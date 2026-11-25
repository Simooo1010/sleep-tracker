import { expect, test } from '@playwright/test';

// iPhone, app installata: da iOS 26 il sistema sfuma il bordo alto e copre il titolo. La fascia fissa .status-cover
// (styles/app.css) tiene la barra di stato a tinta unita. Chromium non emula display-mode: la regola si legge dal CSS
// caricato; la geometria si controlla forzando la visualizzazione (i valori reali di iOS non si possono provare qui).

test('fascia sotto la barra di stato: regola solo per app installata su telefono', async ({ page }) => {
  await page.goto('/impostazioni');
  const rule = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const r of Array.from(sheet.cssRules)) {
        if (r instanceof CSSMediaRule && r.conditionText.includes('display-mode: standalone')) {
          for (const inner of Array.from(r.cssRules)) {
            if (inner instanceof CSSStyleRule && inner.selectorText === '.status-cover') {
              return { media: r.conditionText, position: inner.style.position, top: inner.style.top, width: inner.style.width };
            }
          }
        }
      }
    }
    return null;
  });
  expect(rule).not.toBeNull();
  expect(rule?.media).toContain('max-width');
  expect(rule).toMatchObject({ position: 'fixed', top: '0px', width: '100%' });
  // Nel browser normale resta nascosta
  await expect(page.locator('.status-cover')).toBeHidden();
});

test('fascia sotto la barra di stato: in cima, a tutta larghezza, colore della pagina', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'solo telefono');
  await page.goto('/impostazioni');
  await page.addStyleTag({ content: ':root{--safe-top:3.5rem !important} .status-cover{display:block !important;position:fixed;top:0;left:0;width:100%;height:max(var(--safe-top),0.5rem);background:var(--ground)}' });
  await page.evaluate(() => window.scrollTo(0, 200));
  const box = await page.locator('.status-cover').boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  expect(box?.y).toBeLessThanOrEqual(4);
  expect(box?.height).toBeGreaterThanOrEqual(6);
  expect(box?.width).toBeGreaterThanOrEqual(vw * 0.8);
  const same = await page.evaluate(
    () => getComputedStyle(document.querySelector('.status-cover')!).backgroundColor === getComputedStyle(document.body).backgroundColor,
  );
  expect(same).toBe(true);
});
