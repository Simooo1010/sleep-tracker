import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FloatingNav, NAV_ITEMS, isNavActive } from '../../src/components/FloatingNav';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const navs = (html: string) => html.match(/<nav[\s\S]*?<\/nav>/g) ?? [];

describe('FloatingNav', () => {
  const html = renderToStaticMarkup(
    <FloatingNav pathname="/regolarita" today={['Sveglia 07:20 · Primo uso 08:52', 'Riposo attivato alle 23:48']} />,
  );
  const [pill = '', side = ''] = navs(html);

  it('rende la pillola del telefono e la barra laterale del PC con le classi del sistema', () => {
    expect(navs(html)).toHaveLength(2);
    expect(pill).toContain('class="navpill"');
    expect(side).toMatch(/class="side /);
    expect(html.match(/aria-label="Principale"/g)).toHaveLength(2);
  });

  it('ha cinque voci sul telefono e sette sul PC, come link', () => {
    expect(pill.match(/<a /g)).toHaveLength(5);
    expect(side.match(/<a /g)).toHaveLength(7);
    expect(text(pill)).toBe('NotteRegolaritàGraficiStoricoSera');
    expect(text(side)).toContain('Segnali');
    expect(text(side)).toContain('Impostazioni');
    expect(pill).not.toContain('Segnali');
    expect(pill).not.toContain('Impostazioni');
    expect(pill).toContain('href="/"');
    expect(side).toContain('href="/segnali"');
    expect(side).toContain('href="/impostazioni"');
    expect(text(side).indexOf('Impostazioni')).toBeGreaterThan(text(side).indexOf('Segnali'));
  });

  it('segna solo la voce attiva con aria-current="page"', () => {
    expect(pill.match(/aria-current="page"/g)).toHaveLength(1);
    expect(side.match(/aria-current="page"/g)).toHaveLength(1);
    expect(pill).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/regolarita"/);
  });

  it('mostra marchio, riepilogo di oggi e interruttore del tema su PC', () => {
    expect(side).toContain('class="brand">Sleep Tracker</div>');
    expect(text(side)).toContain('Oggi');
    expect(text(side)).toContain('Riposo attivato alle 23:48');
    expect(side).toContain('class="btn btn-secondary');
    expect(side).toContain('aria-label="Tema chiaro, passa al tema scuro"');
    expect(text(side)).toContain('Tema chiaro');
  });

  it('nasconde le icone ai lettori di schermo', () => {
    expect(html.match(/<svg/g)).toHaveLength(12);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(12);
  });

  it('senza riepilogo scrive una frase e mai valori vuoti', () => {
    const empty = renderToStaticMarkup(<FloatingNav pathname="/segnali" theme="scuro" />);
    expect(text(empty)).toContain('Ancora nessun segnale.');
    expect(text(empty)).toContain('Tema scuro');
    expect(empty).not.toMatch(/NaN|undefined|null/);
    const [p = '', s = ''] = navs(empty);
    expect(p).not.toContain('aria-current');
    expect(s.match(/aria-current="page"/g)).toHaveLength(1);
  });
});

describe('FloatingNav su Impostazioni', () => {
  it('segna Impostazioni nella barra laterale e nessuna voce nella pillola', () => {
    const html = renderToStaticMarkup(<FloatingNav pathname="/impostazioni" />);
    const [pill = '', side = ''] = navs(html);
    expect(pill).not.toContain('aria-current');
    expect(side.match(/aria-current="page"/g)).toHaveLength(1);
    expect(side).toMatch(/<a [^>]*aria-current="page"[^>]*href="\/impostazioni"/);
  });
});

describe('isNavActive', () => {
  it('riconosce la home solo esatta e le altre voci anche con sottopercorsi', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/', '/sera')).toBe(false);
    expect(isNavActive('/grafici', '/grafici/durata')).toBe(true);
    expect(isNavActive('/grafici', '/grafici/')).toBe(true);
    expect(isNavActive('/sera', '/serata')).toBe(false);
    expect(isNavActive('/storico', '/storico?giorno=3')).toBe(true);
    expect(isNavActive('/', '')).toBe(true);
  });

  it('ha sette voci con chiavi uniche', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.key)).size).toBe(7);
  });
});
