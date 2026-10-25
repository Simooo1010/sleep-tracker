import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge, badgeLabel } from '../../src/components/Badge';

const noJunk = (html: string) => expect(html).not.toMatch(/NaN|undefined|null|!/);

describe('Badge', () => {
  it.each([
    ['automatico', 'badge-auto', 'Automatico'],
    ['confermato', 'badge-confirmed', 'Confermato'],
    ['stimato', 'badge-estimated', 'Stimato'],
    ['mancante', 'badge-missing', 'Mancante'],
  ] as const)('provenienza %s: classe %s e parola %s', (provenance, cls, word) => {
    const html = renderToStaticMarkup(<Badge provenance={provenance} />);
    expect(html).toBe(`<span class="badge ${cls}">${word}</span>`);
    noJunk(html);
  });

  it('provenienza al femminile', () => {
    expect(renderToStaticMarkup(<Badge provenance="automatico" feminine />)).toContain('>Automatica<');
    expect(renderToStaticMarkup(<Badge provenance="stimato" feminine />)).toContain('>Stimata<');
  });

  it.each([
    ['confermata', 'badge-confirmed', 'Confermata'],
    ['stimata', 'badge-estimated', 'Stimata'],
    ['mancante', 'badge-missing', 'Mancante'],
  ] as const)('stato della notte %s', (status, cls, word) => {
    const html = renderToStaticMarkup(<Badge status={status} />);
    expect(html).toBe(`<span class="badge ${cls}">${word}</span>`);
  });

  it.each([
    ['ok', 'OK'],
    ['out', 'Fuori'],
    ['ai', 'AI'],
    ['rules', 'Regole'],
    ['forecast', 'Previsione'],
  ] as const)('variante %s con testo predefinito', (variant, word) => {
    const html = renderToStaticMarkup(<Badge variant={variant} />);
    expect(html).toBe(`<span class="badge badge-${variant}">${word}</span>`);
  });

  it('testo personalizzato', () => {
    const html = renderToStaticMarkup(<Badge variant="out">Deriva +42 min in 5 settimane</Badge>);
    expect(html).toContain('class="badge badge-out"');
    expect(html).toContain('Deriva +42 min in 5 settimane');
  });

  it('mai un badge vuoto: testo vuoto, null o NaN tornano alla parola della variante', () => {
    expect(renderToStaticMarkup(<Badge variant="estimated">{'  '}</Badge>)).toContain('>Stimato<');
    expect(renderToStaticMarkup(<Badge variant="missing">{null}</Badge>)).toContain('>Mancante<');
    const html = renderToStaticMarkup(<Badge variant="confirmed">{Number.NaN}</Badge>);
    expect(html).toContain('>Confermato<');
    noJunk(html);
  });

  it('passa attributi nativi e className', () => {
    const html = renderToStaticMarkup(<Badge variant="ai" className="x" title="Generato dal modello" />);
    expect(html).toContain('class="badge badge-ai x"');
    expect(html).toContain('title="Generato dal modello"');
  });

  it('badgeLabel', () => {
    expect(badgeLabel('confirmed')).toBe('Confermato');
    expect(badgeLabel('confirmed', true)).toBe('Confermata');
    expect(badgeLabel('ok', true)).toBe('OK');
  });
});
