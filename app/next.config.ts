import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cartella di build separata per il secondo server di sviluppo dei test E2E di accesso (vedi playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // L'app vive in `app/` dentro un repo con altri progetti (gateway/): la root di tracciamento resta questa cartella.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  // Cache del router lato client: tornare su una sezione appena vista è istantaneo. Le pagine sono tutte dinamiche
  // (dati dal database): i link di navigazione le precaricano per intero (`prefetch`, tranne Grafici e Analisi) e il
  // router le tiene 30 secondi (`static` vale per i link con `prefetch`: 30 s, come `dynamic`, non di più). Le scritture dell'app invalidano la cache da sole
  // (`revalidatePath` in actions.ts); solo i segnali che arrivano da fuori (Comandi iPhone) possono apparire
  // fino a 30 secondi dopo. Vedi docs/DECISIONS.md.
  experimental: { staleTimes: { dynamic: 30, static: 30 } },
  async headers() {
    return [
      {
        // Il service worker non va mai tenuto in cache dal browser: gli aggiornamenti devono arrivare subito.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
};

export default nextConfig;
