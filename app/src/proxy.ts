import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, authMode, sanitizeNext, verifySessionCookieValue } from '@/lib/auth';

/**
 * Proxy (ex middleware, Next 16): protegge TUTTA l'app con la password a utente singolo.
 * - 'off' (solo sviluppo/test): passa tutto.
 * - 'closed' (password non configurata): redirect a /login, che spiega cosa impostare.
 * - 'on': senza cookie di sessione valido, redirect a /login?next=<percorso> (GET/HEAD) oppure 401 JSON
 *   (Server Actions e ogni altro metodo).
 * Escluse: /login, /api/events (ha il suo token Bearer), /_next/* e i file pubblici.
 */

const PUBLIC_FILES = new Set([
  '/favicon.ico',
  '/favicon-32.png',
  '/manifest.webmanifest',
  '/robots.txt',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/mark.svg',
]);

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/login/') return true;
  if (pathname === '/api/events' || pathname === '/api/events/') return true;
  if (pathname.startsWith('/_next/')) return true;
  return PUBLIC_FILES.has(pathname);
}

const unauthorized = () =>
  NextResponse.json({ ok: false, error: 'Accesso richiesto.' }, { status: 401, headers: { 'cache-control': 'no-store' } });

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const mode = authMode(process.env);
  if (mode === 'off') return NextResponse.next();

  const isNavigation = request.method === 'GET' || request.method === 'HEAD';

  if (mode === 'on') {
    const valid = await verifySessionCookieValue(
      request.cookies.get(SESSION_COOKIE)?.value,
      process.env.APP_LOGIN_PASSWORD ?? '',
      Date.now(),
    );
    if (valid) return NextResponse.next();
  }

  if (!isNavigation) return unauthorized();

  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = '';
  login.hash = '';
  if (mode === 'on') {
    const wanted = new URLSearchParams(request.nextUrl.searchParams);
    wanted.delete('_rsc');
    const query = wanted.toString();
    login.searchParams.set('next', sanitizeNext(query ? `${pathname}?${query}` : pathname));
  }
  return NextResponse.redirect(login);
}

export const config = {
  // Tutto tranne gli asset statici di Next (gli altri percorsi pubblici sono filtrati in `proxy`).
  matcher: ['/((?!_next/static|_next/image).*)'],
};
