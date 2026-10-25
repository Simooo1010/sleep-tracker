'use server';

/**
 * Accesso e uscita. Regola Next per 'use server': si esportano solo funzioni async.
 * Esito errato = redirect a /login?errore=1 (funziona anche senza JavaScript): la pagina mostra il messaggio.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  SESSION_COOKIE,
  authMode,
  checkPassword,
  createSessionCookieValue,
  sanitizeNext,
  sessionCookieOptions,
} from '@/lib/auth';

const MAX_PASSWORD_LENGTH = 200;
/** Attesa artificiale (anche in caso di successo): freno minimo ai tentativi a raffica. */
const LOGIN_DELAY_MS = 400;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function failureUrl(next: string): string {
  const params = new URLSearchParams({ errore: '1' });
  if (next !== '/') params.set('next', next);
  return `/login?${params.toString()}`;
}

export async function actionLogin(formData: FormData): Promise<void> {
  const password = formData.get('password');
  const next = sanitizeNext(formData.get('next'));

  const mode = authMode(process.env);
  if (mode === 'off') redirect('/');
  if (mode === 'closed') redirect('/login');

  const configured = process.env.APP_LOGIN_PASSWORD ?? '';
  const valid =
    typeof password === 'string' &&
    password.length > 0 &&
    password.length <= MAX_PASSWORD_LENGTH &&
    (await checkPassword(password, configured));

  await wait(LOGIN_DELAY_MS);

  if (!valid) redirect(failureUrl(next));

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionCookieValue(configured, Date.now()), sessionCookieOptions(process.env));
  redirect(next);
}

export async function actionLogout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
