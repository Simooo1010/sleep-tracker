import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DESIGN_FILES, designPaths } from '../scripts/sync-design.mjs';

describe('copie del design system', () => {
  it.each(DESIGN_FILES)('%s è identico alla copia in %s (altrimenti: npm run sync:design)', (from, to) => {
    const { source, target } = designPaths([from, to]);
    expect(readFileSync(target).equals(readFileSync(source))).toBe(true);
  });
});
