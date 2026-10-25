import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions', () => ({
  actionNap: vi.fn(),
  actionRateNight: vi.fn(),
  actionRecordQuestion: vi.fn(),
  actionSetExceptions: vi.fn(),
}));

import { actionNap, actionRateNight, actionRecordQuestion, actionSetExceptions } from '@/app/actions';
import {
  GENERIC_ERROR,
  NightSections,
  activeSlugs,
  capQuestions,
  clockOf,
  finishNap,
  questionKey,
  sectionSummaries,
  sendAnswer,
  sendExceptions,
  sendNap,
  sendSkip,
  toggleSlug,
} from '@/app/NightSections';
import { buildNightView, type NightView, type QuickQuestionView } from '@/server/views';

import { TODAY, datasetWithTonight, expectClean } from '../server/views/fixtures';

const ds = datasetWithTonight();

const baseInput = {
  today: TODAY,
  nights: ds.nights,
  events: ds.events,
  naps: ds.naps,
  eveningChecks: ds.checks,
  exceptionTypes: [
    { slug: 'viaggio', label: 'Viaggio', uses: 3 },
    { slug: 'festa', label: 'Festa', uses: 1 },
  ],
};

const view: NightView = buildNightView(baseInput);

const q = (over: Partial<QuickQuestionView>): QuickQuestionView => ({
  kind: 'exception',
  nightDate: null,
  text: 'Domanda di prova?',
  answers: [
    { value: 'si', label: 'Sì' },
    { value: 'no', label: 'No' },
  ],
  skipLabel: 'Salta',
  ...over,
});

function render(v: NightView = view): string {
  return renderToStaticMarkup(<NightSections view={v} todayDate={TODAY} />);
}

beforeEach(() => {
  vi.mocked(actionNap).mockReset().mockResolvedValue({ ok: true, value: { nightDate: null } });
  vi.mocked(actionRateNight).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(actionRecordQuestion).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(actionSetExceptions).mockReset().mockResolvedValue({ ok: true });
});

