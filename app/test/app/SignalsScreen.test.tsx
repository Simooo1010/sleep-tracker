import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SignalsScreen } from '../../src/app/segnali/SignalsScreen';
import { MemoryRepo } from '../../src/server/memory-repo';
import { loadSignalsPage } from '../../src/server/pages/signals';
import { DEMO_NOW, buildDemoSeed } from '../../src/server/seed';
import type { StoredEvent } from '../../src/server/types';

const NOW = new Date(DEMO_NOW);

async function render(repo: MemoryRepo): Promise<string> {
  const { view } = await loadSignalsPage(repo, NOW);
  return renderToStaticMarkup(<SignalsScreen view={view} />);
}

function clean(html: string) {
  expect(html).not.toMatch(/NaN|undefined|\bnull\b/);
  expect(html).not.toMatch(/dimenticat|mancat|errore/i);
}

describe('SignalsScreen', () => {
  it('dataset demo: una riga per automazione, registro e nessun pulsante', async () => {
    const html = await render(new MemoryRepo(buildDemoSeed(DEMO_NOW)));
    for (const name of ['Sveglia interrotta', 'Riposo attivato', 'Check serale', 'Sonnellino rapido', 'Prima apertura al mattino', 'Stima di riserva', 'Recupero sonnellino']) {
      expect(html).toContain(name);
    }
    expect(html).toContain('Ultimi segnali');
    expect(html).toContain('Registrato');
    expect(html).toContain('badge badge-ok">Attivo<');
    expect(html.match(/<li class="signal /g)).toHaveLength(7);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<main');
    expect(html).not.toContain('<h1');
    clean(html);
  });

  it('dataset vuoto: cinque automazioni da configurare, testo calmo, nessun avviso', async () => {
    const html = await render(new MemoryRepo());
    expect(html.match(/badge-out">Da configurare</g)).toHaveLength(5);
    expect(html).toContain('Nessun segnale ancora');
    expect(html).toContain('Ancora nessun evento registrato.');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('in pausa');
    clean(html);
  });

  it('segnale inattivo: riga in pausa e un solo avviso neutro con role="status"', async () => {
    const old: StoredEvent[] = [
      { type: 'wake', ts: '2026-10-18T05:30:00Z', source: 'comandi', idempotencyKey: 'wake-old' },
      { type: 'bedtime_candidate', ts: '2026-10-17T21:30:00Z', source: 'comandi', idempotencyKey: 'bed-old' },
    ];
    const html = await render(new MemoryRepo({ events: old }));
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('La sveglia interrotta non arriva da');
    expect(html).toContain('in pausa');
    expect(html).toContain('badge-missing">Inattivo<');
    clean(html);
  });
});
