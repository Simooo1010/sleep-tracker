import { cookies } from 'next/headers';

import { SESSION_COOKIE, authMode, verifySessionCookieValue } from '@/lib/auth';

/**
 * Difesa in profondità per Server Actions e pagine: rilegge il cookie di sessione sul server, anche
 * se il proxy ha già filtrato la richiesta. 'off' → true; 'closed' → false; 'on' → cookie valido.
 * Qualsiasi errore (es. fuori da una richiesta) → false.
 */
export async function isAuthorized(): Promise<boolean> {
  try {
    const mode = authMode(process.env);
    if (mode === 'off') return true;
    if (mode === 'closed') return false;
    const store = await cookies();
    return await verifySessionCookieValue(
      store.get(SESSION_COOKIE)?.value,
      process.env.APP_LOGIN_PASSWORD ?? '',
      Date.now(),
    );
  } catch {
    return false;
  }
}
