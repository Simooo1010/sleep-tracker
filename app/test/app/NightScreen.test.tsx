import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions', () => ({
  actionConfirmNight: vi.fn(),
  actionUndoConfirmNight: vi.fn(),
  actionRateNight: vi.fn(),
}));
vi.mock('../../src/app/NightSections', () => ({
  NightSections: ({ todayDate }: { todayDate: string }) => <div data-testid="sections">{todayDate}</div>,
}));

import { NightScreen, toNightIso } from '../../src/app/NightScreen';
import { MemoryRepo } from '../../src/server/memory-repo';
import { loadNightPage } from '../../src/server/pages/night';
import { DEMO_NOW, buildDemoSeed } from '../../src/server/seed';
import { buildNightView, type NightView } from '../../src/server/views';

const NOW = new Date(DEMO_NOW);
const TODAY = '2026-10-24';

async function demoView(): Promise<NightView> {
  const { view } = await loadNightPage(new MemoryRepo(buildDemoSeed(DEMO_NOW)), NOW);
  return view;
}

const html = (view: NightView) => renderToStaticMarkup(<NightScreen view={view} todayDate={TODAY} />);
const primaries = (s: string) => (s.match(/btn-primary/g) ?? []).length;

function clean(s: string) {
  expect(s).not.toMatch(/NaN|undefined|\bnull\b|\[object/);
}

describe('toNightIso', () => {
  it('letto serale (>= 18:00): la sera prima', () => {
    expect(toNightIso('2026-10-24', '23:48', 'bed')).toBe('2026-10-23T21:48:00.000Z');
    expect(toNightIso('2026-10-24', '18:00', 'bed')).toBe('2026-10-23T16:00:00.000Z');
  });

  it('letto dopo mezzanotte: il giorno stesso', () => {
    expect(toNightIso('2026-10-24', '00:40', 'bed')).toBe('2026-10-23T22:40:00.000Z');
    expect(toNightIso('2026-10-24', '17:59', 'bed')).toBe('2026-10-24T15:59:00.000Z');
  });

  it('sveglia: sempre il giorno della notte', () => {
    expect(toNightIso('2026-10-24', '07:20', 'wake')).toBe('2026-10-24T05:20:00.000Z');
  });

  it('ora legale: la notte del 25 ottobre 2026 dura 25 ore (letto +2, sveglia +1)', () => {
    const bed = toNightIso('2026-10-25', '23:48', 'bed');
    const wake = toNightIso('2026-10-25', '07:30', 'wake');
    expect(bed).toBe('2026-10-24T21:48:00.000Z');
    expect(wake).toBe('2026-10-25T06:30:00.000Z');
    expect((Date.parse(wake as string) - Date.parse(bed as string)) / 60_000).toBe(522);
    // 02:30 è ambiguo: prima occorrenza, ancora in ora legale
    expect(toNightIso('2026-10-25', '02:30', 'bed')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('orario non valido: null', () => {
    expect(toNightIso('2026-10-24', '25:00', 'bed')).toBeNull();
    expect(toNightIso('2026-10-24', '', 'wake')).toBeNull();
    expect(toNightIso('2026-10-24', 'abc', 'wake')).toBeNull();
  });
});

describe('NightScreen', () => {
  it('stimata: scheda Stanotte con badge Stimata, spiegazione e una sola Conferma piena', async () => {
    const view = await demoView();
    const out = html(view);
    expect(view.status).toBe('stimata');
    expect(out).toContain('>Stanotte</h2>');
    expect(out).toContain('badge badge-estimated">Stimata</span>');
    expect(out).toContain(view.durationText);
    expect(out).toContain('Controlla e conferma.');
    expect(out).toContain('>Conferma</button>');
    expect(out).toContain('>Correggi orari</button>');
    expect(primaries(out)).toBe(1);
    expect(out).not.toContain('Registrata');
    expect(out).not.toContain('Annulla');
    // il voto di energia compare solo dopo la conferma
    expect(out).not.toContain('role="radiogroup"');
    expect(out).not.toContain('role="alert"');
    clean(out);
  });

  it('stimata: timeline "La notte, in ordine" e sezioni dopo la scheda', async () => {
    const out = html(await demoView());
    expect(out).toContain('La notte, in ordine');
    expect(out).toContain('<div data-testid="sections">2026-10-24</div>');
    expect(out.indexOf('Stanotte')).toBeLessThan(out.indexOf('La notte, in ordine'));
    expect(out.indexOf('La notte, in ordine')).toBeLessThan(out.indexOf('data-testid="sections"'));
  });

  it('stimata: pillola di regolarità con la parola OK o Fuori (mai solo colore)', async () => {
    const view = await demoView();
    const out = html(view);
    if (view.regularity) {
      expect(out).toMatch(/badge badge-(ok|out)">Letto [^<]+ · Sveglia [^<]+ · (OK|Fuori)</);
    }
  });

  it('confermata: Registrata. Grazie., niente Conferma piena, voto di energia (MoonRating) presente', () => {
    const seed = buildDemoSeed(DEMO_NOW);
    const nights = (seed.nights ?? []).map((n) => (n.nightDate === TODAY ? { ...n, status: 'confermata' as const } : n));
    const view = buildNightView({ today: TODAY, nights, events: [], eveningChecks: [] });
    expect(view.status).toBe('confermata');
    const out = html(view);
    expect(out).toContain('badge badge-confirmed">Confermata</span>');
    expect(out).toContain('Registrata. Grazie.');
    expect(out).toContain('Orari confermati da te.');
    expect(primaries(out)).toBe(0);
    expect(out).toContain('role="radiogroup"');
    expect(out).toContain('aria-label="Energia di questa mattina"');
    // niente Annulla: la notte era già confermata, non c'è una versione precedente da ripristinare
    expect(out).not.toContain('>Annulla<');
    expect(out).toContain('>Correggi orari</button>');
    clean(out);
  });

  it('mancante: nessun numero, Aggiungi orari, nessuna Timeline vuota, nessun voto', () => {
    const view = buildNightView({ today: TODAY, nights: [] });
    const out = html(view);
    expect(view.status).toBe('mancante');
    expect(out).toContain('badge badge-missing">Mancante</span>');
    expect(out).toContain('Durata mancante');
    expect(out).toContain('>Aggiungi orari</button>');
    expect(out).toContain('Per stanotte non è arrivato nessun segnale.');
    expect(out).not.toContain('>Conferma</button>');
    expect(out).not.toContain('role="radiogroup"');
    expect(out).not.toContain('La notte, in ordine');
    expect(primaries(out)).toBe(0);
    expect(out).toContain('data-testid="sections"');
    clean(out);
  });

  it('struttura accessibile: un solo h2 Stanotte, nessun main, nessun h1 (lo mette la pagina)', async () => {
    const out = html(await demoView());
    expect(out).not.toContain('<main');
    expect(out).not.toContain('<h1');
    expect(out.match(/<h2[^>]*>Stanotte<\/h2>/g)).toHaveLength(1);
    expect(out).toMatch(/<section class="card [^"]*" aria-labelledby="([^"]+)"><h2 id="\1"/);
    expect(out).toContain('aria-busy="false"');
  });
});
