import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  RegularityScreen,
  bedMinFromClock,
  coverageProps,
  parseSignedMin,
  toDriftProps,
  toNightBarsNights,
  type RegularitySection,
} from '../../src/app/regolarita/RegularityScreen';
import { MemoryRepo } from '../../src/server/memory-repo';
import { loadRegularityPage } from '../../src/server/pages/regularity';
import { buildDemoSeed, DEMO_NOW } from '../../src/server/seed';
import { buildRegularityView, type RegularityView } from '../../src/server/views/regularity';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const clean = (html: string) => expect(html).not.toMatch(/NaN|undefined|Infinity|\bnull\b/);

/** Il blocco di un albero ('phone' | 'desktop'): dal suo contenitore alla fine del markup del livello. */
function layout(html: string, which: 'phone' | 'desktop'): string {
  const start = html.indexOf(`data-layout="${which}"`);
  expect(start).toBeGreaterThan(-1);
  const other = html.indexOf('data-layout="', start + 10);
  return other === -1 ? html.slice(start) : html.slice(start, other);
}

async function demoView(): Promise<RegularityView> {
  const repo = new MemoryRepo(buildDemoSeed(DEMO_NOW));
  return (await loadRegularityPage(repo, new Date(DEMO_NOW))).view;
}

describe('mappatura view model → props', () => {
  it('parseSignedMin legge i formati del view model', () => {
    expect(parseSignedMin('+12 min')).toBe(12);
    expect(parseSignedMin('−8 min')).toBe(-8);
    expect(parseSignedMin('0 min')).toBe(0);
    expect(parseSignedMin('+8')).toBe(8);
    expect(parseSignedMin('—')).toBeNull();
  });

  it('bedMinFromClock: minuti dalle 18:00', () => {
    expect(bedMinFromClock('23:35')).toBe(335);
    expect(bedMinFromClock('00:40')).toBe(400);
    expect(bedMinFromClock('—')).toBeNull();
  });

  it('le barre tornano ai minuti originali, gli scarti e le eccezioni restano marcate', async () => {
    const view = await demoView();
    const nights = toNightBarsNights(view.rows);
    expect(nights).toHaveLength(15);
    expect(nights[14]?.label).toBe('Oggi');
    expect(nights[14]?.fullLabel).toMatch(/^stanotte, sabato 24 ottobre/);
    view.rows.forEach((r, i) => {
      const n = nights[i];
      if (r.bar === null) {
        expect(n).toMatchObject({ provenance: 'mancante', bedMin: null, wakeMin: null });
      } else {
        expect(n?.bedMin).not.toBeNull();
        expect(n?.wakeMin).not.toBeNull();
        expect((n?.wakeMin as number) + 180).toBeGreaterThan((n?.bedMin as number) - 180);
      }
      if (r.isException) expect(n?.fullLabel).toContain('eccezione');
    });
  });

  it('la deriva nascosta passa shiftMin = null; quella visibile ha mediane e spostamento', async () => {
    const view = await demoView();
    const d = toDriftProps(view.drift);
    expect(d.weeklyBedMin).toHaveLength(6);
    expect(d.shiftMin).toBeGreaterThan(0);
    expect(d.spanWeeks).toBeGreaterThan(0);
    const hidden = buildRegularityView({ today: '2026-10-24', nights: [] }).drift;
    expect(toDriftProps(hidden)).toMatchObject({ shiftMin: null, spanWeeks: null });
  });

  it('coverageProps scarta i segni incoerenti con i conteggi', () => {
    const ok = { used: 2, window: 3, text: '', shortText: '', marks: ['confermata', 'stimata', 'mancante'] as const };
    expect(coverageProps({ ...ok, marks: [...ok.marks] })).toMatchObject({ used: 2, total: 3, marks: [...ok.marks] });
    expect(coverageProps({ ...ok, used: 3, marks: [...ok.marks] })).toEqual({ used: 3, total: 3 });
  });
});

