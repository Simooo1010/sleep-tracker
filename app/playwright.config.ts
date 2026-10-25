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
/*
 * L'E2E usa il server di sviluppo (UN SOLO processo: il repo in memoria è un singleton nel processo).
 * `next start` imposta NODE_ENV=production, dove repo in memoria, dataset demo e ora fissa sono
 * volutamente disattivati: per questo qui serve `next dev`. Valori di PROVA, non segreti.
 */
const E2E_ENV = {
  APP_DATA_MODE: 'memory',
  APP_SEED: 'demo',
  APP_FIXED_NOW: '2026-10-24T08:30:00+02:00',
  INGEST_TOKEN_PEPPER: 'e2e-demo-pepper-not-a-secret-01234567890', // 40 caratteri
  DEMO_INGEST_TOKEN: 'st_demo-e2e-token-not-a-secret-0123456789ABCDE', // 'st_' + 43 caratteri base64url
};

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
    command: `npm run dev -- -p ${PORT} -H 127.0.0.1`,
    env: E2E_ENV,
    url: baseURL,
    // Mai riusare un server già acceso: potrebbe non avere il repo demo / l'ora fissa.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
