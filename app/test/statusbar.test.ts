import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (p: string) => readFileSync(join(import.meta.dirname, '..', 'src', p), 'utf8');

describe('barra di stato iOS (PWA)', () => {
  it('è trasparente: senza, iOS la lascia bianca sopra l\'app', () => {
    expect(src('app/layout.tsx')).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
  });
});
