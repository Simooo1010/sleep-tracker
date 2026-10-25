'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react';

import { actionCreateApiToken, actionRevokeApiToken } from '@/app/actions';
import { actionLogout } from '@/app/login/actions';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { createdText, lastUsedText, tokensSummary } from '@/server/pages/settings';
import type { ApiTokenInfo } from '@/server/types';

import styles from './ImpostazioniScreen.module.css';

/**
 * Schermata Impostazioni: token per i Comandi dell'iPhone e sessione.
 * Telefono: un dato per volta (due voci `ListRow` che aprono la sezione, con "Indietro"). Da 60rem: sezioni affiancate.
 * Il token in chiaro vive solo nello stato di questo componente: non va in console, URL, storage né nella cache.
 * L'unico pulsante pieno della schermata è "Crea token".
 */

export const BACK_LABEL = 'Indietro';
export const DEFAULT_LABEL = 'iPhone';
export const COPY_DONE = 'Copiato.';
export const COPY_FAILED = 'Non riesco a copiare da qui. Tieni premuto sul token, selezionalo e copialo a mano.';
const GENERIC_ERROR = 'Operazione non riuscita. Riprova.';

type SectionKey = 'tokens' | 'session';

interface Created {
  token: string;
  label: string;
}

// L'origine (https://…) si legge dal browser solo dopo l'idratazione: sul server vale ''.
const noopSubscribe = () => () => undefined;
const browserOrigin = () => window.location.origin;
const serverOrigin = () => '';

// --- Logica senza React (testabile) -----------------------------------------------------------

export type CreateOutcome = { ok: true; token: string; info: ApiTokenInfo } | { ok: false; error: string };
export type RevokeOutcome = { ok: true } | { ok: false; error: string };

