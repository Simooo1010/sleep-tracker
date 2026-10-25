import { describe, expect, it } from 'vitest';

import { MemoryRepo } from '../../../src/server/memory-repo';
import { createdText, formatTokenDay, lastUsedText, loadSettingsPage, tokensSummary } from '../../../src/server/pages/settings';

describe('loadSettingsPage', () => {
  it('repo vuoto: nessun token', async () => {
    expect(await loadSettingsPage(new MemoryRepo())).toEqual({ tokens: [] });
  });

  it('elenca i token dal più recente, attivi e revocati, senza hash', async () => {
    let tick = 0;
    const repo = new MemoryRepo({ now: () => new Date(Date.UTC(2026, 9, 24, 8, tick++)) });
    const a = await repo.createToken({ tokenHash: 'hash-a-segreto', label: 'iPhone' });
    await repo.createToken({ tokenHash: 'hash-b-segreto', label: 'iPad' });
    await repo.revokeToken(a.id);
    const { tokens } = await loadSettingsPage(repo);
    expect(tokens.map((t) => [t.label, t.active])).toEqual([
      ['iPad', true],
      ['iPhone', false],
    ]);
    expect(JSON.stringify(tokens)).not.toMatch(/hash-|segreto/);
  });

  it('un errore del repo si propaga (la pagina lo trasforma in un messaggio calmo)', async () => {
    const repo = new MemoryRepo();
    repo.listTokens = async () => {
      throw new Error('db giù');
    };
    await expect(loadSettingsPage(repo)).rejects.toThrow('db giù');
  });
});

describe('frasi dei token', () => {
  it('data in italiano, fuso Europe/Rome', () => {
    expect(formatTokenDay('2026-10-24T08:00:00.000Z')).toBe('24 ottobre 2026');
    expect(formatTokenDay('2026-10-24T23:30:00.000Z')).toBe('25 ottobre 2026'); // 01:30 a Roma
    expect(formatTokenDay('boh')).toBeNull();
  });

  it('creato il / ultimo uso / mai usato', () => {
    expect(createdText({ createdAt: '2026-10-24T08:00:00.000Z' })).toBe('Creato il 24 ottobre 2026');
    expect(createdText({ createdAt: 'boh' })).toBe('Creato di recente');
    expect(lastUsedText({ lastUsedAt: null })).toBe('Mai usato');
    expect(lastUsedText({ lastUsedAt: 'boh' })).toBe('Mai usato');
    expect(lastUsedText({ lastUsedAt: '2026-10-25T06:12:00.000Z' })).toBe('Ultimo uso 25 ottobre 2026, 07:12');
  });

  it('sintesi dei token attivi', () => {
    expect(tokensSummary([])).toBe('Nessun token attivo');
    expect(tokensSummary([{ active: false }])).toBe('Nessun token attivo');
    expect(tokensSummary([{ active: true }, { active: false }])).toBe('1 token attivo');
    expect(tokensSummary([{ active: true }, { active: true }])).toBe('2 token attivi');
  });
});
