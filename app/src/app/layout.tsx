import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/AppShell';
import { FAVICON_ID, TOUCH_ICON_ID, iconInitScript } from '@/lib/app-icon';
import { themeInitScript } from '@/lib/theme';

import '@/styles/fonts.css';
import '@/styles/tokens.css';
import '@/styles/bundle.css';
import '@/styles/app.css';

export const metadata: Metadata = {
  title: 'Sleep Tracker',
  description: 'Stima da sola. Chiede solo una conferma.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        {/* Imposta data-theme (scelta salvata o sistema) prima del primo paint: vedi lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Tag PWA esatti di docs/DESIGN.md §Logo */}
        <link id={TOUCH_ICON_ID} rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link id={FAVICON_ID} rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        {/* Variante scura delle icone (sfondo --ground scuro) quando il sistema è in modalità scura: vedi lib/app-icon.ts. */}
        <script dangerouslySetInnerHTML={{ __html: iconInitScript }} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Sleep Tracker" />
        <meta name="theme-color" content="#eef2f6" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#161a22" media="(prefers-color-scheme: dark)" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
