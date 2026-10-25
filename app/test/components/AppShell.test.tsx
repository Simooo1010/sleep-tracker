import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

import { AppShell, isBareRoute, sectionTitle } from '../../src/components/AppShell';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const navs = (html: string) => html.match(/<nav[\s\S]*?<\/nav>/g) ?? [];

function render(pathname: string | null) {
  nav.pathname = pathname;
  return renderToStaticMarkup(
    <AppShell>
      <p>Contenuto di prova</p>
    </AppShell>,
  );
}

const CASES = [
  { path: '/', title: 'Notte', href: '/' },
  { path: '/regolarita', title: 'Regolarità', href: '/regolarita' },
  { path: '/grafici', title: 'Grafici', href: '/grafici' },
  { path: '/storico', title: 'Storico', href: '/storico' },
  { path: '/sera', title: 'Sera', href: '/sera' },
  { path: '/segnali', title: 'Segnali', href: '/segnali' },
  { path: '/impostazioni', title: 'Impostazioni', href: '/impostazioni' },
] as const;

/** Voci solo PC: su telefono si aprono da un pulsante in alto, non dalla pillola. */
const TOP_ONLY: readonly string[] = ['/segnali', '/impostazioni'];

beforeEach(() => {
  nav.pathname = '/';
});

describe('AppShell', () => {
  for (const { path, title, href } of CASES) {
    describe(`percorso ${path}`, () => {
      const html = render(path);
      const [pill = '', side = ''] = navs(html);

      it('mostra il titolo della sezione', () => {
        expect(html).toMatch(new RegExp(`<p class="title [^"]*">${title}</p>`));
        expect(sectionTitle(path)).toBe(title);
      });

      it('segna la voce attiva nella navigazione', () => {
        const active = (nav: string) => nav.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
        expect(active(side)).toHaveLength(1);
        expect(active(side)[0]).toContain(`href="${href}"`);
        if (TOP_ONLY.includes(path)) {
          expect(active(pill)).toHaveLength(0); // non è nella pillola: sta nel pulsante in alto
          expect(html).toMatch(new RegExp(`<a [^>]*aria-current="page"[^>]*href="${href}"[^>]*>${title}</a>`));
        } else {
          expect(active(pill)).toHaveLength(1);
          expect(active(pill)[0]).toContain(`href="${href}"`);
        }
      });
    });
  }

  it('ha il link "Salta al contenuto" come primo elemento focalizzabile', () => {
    const html = render('/');
    const firstFocusable = html.match(/<(a|button)\b[^>]*>/);
    expect(firstFocusable?.[0]).toContain('href="#contenuto"');
    expect(html).toMatch(/<a [^>]*href="#contenuto"[^>]*>Salta al contenuto<\/a>/);
  });

  it('ha main#contenuto con il contenuto, raggiungibile dal link', () => {
    const html = render('/sera');
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html).toMatch(/<main id="contenuto" tabindex="-1"[^>]*><p>Contenuto di prova<\/p><\/main>/);
  });

  it('ha due nav con aria-label e i pulsanti Segnali e Impostazioni in alto', () => {
    const html = render('/');
    expect(html.match(/<nav [^>]*aria-label="Principale"/g)).toHaveLength(2);
    expect(html).toMatch(/<a [^>]*href="\/segnali"[^>]*>Segnali<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/impostazioni"[^>]*>Impostazioni<\/a>/);
    // Nessuna voce attiva in alto se non si è su quelle pagine.
    const top = html.slice(html.indexOf('class="'), html.indexOf('<nav'));
    expect(top).not.toContain('aria-current');
  });

  it('i pulsanti in alto segnano solo la pagina corrente', () => {
    const html = render('/impostazioni');
    const top = html.slice(0, html.indexOf('<nav'));
    expect(top.match(/aria-current="page"/g)).toHaveLength(1);
    expect(top).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/impostazioni"/);
    expect(top).not.toMatch(/aria-current="page"[^>]*href="\/segnali"/);
  });

  it('non ha più l\'interruttore del tema (sta in Impostazioni): il tema è automatico', () => {
    const html = render('/');
    expect(html).not.toContain('Tema ');
    expect(html).not.toContain('<button');
  });

  it('mette il titolo e i comandi prima della navigazione e questa prima del contenuto', () => {
    const html = render('/');
    const order = ['Salta al contenuto', '<p class="title', 'aria-label="Principale"', '<main'].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('con un percorso sconosciuto o assente non rompe e non segna nessuna voce', () => {
    for (const p of ['/non-esiste', null]) {
      const html = render(p);
      expect(text(html)).not.toMatch(/undefined|null|NaN/);
    }
    const html = render('/non-esiste');
    expect(html).toContain('>Sleep Tracker</p>');
    expect(navs(html).join('')).not.toContain('aria-current');
    // pathname assente = home
    expect(render(null)).toContain('>Notte</p>');
  });
});

describe('AppShell sulla pagina di accesso', () => {
  it('non rende navigazione, barra in alto né link di salto: solo il contenuto', () => {
    for (const path of ['/login', '/login/']) {
      const html = render(path);
      expect(html).toContain('Contenuto di prova');
      expect(html).not.toContain('<nav');
      expect(html).not.toContain('Salta al contenuto');
      expect(html).not.toContain('Tema ');
      expect(html).not.toContain('Segnali');
    }
  });

  it('isBareRoute vale solo per /login', () => {
    expect(isBareRoute('/login')).toBe(true);
    expect(isBareRoute('/login/x')).toBe(true);
    expect(isBareRoute('/')).toBe(false);
    expect(isBareRoute('/loginx')).toBe(false);
    expect(isBareRoute('/segnali')).toBe(false);
  });
});
