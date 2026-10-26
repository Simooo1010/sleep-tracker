import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(join(import.meta.dirname, '..', 'src', p), 'utf8');

describe('barra di stato iOS (PWA)', () => {
  it('è trasparente e mostra lo sfondo dell\'app', () => {
    expect(src('app/layout.tsx')).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
  });

  it('il contenuto in alto rispetta la safe area (topbar e login)', () => {
    expect(src('components/AppShell.module.css')).toMatch(/\.topbar\s*\{[^}]*safe-area-inset-top/);
    expect(src('app/login/page.module.css')).toContain('safe-area-inset-top');
  });
});
