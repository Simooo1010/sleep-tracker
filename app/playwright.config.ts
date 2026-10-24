import { existsSync } from 'node:fs';
import { defineConfig, devices, webkit } from '@playwright/test';

/*
 * Viewport di riferimento di docs/DESIGN.md: 390×844 DPR3 (iPhone), 1280×800 DPR2, 3840×2160.
 *
 * LIMITAZIONE WebKit: nell'ambiente di sviluppo cloud c'è solo Chromium in /opt/pw-browsers
 * (WebKit non installato, e `playwright install` non va lanciato lì). Se l'eseguibile di WebKit
 * non esiste, il progetto "iphone" usa Chromium con emulazione del dispositivo (isMobile, hasTouch,
 * deviceScaleFactor 3, user agent di iPhone): rende layout e media query come un iPhone, ma NON
 * il motore Safari (font rendering, bug specifici di WebKit, comportamento PWA standalone).
 * Dove WebKit è installato (`npx playwright install webkit`), viene usato automaticamente.
 */
const webkitAvailable = (() => {
  try {
    return existsSync(webkit.executablePath());
  } catch {
    return false;
  }
})();

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;
// L'E2E gira sulla build di produzione: se manca la build la crea.
const hasBuild = existsSync('.next/BUILD_ID');

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'iphone',
      use: {
        // iPhone 13: user agent iOS e schermo 390×844; il viewport è forzato a tutta l'altezza dello schermo.
        ...devices['iPhone 13'],
        browserName: webkitAvailable ? 'webkit' : 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'uhd',
      use: {
        browserName: 'chromium',
        viewport: { width: 3840, height: 2160 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: `${hasBuild ? '' : 'npm run build && '}npm run start -- -p ${PORT} -H 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
