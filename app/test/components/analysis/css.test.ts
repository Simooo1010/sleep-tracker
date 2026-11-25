import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, '../../../src/components/analysis');
const files = readdirSync(DIR).filter((f) => f.endsWith('.module.css'));
const tokens = readFileSync(join(__dirname, '../../../../docs/design/tokens.css'), 'utf8');

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('CSS dei componenti di /analisi', () => {
  it('esiste un modulo per ogni componente', () => {
    expect(files.sort()).toEqual(
      ['ActionCard', 'AnalysisScene', 'CauseCard', 'NightsTrend', 'ScoreRing'].map((n) => `${n}.module.css`),
    );
  });

  describe.each(files)('%s', (file) => {
    const css = stripComments(readFileSync(join(DIR, file), 'utf8'));

    it('nessun colore letterale (hex, rgb, hsl, nomi)', () => {
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
      expect(css).not.toMatch(/(?:color|background|fill|stroke|border[a-z-]*)\s*:[^;]*(?<![-\w])(white|black|red|green|blue|gray|grey)(?![-\w])/);
    });

    it('i colori vengono da var(--…) definite in tokens.css', () => {
      const used = [...css.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1] ?? '');
      const local = new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? ''));
      const inline = new Set(['h', 'delay', 'ring-offset', 'part-pct']);
      for (const name of used) {
        if (local.has(name) || inline.has(name)) continue;
        expect(tokens, `--${name}`).toContain(`--${name}:`);
      }
    });

    it('niente px per font e spazi', () => {
      const decls = css.match(/(font-size|line-height|padding[a-z-]*|margin[a-z-]*|gap|row-gap|column-gap|width|height|top|left|right|bottom|inset)\s*:[^;]+;/g) ?? [];
      for (const d of decls) expect(d, d).not.toMatch(/\d px|\dpx/);
      expect(css).not.toMatch(/\d(?:\.\d+)?px/);
    });

    it('se anima, rispetta prefers-reduced-motion', () => {
      if (/@keyframes|animation\s*:/.test(css)) {
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*animation:\s*none/);
      }
    });

    it('durate delle animazioni d’entrata ≤ 600 ms; i loop sono lenti (≥ 4 s)', () => {
      for (const m of css.matchAll(/animation\s*:\s*[a-z-]+\s+(\d+)(ms|s)\b([^;]*);/g)) {
        const ms = m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
        if (/infinite/.test(m[3] ?? '')) expect(ms).toBeGreaterThanOrEqual(4000);
        else expect(ms).toBeLessThanOrEqual(600);
      }
    });
  });
});
