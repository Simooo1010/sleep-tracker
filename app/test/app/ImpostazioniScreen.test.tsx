import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions', () => ({ actionCreateApiToken: vi.fn(), actionRevokeApiToken: vi.fn() }));
vi.mock('@/app/login/actions', () => ({ actionLogout: vi.fn() }));
vi.mock('@/server/repo-factory', () => ({ getRepo: vi.fn() }));

import { actionCreateApiToken, actionRevokeApiToken } from '@/app/actions';
import ImpostazioniPage from '@/app/impostazioni/page';
import {
  COPY_DONE,
  COPY_FAILED,
  ImpostazioniScreen,
  copyToClipboard,
  submitCreate,
  submitRevoke,
  withRevoked,
  withToken,
} from '@/app/impostazioni/ImpostazioniScreen';
import { MemoryRepo } from '@/server/memory-repo';
import { getRepo } from '@/server/repo-factory';
import type { ApiTokenInfo } from '@/server/types';

const TOKEN = 'st_' + 'Zx9-_'.repeat(8) + 'abc';

const active: ApiTokenInfo = { id: 2, label: 'iPhone', active: true, createdAt: '2026-10-24T08:00:00.000Z', lastUsedAt: null };
const used: ApiTokenInfo = { id: 3, label: 'iPad', active: true, createdAt: '2026-10-22T08:00:00.000Z', lastUsedAt: '2026-10-25T06:12:00.000Z' };
const revoked: ApiTokenInfo = { id: 1, label: 'vecchio', active: false, createdAt: '2026-10-20T08:00:00.000Z', lastUsedAt: null };

