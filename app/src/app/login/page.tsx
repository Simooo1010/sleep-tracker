import Link from 'next/link';
import { redirect } from 'next/navigation';

import { authMode, sanitizeNext } from '@/lib/auth';
import { isAuthorized } from '@/lib/auth-server';

import { actionLogin, actionLogout } from './actions';
import styles from './page.module.css';

// Dipende dall'ambiente e dal cookie: mai in cache.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Accesso · Sleep Tracker' };

const NOT_CONFIGURED = "Accesso non configurato. Imposta APP_LOGIN_PASSWORD nelle variabili d'ambiente del progetto.";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = authMode(process.env);
  if (mode === 'off') redirect('/');

  const params = await searchParams;
  const next = sanitizeNext(first(params.next));
  const failed = first(params.errore) === '1';

  let body;
  if (mode === 'closed') {
    body = (
      <p className="body muted" role="status">
        {NOT_CONFIGURED}
      </p>
    );
  } else if (await isAuthorized()) {
    body = (
      <div className={styles.actions}>
        <p className="body muted" role="status">
          Hai già effettuato l&apos;accesso.
        </p>
        <Link href={next} className="btn btn-primary btn-lg btn-block">
          Vai all&apos;app
        </Link>
        <form action={actionLogout}>
          <button type="submit" className="btn btn-secondary btn-block">
            Esci
          </button>
        </form>
      </div>
    );
  } else {
    body = (
      <form action={actionLogin} className={styles.form}>
        <input type="hidden" name="next" value={next} />
        <div className={styles.field}>
          <label htmlFor="password" className={`body ${styles.label}`}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
            className={styles.input}
            aria-invalid={failed ? true : undefined}
            aria-describedby={failed ? 'login-errore' : undefined}
          />
        </div>
        {failed ? (
          <p id="login-errore" className={`body ${styles.error}`} role="alert">
            Password non corretta.
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-lg btn-block">
          Entra
        </button>
      </form>
    );
  }

  return (
    <main id="contenuto" className={styles.page}>
      <div className={`card ${styles.card}`}>
        <header className={styles.header}>
          <h1 className="serif display-md">Accesso</h1>
          <p className="body muted">Sleep Tracker è privato.</p>
        </header>
        {body}
      </div>
    </main>
  );
}
