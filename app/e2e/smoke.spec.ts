import { expect, test } from '@playwright/test';

const THEMES = [
  { scheme: 'light', theme: 'chiaro', ground: 'rgb(238, 242, 246)' },
  { scheme: 'dark', theme: 'scuro', ground: 'rgb(22, 26, 34)' },
] as const;

for (const { scheme, theme, ground } of THEMES) {
  test(`la home si apre nel tema ${theme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { level: 1, name: 'Sleep Tracker' })).toBeVisible();

    const logo = page.getByRole('img', { name: /Icona di Sleep Tracker/ });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // Colori dai token del tema e font self-hosted caricati.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(ground);
    const loadedFamilies = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, ''));
    });
    expect(loadedFamilies).toContain('Newsreader');
    expect(loadedFamilies).toContain('Instrument Sans');

    // Nessuno scorrimento orizzontale.
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    await page.screenshot({ path: `test-results/screens/${testInfo.project.name}-${theme}.png`, fullPage: true });
  });
}

test('manifest e icone PWA raggiungibili', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Sleep Tracker');

  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as { name: string; display: string; icons: { src: string }[] };
  expect(manifest.name).toBe('Sleep Tracker');
  expect(manifest.display).toBe('standalone');

  for (const src of [...manifest.icons.map((i) => i.src), '/apple-touch-icon.png', '/favicon-32.png']) {
    const icon = await request.get(src);
    expect(icon.status(), src).toBe(200);
    expect(icon.headers()['content-type']).toContain('image/png');
  }
});
