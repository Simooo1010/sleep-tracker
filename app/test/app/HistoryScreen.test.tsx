import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  HistoryScreen,
  NO_DATA_TEXT,
  coverageMarks,
  historyHref,
  minutesFromCompact,
  toCalendarNights,
} from '../../src/app/storico/HistoryScreen';
import { MemoryRepo } from '../../src/server/memory-repo';
import { loadHistoryPage } from '../../src/server/pages/history';
import { DEMO_NOW, buildDemoSeed } from '../../src/server/seed';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

const NOW = new Date(DEMO_NOW);
const repo = () => new MemoryRepo(buildDemoSeed(DEMO_NOW));

async function render(params: { m?: string; d?: string }, r: MemoryRepo = repo()) {
  const { today, view } = await loadHistoryPage(r, NOW, params);
  return { today, view, html: renderToStaticMarkup(<HistoryScreen view={view} today={today} />) };
}

describe('funzioni pure', () => {
  it('minutesFromCompact', () => {
    expect(minutesFromCompact('7h12')).toBe(432);
    expect(minutesFromCompact('0h40')).toBe(40);
    expect(minutesFromCompact('—')).toBeNull();
    expect(minutesFromCompact('')).toBeNull();
  });

  it('historyHref', () => {
    expect(historyHref('2026-09')).toBe('/storico?m=2026-09');
    expect(historyHref('2026-09', '2026-09-03')).toBe('/storico?m=2026-09&d=2026-09-03');
  });
});

describe('HistoryScreen, mese corrente', () => {
  it('titolo, un solo h1, frecce con aria-label e successivo disabilitato', async () => {
    const { html } = await render({});
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('>Storico</h1>');
    expect(html).toContain('Ottobre 2026');
    expect(html).toContain('aria-label="Mese precedente"');
    expect(html).toContain('href="/storico?m=2026-09"');
    expect(html).toMatch(/<button[^>]*aria-label="Mese successivo"[^>]*disabled/);
    expect(html).not.toContain('<main');
  });

  it('giorni scritti con parola di stato, oggi selezionato, dettaglio con provenienza in parola', async () => {
    const { html } = await render({});
    expect(html).toMatch(/aria-label="sabato 24 ottobre, \d+h \d{2}m, (confermata|stimata)"/);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Letto: ');
    expect(html).toContain('Sveglia: ');
    expect(html).toContain('badge-');
    expect(html).toContain('Notti con dati nel mese:');
  });

  it('nessun NaN, undefined o null nel markup', async () => {
    for (const params of [{}, { m: '2026-09' }, { m: '2026-08' }]) {
      const { html } = await render(params);
      expect(html).not.toMatch(/NaN|undefined|null/);
    }
  });
});

describe('HistoryScreen, mese passato', () => {
  it('settembre 2026: frecce entrambe attive, ultimo giorno scelto', async () => {
    const { html, view } = await render({ m: '2026-09' });
    expect(html).toContain('Settembre 2026');
    expect(html).toContain('href="/storico?m=2026-08"');
    expect(html).toContain('href="/storico?m=2026-10"');
    expect(html).not.toMatch(/<button[^>]*aria-label="Mese successivo"/);
    expect(view.selectedDate).toBe('2026-09-30');
    expect(html).toContain('mercoledì 30 settembre');
  });
});

describe('dettaglio di casi particolari', () => {
  it('giorno mancante: testo calmo, badge Mancante, nessun orario', async () => {
    const r = repo();
    const nights = await r.listNights('2026-08-01', '2026-10-24');
    const missing = nights.find((n) => n.status === 'mancante' && n.bedAt.value === null && n.wakeAt.value === null);
    expect(missing).toBeDefined();
    const date = missing!.nightDate;
    const { html, view } = await render({ m: date.slice(0, 7), d: date }, r);
    expect(view.detail?.status).toBe('mancante');
    expect(html).toContain(NO_DATA_TEXT);
    expect(html).toContain('Mancante');
    expect(html).not.toContain(' → </p>');
    const cal = toCalendarNights(view).find((n) => n.date === date);
    expect(cal?.minutes).toBeNull();
    expect(cal?.start).toBeUndefined();
  });

  it('giorno senza voce nel repo (repo vuoto): dettaglio calmo', async () => {
    const { html } = await render({}, new MemoryRepo());
    expect(html).toContain(NO_DATA_TEXT);
    expect(html).toContain('Nessuna notte registrata in questo mese.');
  });

  it('notte-eccezione: tag Eccezione e nota sulla regolarità', async () => {
    const r = repo();
    const nights = await r.listNights('2026-08-01', '2026-10-24');
    const exc = nights.find((n) => n.isException && n.bedAt.value !== null);
    expect(exc).toBeDefined();
    const date = exc!.nightDate;
    const { html } = await render({ m: date.slice(0, 7), d: date }, r);
    expect(html).toContain('Eccezione');
    expect(html).toContain('non conta nel riferimento della regolarità');
  });
});

describe('mappatura view → Calendar', () => {
  it('solo giorni passati; durate in minuti; orari solo per il giorno scelto', async () => {
    const { view } = await render({ d: '2026-10-10' });
    const nights = toCalendarNights(view);
    expect(nights).toHaveLength(24);
    const sel = nights.find((n) => n.date === '2026-10-10')!;
    expect(sel.start).toMatch(/^\d{2}:\d{2}$/);
    expect(sel.end).toMatch(/^\d{2}:\d{2}$/);
    expect(sel.tags?.length).toBeGreaterThan(0);
    expect(nights.filter((n) => n.date !== '2026-10-10').every((n) => n.start === undefined)).toBe(true);
    for (const n of nights) if (n.minutes !== null) expect(Number.isFinite(n.minutes)).toBe(true);
    expect(coverageMarks(view)).toHaveLength(24);
  });
});