describe('NightSections: markup con la view reale', () => {
  const html = render();

  it('la view di prova ha domande e chip', () => {
    expect(view.questions.length).toBeGreaterThan(0);
    expect(view.exceptions.chips.length).toBeGreaterThan(0);
  });

  it('un solo gruppo di domande, con avanzamento "N di M" (massimo 3)', () => {
    expect(html.match(/aria-label="Domande rapide"/g)).toHaveLength(1);
    const shown = Math.min(3, view.questions.length);
    expect(html).toContain(`Domanda rapida · 1 di ${shown}`);
    expect(html).not.toContain(`di ${shown + 1}`);
    expect(html.match(/Domanda rapida · /g)!.length).toBeLessThanOrEqual(3);
    expect(html.match(/>Salta</g)!.length).toBe(html.match(/Domanda rapida · /g)!.length);
    for (const question of capQuestions(view.questions)) expect(html).toContain(question.text.replace(/'/g, '&#x27;'));
  });

  it('chip delle eccezioni con il gruppo "Giornata particolare" e la nota', () => {
    expect(html).toContain('Giornata particolare');
    expect(html).toContain('Viaggio');
    expect(html).toContain('Festa');
    expect(html).toContain('chip chip-exc');
    expect(html).toContain('Non conta nel riferimento della regolarità.');
  });

  it('sonnellino: scheda gialla, comando rapido, titolo di livello 2', () => {
    expect(html).toContain('data-variant="nap"');
    expect(html).toContain('Inizia sonnellino');
    expect(html).toMatch(/<h2[^>]*>Sonnellino<\/h2>/);
  });

  it('"Il solito": titolo, righe con il testo e legenda a parole', () => {
    expect(html).toContain(view.comparison.title);
    expect(view.comparison.rows.length).toBeGreaterThan(0);
    for (const row of view.comparison.rows) {
      expect(html).toContain(row.label);
      expect(html).toContain(row.text);
    }
    expect(html).toContain('Barra piena: stanotte. Tratto: il tuo solito.');
  });

  it('quattro StatTile con la copertura', () => {
    expect(html.match(/class="tile tile-/g)).toHaveLength(4);
    for (const s of view.stats) expect(html).toContain(s.label);
    expect(html.match(/class="coverage /g)!.length).toBe(4);
    expect(html).toContain('Calcolata su');
  });

  it('telefono: quattro voci ListRow, nessuna sezione aperta e un "Indietro" per sezione', () => {
    expect(html.match(/class="list-row /g)).toHaveLength(4);
    expect(html).toContain('In numeri');
    expect(html.match(/data-open="false"/g)).toHaveLength(4);
    expect(html).not.toContain('data-open="true"');
    expect(html.match(/>Indietro</g)).toHaveLength(4);
    expect(html).toContain('data-hidden="false"');
  });

  it('niente pulsante pieno aggiuntivo: l’unico `btn-primary` è quello del componente sonnellino, reso secondario dal CSS', () => {
    const occurrences = [...html.matchAll(/btn-primary/g)];
    expect(occurrences).toHaveLength(1);
    const before = html.slice(0, occurrences[0]!.index);
    const lastSection = [...before.matchAll(/data-section="(\w+)"/g)].pop();
    expect(lastSection?.[1]).toBe('nap');
    const css = readFileSync(new URL('../../src/app/NightSections.module.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.nap :global\(\.btn\.btn-primary:not\(\[disabled\]\)\)\s*\{[^}]*background: transparent/);
  });

  it('ARIA: gruppi e sezioni con nome, id dei titoli risolti, nessun <main>', () => {
    expect(html).not.toContain('<main');
    expect(html).not.toContain('<h1');
    for (const m of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
      expect(html).toContain(`id="${m[1]}"`);
    }
    expect(html).toContain('role="group"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-busy');
  });

  it('testi in italiano, nessun NaN/undefined/null/[object', () => {
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object|>null</);
    expect(html).not.toMatch(/class="[^"]*\bundefined\b/);
    expect(html).not.toMatch(/!/); // niente punti esclamativi (voce del design)
  });

  it('serializzabile: la view di prova è pulita', () => {
    expectClean(view);
  });
});

describe('NightSections: casi limite', () => {
  it('zero domande: nessun gruppo di domande, le sezioni restano', () => {
    const html = render({ ...view, questions: [] });
    expect(html).not.toContain('Domande rapide');
    expect(html).not.toContain('Domanda rapida');
    expect(html).toContain('Inizia sonnellino');
    expect(html.match(/class="list-row /g)).toHaveLength(4);
  });

  it('più di tre domande: se ne vedono tre', () => {
    const many = ['confirm_night', 'energy', 'quality', 'nap_today', 'exception'].map((kind, i) =>
      q({ kind: kind as QuickQuestionView['kind'], nightDate: `2026-10-0${i + 1}`, text: `Domanda ${i + 1}?` }),
    );
    const html = render({ ...view, questions: many });
    expect(html.match(/Domanda rapida · /g)).toHaveLength(3);
    expect(html).toContain('Domanda rapida · 3 di 3');
    expect(html).not.toContain('Domanda 4?');
  });

  it('voti e sonnellini hanno cinque risposte: nessuna viene tagliata, Salta resta', () => {
    const energy = q({
      kind: 'energy',
      text: 'Che energia hai stamattina?',
      answers: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
    });
    const html = render({ ...view, questions: [energy] });
    for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`>${n}</button>`);
    expect(html).toContain('>Salta</button>');
    expect(html).toContain('Domanda rapida · 1 di 1');
    expect(html.match(/aria-label="Domande rapide"/g)).toHaveLength(1);
  });

  it('eccezioni attive: chip premuto e riepilogo a parole', () => {
    const chips = view.exceptions.chips.map((c) => ({ ...c, active: c.slug === 'viaggio' }));
    const active = { ...view, exceptions: { ...view.exceptions, chips } };
    const html = render(active);
    expect(html).toMatch(/class="chip chip-exc is-on" aria-pressed="true"[^>]*>Viaggio</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Festa</);
    expect(html).toContain('Segnata: Viaggio');
    expect(activeSlugs(active)).toEqual(['viaggio']);
  });

  it('nessuna eccezione disponibile: la sezione e la voce spariscono', () => {
    const html = render({ ...view, exceptions: { ...view.exceptions, chips: [] } });
    expect(html).not.toContain('Giornata particolare');
    expect(html.match(/class="list-row /g)).toHaveLength(3);
  });

  it('notte senza dati: testo calmo, nessun rimprovero, nessun NaN', () => {
    const empty = buildNightView({ today: TODAY, nights: [] });
    expect(empty.empty).toBe(true);
    const html = render(empty);
    expect(html).toContain(empty.emptyText!.replace(/'/g, '&#x27;'));
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
    expect(html).not.toMatch(/devi|dovresti|colpa|hai dimenticato/i);
    // Il confronto è nascosto con un testo che spiega quanti dati servono.
    expect(empty.comparison.hidden).toBe(true);
    expect(html).toContain('Servono più notti');
    expect(html.match(/class="tile tile-/g)).toHaveLength(4);
  });

  it('confronto nascosto: mostra il testo del view model, non righe', () => {
    const hidden = {
      ...view,
      comparison: { ...view.comparison, hidden: true, hiddenText: 'Servono almeno 5 notti. Per ora ne hai 2.', rows: [] },
    };
    const html = render(hidden);
    expect(html).toContain('Servono almeno 5 notti. Per ora ne hai 2.');
    expect(html).not.toContain('Barra piena');
  });

  it('statistica nascosta: valore mancante dichiarato a parole, con la ragione', () => {
    const stats = view.stats.map((s, i) =>
      i === 0 ? { ...s, hidden: true, value: '—', hiddenText: 'Servono almeno 3 notti. Per ora ne hai 1.' } : s,
    );
    const html = render({ ...view, stats });
    expect(html).toContain('Servono almeno 3 notti. Per ora ne hai 1.');
    expect(html).toContain('Mancante');
  });
});

describe('NightSections: logica pura', () => {
  it('questionKey e capQuestions: senza doppioni, al massimo tre', () => {
    const a = q({ kind: 'energy', nightDate: '2026-10-24' });
    expect(questionKey(a)).toBe('energy:2026-10-24');
    expect(questionKey(q({ kind: 'exception' }))).toBe('exception:');
    const list = [a, a, q({ kind: 'quality', nightDate: '2026-10-24' }), q({ kind: 'nap_today' }), q({ kind: 'factors' })];
    expect(capQuestions(list).map(questionKey)).toEqual(['energy:2026-10-24', 'quality:2026-10-24', 'nap_today:']);
    expect(capQuestions([])).toEqual([]);
  });

  it('toggleSlug: aggiunge, toglie, nessun doppione, non muta', () => {
    const base = ['viaggio'];
    expect(toggleSlug(base, 'festa', true)).toEqual(['viaggio', 'festa']);
    expect(toggleSlug(base, 'viaggio', false)).toEqual([]);
    expect(toggleSlug(base, 'viaggio', true)).toEqual(['viaggio']);
    expect(base).toEqual(['viaggio']);
  });

  it('sonnellino: ora locale e durata', () => {
    const start = new Date(2026, 9, 24, 14, 5).getTime();
    const end = new Date(2026, 9, 24, 14, 35, 20).getTime();
    expect(clockOf(start)).toBe('14:05');
    expect(finishNap('14:05', start, end)).toEqual({ status: 'done', start: '14:05', end: '14:35', minutes: 30 });
    expect(finishNap('14:05', null, end)).toMatchObject({ minutes: 0 });
    expect(finishNap('14:05', end, start)).toMatchObject({ minutes: 0 });
  });

  it('sectionSummaries: parole, mai NaN', () => {
    const idle = sectionSummaries(view, [], { status: 'idle' });
    expect(idle.exceptions).toBe('Nessuna segnata');
    expect(idle.nap).toBe('Comando rapido');
    expect(sectionSummaries(view, ['viaggio', 'festa'], { status: 'run', start: '14:05' })).toMatchObject({
      exceptions: '2 segnate',
      nap: 'In corso dalle 14:05',
    });
    expect(sectionSummaries(view, [], { status: 'done', start: '14:05', end: '14:35', minutes: 30 }).nap).toBe(
      'Registrato · 30 min',
    );
    for (const text of Object.values(idle)) expect(text).not.toMatch(/NaN|undefined/);
  });
});

describe('NightSections: azioni', () => {
  it('energia e qualità → actionRateNight con il voto e la notte, poi la domanda risulta risposta', async () => {
    const energy = q({ kind: 'energy', nightDate: '2026-10-24' });
    await expect(sendAnswer(energy, '4', TODAY, TODAY)).resolves.toEqual({ ok: true });
    expect(actionRateNight).toHaveBeenCalledWith({ nightDate: '2026-10-24', energy: 4 });
    expect(actionRecordQuestion).toHaveBeenCalledWith({
      date: TODAY,
      kind: 'energy',
      nightDate: '2026-10-24',
      answeredOrSkipped: true,
    });

    await sendAnswer(q({ kind: 'quality' }), '2', TODAY, '2026-10-23');
    expect(actionRateNight).toHaveBeenLastCalledWith({ nightDate: '2026-10-23', quality: 2 });
  });

  it('voto non valido: nessuna chiamata e un errore calmo', async () => {
    await expect(sendAnswer(q({ kind: 'energy' }), '9', TODAY, TODAY)).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
    expect(actionRateNight).not.toHaveBeenCalled();
  });

  it('sonnellino e le altre domande → actionRecordQuestion', async () => {
    await sendAnswer(q({ kind: 'nap_today' }), '30', TODAY, TODAY);
    expect(actionRecordQuestion).toHaveBeenLastCalledWith({ date: TODAY, kind: 'nap_today', answeredOrSkipped: true });
    await sendAnswer(q({ kind: 'confirm_night', nightDate: TODAY }), 'conferma', TODAY, TODAY);
    expect(actionRecordQuestion).toHaveBeenLastCalledWith({
      date: TODAY,
      kind: 'confirm_night',
      nightDate: TODAY,
      answeredOrSkipped: true,
    });
    expect(actionRateNight).not.toHaveBeenCalled();
  });

  it('Salta registra la domanda come chiusa', async () => {
    await expect(sendSkip(q({ kind: 'factors' }), TODAY)).resolves.toEqual({ ok: true });
    expect(actionRecordQuestion).toHaveBeenCalledWith({ date: TODAY, kind: 'factors', answeredOrSkipped: true });
  });

  it('errori del server o eccezioni: ok false, mai un throw', async () => {
    vi.mocked(actionRecordQuestion).mockResolvedValue({ ok: false, error: 'Servizio non configurato.' });
    await expect(sendSkip(q({}), TODAY)).resolves.toEqual({ ok: false, error: 'Servizio non configurato.' });
    vi.mocked(actionRecordQuestion).mockRejectedValue(new Error('rete'));
    await expect(sendSkip(q({}), TODAY)).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
    vi.mocked(actionRateNight).mockResolvedValue({ ok: false, error: 'Notte non trovata.' });
    await expect(sendAnswer(q({ kind: 'energy' }), '3', TODAY, TODAY)).resolves.toEqual({
      ok: false,
      error: 'Notte non trovata.',
    });
    vi.mocked(actionSetExceptions).mockRejectedValue(new Error('rete'));
    await expect(sendExceptions(TODAY, ['viaggio'])).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
    vi.mocked(actionNap).mockRejectedValue(new Error('rete'));
    await expect(sendNap('start')).resolves.toEqual({ ok: false, error: GENERIC_ERROR });
  });

  it('eccezioni e sonnellino passano i parametri attesi', async () => {
    await sendExceptions(TODAY, ['viaggio', 'festa']);
    expect(actionSetExceptions).toHaveBeenCalledWith({ nightDate: TODAY, slugs: ['viaggio', 'festa'] });
    await sendNap('stop');
    expect(actionNap).toHaveBeenCalledWith({ action: 'stop' });
  });
});
