import type { MouseEvent, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Chip, FACTORS, MOODS, NAP_OPTIONS } from '../../src/components/Chip';

const noJunk = (html: string) => expect(html).not.toMatch(/NaN|undefined|null|!/);

type ClickProps = { onClick?: (e: MouseEvent<HTMLButtonElement>) => void };
const fakeEvent = (defaultPrevented = false) =>
  ({ defaultPrevented }) as unknown as MouseEvent<HTMLButtonElement>;

describe('Chip', () => {
  it('spento: classe chip, aria-pressed false, type button', () => {
    const html = renderToStaticMarkup(<Chip pressed={false}>Sport</Chip>);
    expect(html).toBe('<button type="button" class="chip" aria-pressed="false">Sport</button>');
    noJunk(html);
  });

  it('acceso: is-on e aria-pressed true', () => {
    const html = renderToStaticMarkup(<Chip pressed>Schermo a letto</Chip>);
    expect(html).toContain('class="chip is-on"');
    expect(html).toContain('aria-pressed="true"');
  });

  it.each([
    ['mood', 'chip chip-mood is-on', 'Leggero'],
    ['nap', 'chip chip-nap is-on', '30 min'],
    ['exception', 'chip chip-exc is-on', 'Viaggio'],
    ['factor', 'chip is-on', 'Cena tardi'],
  ] as const)('variante %s', (variant, cls, label) => {
    const html = renderToStaticMarkup(
      <Chip pressed variant={variant}>
        {label}
      </Chip>,
    );
    expect(html).toContain(`class="${cls}"`);
    expect(html).toContain(`>${label}<`);
  });

  it('onPressedChange riceve lo stato opposto, dopo onClick', () => {
    const calls: string[] = [];
    const onClick = vi.fn(() => calls.push('click'));
    const onPressedChange = vi.fn((next: boolean) => calls.push(`change:${String(next)}`));
    const el = Chip({ pressed: false, children: 'Sport', onClick, onPressedChange }) as ReactElement<ClickProps>;
    el.props.onClick?.(fakeEvent());
    expect(calls).toEqual(['click', 'change:true']);

    const on = Chip({ pressed: true, children: 'Sport', onPressedChange }) as ReactElement<ClickProps>;
    on.props.onClick?.(fakeEvent());
    expect(onPressedChange).toHaveBeenLastCalledWith(false);
  });

  it('onClick con preventDefault blocca il cambio di stato', () => {
    const onPressedChange = vi.fn();
    const el = Chip({ pressed: false, children: 'Sport', onPressedChange }) as ReactElement<ClickProps>;
    el.props.onClick?.(fakeEvent(true));
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('senza gestori non aggiunge onClick', () => {
    const el = Chip({ pressed: false, children: 'Sport' }) as ReactElement<ClickProps>;
    expect(el.props.onClick).toBeUndefined();
  });

  it('elenchi in italiano, senza caffè', () => {
    expect(FACTORS).toEqual(['Schermo a letto', 'Sport', 'Giornata stressante', 'Cena tardi', 'Alcol', 'Mal di testa']);
    expect(FACTORS.join(' ').toLowerCase()).not.toContain('caff');
    expect(MOODS).toHaveLength(5);
    expect(NAP_OPTIONS[0]).toBe('Nessuno');
  });
});
