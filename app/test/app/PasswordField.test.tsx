import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PasswordField, nextVisibility } from '@/app/login/PasswordField';

function inputTag(html: string): string {
  const match = html.match(/<input[^>]*>/);
  expect(match).not.toBeNull();
  return match![0];
}

describe('PasswordField', () => {
  it('etichetta visibile "Password" collegata al campo', () => {
    const html = renderToStaticMarkup(<PasswordField />);
    expect(html).toMatch(/<label[^>]*for="password"[^>]*>Password<\/label>/);
  });

  it('input con gli attributi esatti e type="password" di default', () => {
    const tag = inputTag(renderToStaticMarkup(<PasswordField />));
    expect(tag).toContain('id="password"');
    expect(tag).toContain('name="password"');
    expect(tag).toContain('type="password"');
    expect(tag).toContain('autoComplete="current-password"');
    expect(tag).toContain('autoCapitalize="off"');
    expect(tag).toContain('autoCorrect="off"');
    expect(tag).toContain('spellCheck="false"');
    expect(tag).toMatch(/\brequired(=""|\s|\/|>)/);
    expect(tag).toContain('maxLength="200"');
    expect(tag).not.toContain('aria-invalid');
    expect(tag).not.toContain('aria-describedby');
  });

  it('pulsante Mostra: type=button, aria-pressed=false, aria-controls, aria-label, mai pieno', () => {
    const html = renderToStaticMarkup(<PasswordField />);
    const button = html.match(/<button[^>]*>[^<]*<\/button>/)?.[0] ?? '';
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-pressed="false"');
    expect(button).toContain('aria-controls="password"');
    expect(button).toContain('aria-label="Mostra password"');
    expect(button).toMatch(/>Mostra<\/button>$/);
    expect(html).not.toContain('btn-primary');
    expect(html).toContain('btn-secondary');
  });

  it('il pulsante segue il campo nell\'ordine del DOM (tab: campo, poi pulsante)', () => {
    const html = renderToStaticMarkup(<PasswordField />);
    expect(html.indexOf('<input')).toBeLessThan(html.indexOf('<button'));
  });

  it('invalid e describedBy arrivano sull\'input', () => {
    const tag = inputTag(renderToStaticMarkup(<PasswordField invalid describedBy="login-errore" />));
    expect(tag).toContain('aria-invalid="true"');
    expect(tag).toContain('aria-describedby="login-errore"');
  });

  it('nextVisibility alterna true e false', () => {
    expect(nextVisibility(false)).toBe(true);
    expect(nextVisibility(true)).toBe(false);
  });
});
