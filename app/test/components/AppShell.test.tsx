import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

import { AppShell, sectionTitle } from '../../src/components/AppShell';

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
] as const;

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
        if (path === '/segnali') {
          expect(active(pill)).toHaveLength(0); // Segnali non è nella pillola: sta nel pulsante in alto
          expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/segnali"[^>]*>Segnali<\/a>/);
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

  it('ha due nav con aria-label e il pulsante Segnali che porta a /segnali', () => {
    const html = render('/');
    expect(html.match(/<nav [^>]*aria-label="Principale"/g)).toHaveLength(2);
    expect(html).toMatch(/<a [^>]*href="\/segnali"[^>]*>Segnali<\/a>/);
  });

  it('ha l\'interruttore del tema, chiaro sul server, che nomina l\'altro tema', () => {
    const html = render('/');
    const buttons = html.match(/<button [^>]*aria-label="Tema chiaro, passa al tema scuro"[^>]*>Tema chiaro<\/button>/g);
    expect(buttons).toHaveLength(2); // riga in alto (telefono) e barra laterale (PC)
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
