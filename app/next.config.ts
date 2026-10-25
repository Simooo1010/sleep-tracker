import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cartella di build separata per il secondo server di sviluppo dei test E2E di accesso (vedi playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // L'app vive in `app/` dentro un repo con altri progetti (gateway/): la root di tracciamento resta questa cartella.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
    ];
  },
};

export default nextConfig;