/** Chiede la creazione del token. L'errore è sempre una frase calma; il token non viene mai registrato altrove. */
export async function submitCreate(label: string): Promise<CreateOutcome> {
  try {
    const res = await actionCreateApiToken({ label });
    if (res.ok && res.value) return { ok: true, token: res.value.token, info: res.value.info };
    return { ok: false, error: (!res.ok && res.error) || GENERIC_ERROR };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function submitRevoke(id: number): Promise<RevokeOutcome> {
  try {
    const res = await actionRevokeApiToken({ id });
    return res.ok ? { ok: true } : { ok: false, error: res.error || GENERIC_ERROR };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

/** Copia negli appunti; se non si può (permessi, browser vecchio) restituisce una frase calma con il rimedio. */
export async function copyToClipboard(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.clipboard,
): Promise<string> {
  try {
    if (!clipboard) throw new Error('clipboard assente');
    await clipboard.writeText(text);
    return COPY_DONE;
  } catch {
    return COPY_FAILED;
  }
}

/** Nuovo token in testa all'elenco (senza doppioni). */
export function withToken(tokens: readonly ApiTokenInfo[], info: ApiTokenInfo): ApiTokenInfo[] {
  return [info, ...tokens.filter((t) => t.id !== info.id)];
}

/** Segna come revocato il token `id`. */
export function withRevoked(tokens: readonly ApiTokenInfo[], id: number): ApiTokenInfo[] {
  return tokens.map((t) => (t.id === id ? { ...t, active: false } : t));
}

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

export function ImpostazioniScreen({ initialTokens }: { initialTokens: readonly ApiTokenInfo[] }) {
  const [tokens, setTokens] = useState<readonly ApiTokenInfo[]>(initialTokens);
  const [seenTokens, setSeenTokens] = useState<readonly ApiTokenInfo[]>(initialTokens);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [created, setCreated] = useState<Created | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const origin = useSyncExternalStore(noopSubscribe, browserOrigin, serverOrigin);

  const ids = useId();
  const tokensTitleId = `${ids}-tokens`;
  const sessionTitleId = `${ids}-session`;
  const labelId = `${ids}-label`;

  const backRefs = useRef<Partial<Record<SectionKey, HTMLButtonElement | null>>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);

  // I dati del server (dopo una scrittura la pagina si rilegge) sostituiscono lo stato locale.
  if (seenTokens !== initialTokens) {
    setSeenTokens(initialTokens);
    setTokens(initialTokens);
  }

  // Apertura di una sezione: il focus va su "Indietro". Chiusura: torna all'elenco.
  useEffect(() => {
    if (openSection) {
      backRefs.current[openSection]?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      listRef.current?.focus();
    }
  }, [openSection]);

  const createToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const out = await submitCreate(label);
      if (!out.ok) {
        setError(out.error);
        return;
      }
      setCreated({ token: out.token, label: out.info.label });
      setCopyNote(null);
      setConfirming(null);
      setTokens((prev) => withToken(prev, out.info));
    });
  };

  const revokeToken = (id: number) => {
    setError(null);
    startTransition(async () => {
      const out = await submitRevoke(id);
      setConfirming(null);
      if (!out.ok) {
        setError(out.error);
        return;
      }
      setTokens((prev) => withRevoked(prev, id));
    });
  };

  const copyToken = async () => {
    if (!created) return;
    setCopyNote(await copyToClipboard(created.token));
  };

  const open = (key: SectionKey) => () => setOpenSection(key);
  const close = () => setOpenSection(null);

  const sectionProps = (key: SectionKey) =>
    ({ 'data-section': key, 'data-open': openSection === key ? 'true' : 'false' }) as const;

  const back = (key: SectionKey) => (
    <button
      type="button"
      className={cx('btn', 'btn-ghost', styles.back)}
      onClick={close}
      ref={(el) => {
        backRefs.current[key] = el;
      }}
    >
      {BACK_LABEL}
    </button>
  );

  const endpoint = `${origin}/api/events`;

  return (
    <div className={styles.root} aria-busy={pending || undefined}>
      {error ? (
        <p role="alert" className={cx('body', styles.error)}>
          {error}
        </p>
      ) : null}

      <div className={styles.list} ref={listRef} tabIndex={-1} data-hidden={openSection !== null ? 'true' : 'false'}>
        <ListRow title="Token per i Comandi" summary={tokensSummary(tokens)} accent="blue" onOpen={open('tokens')} />
        <ListRow title="Sessione" summary="Esci da questo dispositivo" accent="sage" onOpen={open('session')} />
      </div>

      <div className={styles.sections}>
        <div className={cx(styles.section, styles.wide)} {...sectionProps('tokens')}>
          {back('tokens')}
          <section aria-labelledby={tokensTitleId} className={cx('card', styles.card)}>
            <h2 id={tokensTitleId} className={cx('title', styles.heading)}>
              Token per i Comandi
            </h2>
            <p className={cx('body', 'muted', styles.text)}>
              Il token permette ai Comandi dell&apos;iPhone di inviare i segnali. Si vede una sola volta.
            </p>

            {created ? (
              <div className={cx('card', 'card-soft', 'card-blue', styles.reveal)}>
                <p className={cx('body-strong', styles.text)}>Nuovo token: {created.label}</p>
                <code className={styles.code} data-token="true">
                  {created.token}
                </code>
                <p className={cx('body-strong', styles.text)}>Copialo adesso: non lo rivedrai.</p>
                <div className={styles.row}>
                  <Button variant="secondary" onClick={copyToken}>
                    Copia
                  </Button>
                  <Button variant="ghost" onClick={() => setCreated(null)}>
                    Nascondi
                  </Button>
                </div>
                {copyNote ? (
                  <p role="status" className={cx('body-sm', styles.text)}>
                    {copyNote}
                  </p>
                ) : null}
                <p className={cx('body-sm', styles.text)}>Indirizzo da usare nei Comandi:</p>
                <code className={styles.code} data-endpoint="true">
                  {endpoint}
                </code>
              </div>
            ) : null}

            {tokens.length > 0 ? (
              <ul className={styles.items}>
                {tokens.map((t) => {
                  const nameId = `${ids}-t${t.id}`;
                  return (
                    <li key={t.id} className={styles.item}>
                      <div className={styles.itemHead}>
                        <p id={nameId} className={cx('body-strong', styles.itemLabel)}>
                          {t.label}
                        </p>
                        <Badge variant={t.active ? 'ok' : 'missing'}>{t.active ? 'Attivo' : 'Revocato'}</Badge>
                      </div>
                      <p className={cx('body-sm', 'muted', styles.text)}>{createdText(t)}</p>
                      <p className={cx('body-sm', 'muted', styles.text)}>{lastUsedText(t)}</p>
                      {t.active ? (
                        confirming === t.id ? (
                          <div className={styles.confirm}>
                            <p className={cx('body-sm', styles.text)}>I Comandi con questo token smettono di funzionare.</p>
                            <div className={styles.row}>
                              <Button variant="secondary" aria-describedby={nameId} disabled={pending} onClick={() => revokeToken(t.id)}>
                                Conferma revoca
                              </Button>
                              <Button variant="ghost" onClick={() => setConfirming(null)}>
                                Annulla
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.row}>
                            <Button variant="secondary" aria-describedby={nameId} onClick={() => setConfirming(t.id)}>
                              Revoca
                            </Button>
                          </div>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={cx('body', 'muted', styles.text)}>Nessun token ancora. Creane uno per collegare i Comandi.</p>
            )}

            <form className={styles.form} onSubmit={createToken}>
              <label htmlFor={labelId} className="body-strong">
                Etichetta
              </label>
              <input
                id={labelId}
                name="label"
                type="text"
                className={styles.input}
                value={label}
                maxLength={40}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button type="submit" variant="primary" disabled={pending}>
                Crea token
              </Button>
            </form>
          </section>
        </div>

        <div className={styles.section} {...sectionProps('session')}>
          {back('session')}
          <section aria-labelledby={sessionTitleId} className={cx('card', styles.card)}>
            <h2 id={sessionTitleId} className={cx('title', styles.heading)}>
              Sessione
            </h2>
            <p className={cx('body', 'muted', styles.text)}>
              Esci da questo dispositivo. Per rientrare ti serve la password.
            </p>
            <form action={actionLogout}>
              <Button type="submit" variant="secondary">
                Esci
              </Button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

export default ImpostazioniScreen;