describe('RegularityScreen con i dati demo', () => {
  it('un solo h1 "Regolarità", nessun main e nessun pulsante pieno', async () => {
    const html = renderToStaticMarkup(<RegularityScreen view={await demoView()} />);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('>Regolarità</h1>');
    expect(html).not.toContain('<main');
    expect(html).not.toContain('btn-primary');
    clean(html);
  });

  it('PC: confronto notti, cinque StatTile, DriftChart con badge, feriali e weekend', async () => {
    const view = await demoView();
    const d = layout(renderToStaticMarkup(<RegularityScreen view={view} />), 'desktop');
    expect(d).toContain('Confronto tra notti');
    expect(d).toContain('<figure');
    for (const label of ['Scarto letto', 'Scarto sveglia', 'Nella tolleranza', 'Punto medio', 'Social jet lag']) {
      expect(d).toContain(`role="group" aria-label="${label}"`);
    }
    expect(d).toContain('Deriva della mediana');
    expect(d).toContain(view.drift.badge as string);
    expect(d).toContain('Feriali e weekend');
    expect(d).toContain(view.weekWeekend.sjlText as string);
    expect(d).toContain('Weekend = notti di venerdì e sabato.');
    expect(d).toContain(view.headline.big);
    clean(d);
  });

  it('PC: ogni grafico ha un riassunto testuale per i lettori di schermo', async () => {
    const d = layout(renderToStaticMarkup(<RegularityScreen view={await demoView()} />), 'desktop');
    expect(d).toMatch(/role="img" aria-label="Confronto tra notti: 15 notti sull&#x27;asse 21:00 → 11:00\./);
    expect(d).toMatch(/role="img" aria-label="Deriva della mediana\. Deriva \+\d+ min in \d+ settimane\./);
    expect(d).toContain('<caption');
    expect(d).toContain('Mediana del letto');
  });

  it('copertura sempre visibile in stile "N su 14 notti", eccezioni marcate "Eccezione"', async () => {
    const view = await demoView();
    const t = text(layout(renderToStaticMarkup(<RegularityScreen view={view} />), 'desktop'));
    expect(t).toMatch(/Calcolata su \d+ su 14 notti/);
    expect(t).toContain(`Calcolata su ${view.baseline.coverage.used} su 14 notti`);
    const withException = view.rows.some((r) => r.isException && r.bar !== null);
    if (withException) {
      expect(t).toContain('Eccezione');
      expect(t).toMatch(/esclus[ae] dal riferimento/);
    }
  });

  it('telefono: un solo numero grande, badge di deriva e quattro voci, senza grafici', async () => {
    const view = await demoView();
    const p = layout(renderToStaticMarkup(<RegularityScreen view={view} />), 'phone');
    expect(p.match(/class="display-lg"/g)).toHaveLength(1);
    expect(p).toContain(`class="display-lg">${view.headline.big}<`);
    expect(p).toContain(view.headline.driftChip as string);
    expect(p).toMatch(/(Oltre|Entro) la tolleranza di ± 30 min\./);
    expect(p.match(/class="list-row /g)).toHaveLength(4);
    for (const title of ['Confronto tra notti', 'Cinque indicatori', 'Deriva del letto', 'Feriali e weekend']) {
      expect(p).toContain(`<span class="tt">${title}</span>`);
    }
    expect(p).not.toContain('<figure');
    expect(p).not.toContain('Indietro');
    expect(text(p)).toMatch(/Calcolata su \d+ su 14 notti/);
    clean(p);
  });

  const sections: Array<[RegularitySection, string]> = [
    ['notti', 'Ultime 14 notti e stanotte'],
    ['indicatori', 'Scarto letto'],
    ['deriva', 'Deriva della mediana'],
    ['weekend', 'Social jet lag'],
  ];
  it.each(sections)('telefono: la sezione "%s" si apre a tutto schermo con "Indietro" in alto', async (section, marker) => {
    const view = await demoView();
    const p = layout(renderToStaticMarkup(<RegularityScreen view={view} initialSection={section} />), 'phone');
    expect(p.indexOf('Indietro')).toBeGreaterThan(-1);
    expect(p.indexOf('Indietro')).toBeLessThan(p.indexOf('<h2'));
    expect(p).toContain(marker);
    expect(p).not.toContain('class="list-row ');
    expect(p).not.toContain('display-lg');
    clean(p);
  });
});

describe('RegularityScreen: dati scarsi e vuoto', () => {
  it('sotto soglia: "Servono almeno N notti. Per ora ne hai M." e "—" con la parola Mancante', () => {
    const view = buildRegularityView({
      today: '2026-10-24',
      nights: [],
    });
    const html = renderToStaticMarkup(<RegularityScreen view={view} />);
    expect(text(html)).toContain(view.emptyText as string);
    expect(html).not.toContain('<figure');
    clean(html);
  });

  it('poche notti: nessun grafico di confronto, tessere con parola Mancante e soglia scritta', async () => {
    const full = await demoView();
    // Solo tre notti con orari: si parte dal seed e si tengono le ultime tre.
    const repo = new MemoryRepo(buildDemoSeed(DEMO_NOW));
    const nights = (await repo.listNights('2026-10-20', '2026-10-24')).filter((n) => n.status === 'confermata').slice(-3);
    expect(nights.length).toBeGreaterThan(0);
    const view = buildRegularityView({ today: full.rows[14]?.nightDate as string, nights });
    expect(view.baseline.hidden).toBe(true);
    const html = renderToStaticMarkup(<RegularityScreen view={view} />);
    const d = layout(html, 'desktop');
    expect(text(d)).toMatch(/Servono almeno \d+ notti\. Per ora ne hai \d+\./);
    expect(d).toContain('Mancante');
    expect(d).not.toContain('role="img" aria-label="Confronto tra notti');
    expect(d).toContain('role="img" aria-label="Deriva della mediana');
    const p = layout(html, 'phone');
    expect(p).toContain('class="display-lg">—<');
    expect(text(p)).toMatch(/Mancante/);
    clean(html);
  });

  it('vuoto: messaggio calmo con copertura, nessun grafico', () => {
    const view = buildRegularityView({ today: '2026-10-24', nights: [] });
    expect(view.empty).toBe(true);
    const html = renderToStaticMarkup(<RegularityScreen view={view} />);
    expect(text(html)).toContain('Ancora nessuna notte con orari');
    expect(text(html)).toContain('Calcolata su 0 su 14 notti');
    expect(html).not.toContain('data-layout');
    expect(html).not.toContain('role="img" aria-label="Confronto');
    expect(html).not.toMatch(/!|NaN|undefined/);
  });
});
