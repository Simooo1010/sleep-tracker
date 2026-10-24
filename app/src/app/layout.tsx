import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

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

// Imposta data-theme (chiaro/scuro) dalla preferenza del sistema prima del primo paint e lo segue se cambia.
// tokens.css gestisce anche il caso senza JS tramite :root:not([data-theme]).
const themeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){document.documentElement.setAttribute('data-theme',m.matches?'scuro':'chiaro')};a();m.addEventListener('change',a)}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Tag PWA esatti di docs/DESIGN.md §Logo */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Sleep Tracker" />
        <meta name="theme-color" content="#eef2f6" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#161a22" media="(prefers-color-scheme: dark)" />
      </head>
      <body>{children}</body>
    </html>
  );
}