const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ').trim();
// React aggiunge uno <script> di replay dei form quando c'è un'azione: non fa parte del contenuto.
const render = (tokens: ApiTokenInfo[]) =>
  renderToStaticMarkup(<ImpostazioniScreen initialTokens={tokens} />).replace(/<script>[\s\S]*?<\/script>/g, '');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImpostazioniScreen (markup)', () => {
  const html = render([active, used, revoked]);

  it('sezione Token: titolo, spiegazione e voce per ogni token con stato a parole', () => {
    expect(html).toContain('Token per i Comandi');
    expect(text(html)).toContain("Il token permette ai Comandi dell'iPhone di inviare i segnali. Si vede una sola volta.");
    expect(html.match(/<li class="[^"]*item/g)).toHaveLength(3);
    expect(html.match(/badge-ok">Attivo</g)).toHaveLength(2);
    expect(html.match(/badge-missing">Revocato</g)).toHaveLength(1);
    expect(text(html)).toContain('Creato il 24 ottobre 2026');
    expect(text(html)).toContain('Mai usato');
    expect(text(html)).toContain('Ultimo uso 25 ottobre 2026, 07:12');
  });

  it('Revoca solo per i token attivi, mai la conferma già aperta, nessuna azione distruttiva immediata', () => {
    expect(html.match(/>Revoca</g)).toHaveLength(2);
    expect(html).not.toContain('Conferma revoca');
    expect(html).not.toContain('<code');
  });

  it('form di creazione: etichetta con default "iPhone", massimo 40 caratteri, unico pulsante pieno "Crea token"', () => {
    expect(html).toMatch(/<label [^>]*>Etichetta<\/label>/);
    expect(html).toMatch(/<input [^>]*value="iPhone"/);
    expect(html).toMatch(/<input [^>]*maxLength="40"/);
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toMatch(/<button type="submit" class="btn btn-primary">Crea token<\/button>/);
  });

  it('sezione Sessione: pulsante secondario "Esci" dentro un form', () => {
    expect(html).toContain('Sessione');
    const form = html.match(/<form[^>]*>(?:(?!<\/form>)[\s\S])*Esci<\/button><\/form>/);
    expect(form).not.toBeNull();
    expect(form![0]).toContain('btn-secondary');
    expect(form![0]).not.toContain('btn-primary');
  });

  it('telefono: tre voci ListRow con sintesi e tre sezioni chiuse con "Indietro"', () => {
    expect(html.match(/class="list-row/g)).toHaveLength(3);
    expect(html).toContain('Automatico, segue il sistema');
    expect(html).toContain('2 token attivi');
    expect(html).toContain('Esci da questo dispositivo');
    expect(html.match(/>Indietro</g)).toHaveLength(3);
    expect(html.match(/data-open="false"/g)).toHaveLength(3);
    expect(html).not.toContain('data-open="true"');
  });

  it('senza token: frase calma, nessun elemento vuoto o strano', () => {
    const empty = render([]);
    expect(text(empty)).toContain('Nessun token ancora');
    expect(empty).toContain('Nessun token attivo');
    expect(empty).not.toContain('<li');
    expect(empty).not.toMatch(/NaN|undefined|\bnull\b/);
    expect(html).not.toMatch(/NaN|undefined|\bnull\b/);
  });

  it('nessun hash né dato sensibile nel markup', () => {
    expect(html).not.toMatch(/token_hash|tokenHash|hash/i);
  });
});

describe('pagina Impostazioni', () => {
  it('h1 "Impostazioni" e il contenuto dal repo', async () => {
    const repo = new MemoryRepo();
    await repo.createToken({ tokenHash: 'h', label: 'Comandi' });
    vi.mocked(getRepo).mockReturnValue(repo);
    const html = renderToStaticMarkup(await ImpostazioniPage());
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Impostazioni<\/h1>/);
    expect(html).toContain('Comandi');
    expect(html).toContain('Token per i Comandi');
  });

  it('repo non disponibile: messaggio calmo con role="status", nessun errore tecnico', async () => {
    vi.mocked(getRepo).mockImplementation(() => {
      throw new Error('SUPABASE_URL mancante');
    });
    const html = renderToStaticMarkup(await ImpostazioniPage());
    expect(html).toContain('role="status"');
    expect(html).toContain('Le impostazioni non sono disponibili');
    expect(html).not.toContain('SUPABASE');
    expect(html).not.toContain('Crea token');
  });
});

describe('submitCreate / submitRevoke', () => {
  it('creazione riuscita: token e metadati', async () => {
    vi.mocked(actionCreateApiToken).mockResolvedValue({ ok: true, value: { token: TOKEN, info: active } });
    expect(await submitCreate('iPhone')).toEqual({ ok: true, token: TOKEN, info: active });
    expect(actionCreateApiToken).toHaveBeenCalledWith({ label: 'iPhone' });
  });

  it('creazione fallita: errore calmo, e il token non compare nell\'esito', async () => {
    vi.mocked(actionCreateApiToken).mockResolvedValue({ ok: false, error: 'Hai già troppi token attivi. Revocane uno.' });
    expect(await submitCreate('iPhone')).toEqual({ ok: false, error: 'Hai già troppi token attivi. Revocane uno.' });
    vi.mocked(actionCreateApiToken).mockResolvedValue({ ok: false, error: '' });
    expect(await submitCreate('iPhone')).toEqual({ ok: false, error: 'Operazione non riuscita. Riprova.' });
    vi.mocked(actionCreateApiToken).mockRejectedValue(new Error('rete giù'));
    const out = await submitCreate('iPhone');
    expect(out).toEqual({ ok: false, error: 'Operazione non riuscita. Riprova.' });
    expect(JSON.stringify(out)).not.toContain('rete');
  });

  it('risposta ok senza valore → errore calmo', async () => {
    vi.mocked(actionCreateApiToken).mockResolvedValue({ ok: true });
    expect(await submitCreate('iPhone')).toEqual({ ok: false, error: 'Operazione non riuscita. Riprova.' });
  });

  it('revoca: esito, errore dal server e eccezione', async () => {
    vi.mocked(actionRevokeApiToken).mockResolvedValue({ ok: true });
    expect(await submitRevoke(2)).toEqual({ ok: true });
    expect(actionRevokeApiToken).toHaveBeenCalledWith({ id: 2 });
    vi.mocked(actionRevokeApiToken).mockResolvedValue({ ok: false, error: 'Token non trovato.' });
    expect(await submitRevoke(2)).toEqual({ ok: false, error: 'Token non trovato.' });
    vi.mocked(actionRevokeApiToken).mockRejectedValue(new Error('x'));
    expect(await submitRevoke(2)).toEqual({ ok: false, error: 'Operazione non riuscita. Riprova.' });
  });
});

describe('copyToClipboard', () => {
  it('copia e conferma', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyToClipboard(TOKEN, { writeText })).toBe(COPY_DONE);
    expect(writeText).toHaveBeenCalledWith(TOKEN);
  });

  it('negli appunti non si può: frase calma con il rimedio, senza rilanciare né stampare il token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const note = await copyToClipboard(TOKEN, { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
    expect(note).toBe(COPY_FAILED);
    expect(note).not.toContain(TOKEN);
    expect(await copyToClipboard(TOKEN, undefined)).toBe(COPY_FAILED);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('aggiornamento dell\'elenco', () => {
  it('withToken mette il nuovo in testa senza doppioni; withRevoked tocca solo il token indicato', () => {
    expect(withToken([used, revoked], active).map((t) => t.id)).toEqual([2, 3, 1]);
    expect(withToken([active, used], { ...active, label: 'nuovo' }).map((t) => t.label)).toEqual(['nuovo', 'iPad']);
    const next = withRevoked([active, used], 2);
    expect(next.map((t) => t.active)).toEqual([false, true]);
    expect(active.active).toBe(true); // l'originale non cambia
  });
});
