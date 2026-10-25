import { describe, expect, it } from 'vitest';

import { MemoryRepo } from '../../../src/server/memory-repo';
import { loadSignalsPage } from '../../../src/server/pages/signals';
import { DEMO_NOW, buildDemoSeed } from '../../../src/server/seed';
import type { StoredEvent } from '../../../src/server/types';

const NOW = new Date(DEMO_NOW);

describe('loadSignalsPage', () => {
  it('con il dataset demo: oggi è sabato 24 ottobre, righe e registro popolati', async () => {
    const repo = new MemoryRepo(buildDemoSeed(DEMO_NOW));
    const { today, view } = await loadSignalsPage(repo, NOW);
    expect(today).toBe('2026-10-24');
    expect(view.empty).toBe(false);
    expect(view.rows.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Sveglia interrotta', 'Riposo attivato', 'Check serale', 'Sonnellino rapido', 'Stima di riserva', 'Recupero sonnellino']),
    );
    expect(view.log.items.length).toBeGreaterThan(0);
    expect(view.log.items.length).toBeLessThanOrEqual(8);
  });

  it('con un repo vuoto: nessun evento, tutte le automazioni da configurare, nessun avviso', async () => {
    const { today, view } = await loadSignalsPage(new MemoryRepo(), NOW);
    expect(today).toBe('2026-10-24');
    expect(view.empty).toBe(true);
    expect(view.warnings).toEqual([]);
    const configurable = view.rows.filter((r) => r.status !== 'riserva');
    expect(configurable.length).toBeGreaterThanOrEqual(5);
    expect(configurable.every((r) => r.status === 'da-configurare')).toBe(true);
  });

  it('un segnale fermo da più giorni è in pausa e porta un solo avviso neutro', async () => {
    const old: StoredEvent = { type: 'wake', ts: '2026-10-18T05:30:00Z', source: 'comandi', idempotencyKey: 'wake-old' };
    const repo = new MemoryRepo({ events: [old] });
    const { view } = await loadSignalsPage(repo, NOW);
    const wake = view.rows.find((r) => r.key === 'wake');
    expect(wake?.status).toBe('inattivo');
    expect(wake?.statusWord).toBe('In pausa');
    expect(view.warnings).toHaveLength(1);
    expect(view.notWaitingFor).toContain('wake');
  });

  it('ignora gli eventi più vecchi di 30 giorni e quelli futuri', async () => {
    const events: StoredEvent[] = [
      { type: 'wake', ts: '2026-09-01T05:30:00Z', source: 'comandi', idempotencyKey: 'wake-very-old' },
      { type: 'wake', ts: '2026-10-30T05:30:00Z', source: 'comandi', idempotencyKey: 'wake-future' },
    ];
    const { view } = await loadSignalsPage(new MemoryRepo({ events }), NOW);
    expect(view.empty).toBe(true);
  });

  it('la data di oggi segue il fuso Europe/Rome, non UTC', async () => {
    const { today } = await loadSignalsPage(new MemoryRepo(), new Date('2026-10-24T23:30:00Z'));
    expect(today).toBe('2026-10-25');
  });
});
