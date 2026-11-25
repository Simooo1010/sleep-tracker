import { describe, expect, it } from 'vitest';

import { WARM_PATHS, formatSyncedAt, offlineSupported } from '../src/lib/offline';
import { NAV_ITEMS } from '../src/components/FloatingNav';

const NOW = new Date('2026-10-28T10:00:00+01:00');

describe('formatSyncedAt', () => {
  it('oggi, ieri e data estesa nel fuso di Roma', () => {
    expect(formatSyncedAt('2026-10-28T08:12:00+01:00', NOW)).toBe('oggi alle 08:12');
    expect(formatSyncedAt('2026-10-27T21:40:00+01:00', NOW)).toBe('ieri alle 21:40');
    expect(formatSyncedAt('2026-10-20T07:05:00+02:00', NOW)).toBe('il 20 ottobre alle 07:05');
  });
  it('valore assente o non valido: nessun orario', () => {
    expect(formatSyncedAt(null, NOW)).toBeNull();
    expect(formatSyncedAt('non-una-data', NOW)).toBeNull();
  });
});

describe('offlineSupported', () => {
  it('senza service worker nel browser non è supportato', () => {
    expect(offlineSupported({ NODE_ENV: 'production' })).toBe(false);
  });
});

describe('WARM_PATHS', () => {
  it('copre tutte le voci di navigazione e le Impostazioni', () => {
    for (const item of NAV_ITEMS) expect(WARM_PATHS).toContain(item.href);
    expect(WARM_PATHS).toContain('/impostazioni');
  });
  it('sono percorsi interni, senza query e senza /login o /api', () => {
    for (const path of WARM_PATHS) {
      expect(path.startsWith('/')).toBe(true);
      expect(path).not.toMatch(/[?#]|^\/(login|api)/);
    }
  });
});
