import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EXCEPTIONS,
  EXCEPTION_NOTE,
  ExceptionChips,
  resolveNewException,
  sortExceptions,
} from '../../src/components/ExceptionChips';

const noJunk = (html: string) => expect(html).not.toMatch(/NaN|undefined|null|!/);
const noop = () => {};

describe('ExceptionChips', () => {
  it('predefinite: cinque chip spenti, gruppo etichettato e nota collegata', () => {
    const html = renderToStaticMarkup(<ExceptionChips />);
    for (const label of ['Malattia', 'Viaggio', 'Festa', 'Notte in bianco', 'Alcol']) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html.match(/class="chip chip-exc"/g)).toHaveLength(5);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(5);
    expect(html).toContain('role="group"');
    expect(html).toContain('class="eyebrow"');
    expect(html).toContain('>Giornata particolare<');
    expect(html).toContain(`class="caption muted"`);
    expect(html).toContain(EXCEPTION_NOTE);
    expect(html.toLowerCase()).not.toContain('caff');

    const labelId = /class="eyebrow" id="([^"]+)"/.exec(html)?.[1];
    const noteId = /class="caption muted" id="([^"]+)"/.exec(html)?.[1];
    expect(labelId).toBeTruthy();
    expect(html).toContain(`aria-labelledby="${labelId}"`);
    expect(html).toContain(`aria-describedby="${noteId}"`);
    noJunk(html);
  });

  it('attive: is-on e aria-pressed true solo per le eccezioni attive', () => {
    const html = renderToStaticMarkup(<ExceptionChips active={['viaggio', 'inesistente']} onToggle={noop} />);
    expect(html).toContain('<button type="button" class="chip chip-exc is-on" aria-pressed="true">Viaggio</button>');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    noJunk(html);
  });

  it('chip + Aggiungi solo con onAdd, con nome accessibile', () => {
    expect(renderToStaticMarkup(<ExceptionChips />)).not.toContain('chip-add');
    const html = renderToStaticMarkup(<ExceptionChips onAdd={noop} />);
    expect(html).toContain('class="chip chip-add"');
    expect(html).toContain('aria-label="Aggiungi un altro imprevisto"');
    expect(html).toContain('+ Aggiungi');
  });

  it('etichetta nascosta: aria-label sul gruppo, nessuna etichetta visibile', () => {
    const html = renderToStaticMarkup(<ExceptionChips label="Cosa è successo oggi" hideLabel />);
    expect(html).toContain('aria-label="Cosa è successo oggi"');
    expect(html).not.toContain('class="eyebrow"');
    expect(html).not.toContain('aria-labelledby');
  });

  it('senza nota', () => {
    const html = renderToStaticMarkup(<ExceptionChips showNote={false} />);
    expect(html).not.toContain(EXCEPTION_NOTE);
    expect(html).not.toContain('aria-describedby');
  });

  it('vuoto: nulla senza onAdd, solo Aggiungi con onAdd', () => {
    expect(renderToStaticMarkup(<ExceptionChips exceptions={[]} />)).toBe('');
    const html = renderToStaticMarkup(<ExceptionChips exceptions={[]} onAdd={noop} />);
    expect(html).toContain('chip-add');
    expect(html).not.toContain('chip-exc');
    noJunk(html);
  });

  it('ordinate per frequenza d\'uso, senza doppioni né etichette vuote', () => {
    const html = renderToStaticMarkup(
      <ExceptionChips
        exceptions={[
          { id: 'a', label: 'Festa', uses: 1 },
          { id: 'b', label: 'Viaggio', uses: 7 },
          { id: 'c', label: '  ' },
          { id: 'b', label: 'Doppione' },
          { id: 'd', label: 'Trasloco', uses: Number.NaN },
        ]}
      />,
    );
    const order = [...html.matchAll(/aria-pressed="false">([^<]+)</g)].map((m) => m[1]);
    expect(order).toEqual(['Viaggio', 'Festa', 'Trasloco']);
    noJunk(html);
  });

  it('sortExceptions è stabile a pari uso', () => {
    expect(sortExceptions(DEFAULT_EXCEPTIONS).map((e) => e.id)).toEqual(DEFAULT_EXCEPTIONS.map((e) => e.id));
  });
});

describe('ExceptionChips: + Aggiungi con onCreate', () => {
  it('chiuso: c\'è il chip + Aggiungi (aria-expanded false) e nessun campo', () => {
    const html = renderToStaticMarkup(<ExceptionChips onCreate={noop} />);
    expect(html).toContain('chip-add');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<input');
    noJunk(html);
  });

  it('senza onCreate né onAdd il chip non c\'è e aria-expanded non compare', () => {
    expect(renderToStaticMarkup(<ExceptionChips />)).not.toContain('chip-add');
    expect(renderToStaticMarkup(<ExceptionChips onAdd={noop} />)).not.toContain('aria-expanded');
  });

  it('solo onCreate e nessun chip: il gruppo resta con + Aggiungi', () => {
    const html = renderToStaticMarkup(<ExceptionChips exceptions={[]} onCreate={noop} />);
    expect(html).toContain('chip-add');
  });
});

describe('resolveNewException', () => {
  const items = [
    { id: 'viaggio', label: 'Viaggio' },
    { id: 'cena-fuori', label: 'Cena fuori' },
  ];
  const none = new Set<string>();

  it('rifiuta vuoti, spazi e testi senza lettere o numeri', () => {
    expect(resolveNewException('', items, none)).toEqual({ kind: 'empty' });
    expect(resolveNewException('   ', items, none)).toEqual({ kind: 'empty' });
    expect(resolveNewException('!!! ???', items, none)).toEqual({ kind: 'invalid' });
  });

  it('nuovo: slug e etichetta normalizzata (spazi collassati, max 30 caratteri)', () => {
    expect(resolveNewException('  Mal  di   schiena ', items, none)).toEqual({
      kind: 'new',
      id: 'mal-di-schiena',
      label: 'Mal di schiena',
    });
    const long = resolveNewException('a'.repeat(50), items, none);
    expect(long.kind === 'new' && long.label.length).toBe(30);
  });

  it('esistente (anche con maiuscole o accenti diversi): nessun doppione, dice se è già attivo', () => {
    expect(resolveNewException('VIAGGIO', items, none)).toEqual({ kind: 'existing', id: 'viaggio', active: false });
    expect(resolveNewException('cena  fuori', items, new Set(['cena-fuori']))).toEqual({
      kind: 'existing',
      id: 'cena-fuori',
      active: true,
    });
  });
});
