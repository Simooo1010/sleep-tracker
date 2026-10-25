import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions', () => ({
  actionSaveEveningCheck: vi.fn(async () => ({ ok: true })),
  actionSetExceptions: vi.fn(async () => ({ ok: true })),
}));

import {
  EveningScreen,
  answersToActionInput,
  initialFromView,
  summaryRows,
  toggleSlug,
} from '../../src/app/sera/EveningScreen';
import type { EveningCheck } from '../../src/domain/types';
import { buildEveningView } from '../../src/server/views';

const TODAY = '2026-10-24';
const NIGHT = '2026-10-25';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

const EXCEPTION_TYPES = [
  { slug: 'malattia', label: 'Malattia', uses: 1 },
  { slug: 'viaggio', label: 'Viaggio', uses: 3 },
];

const emptyView = buildEveningView({ today: TODAY, exceptionTypes: EXCEPTION_TYPES });

const check: EveningCheck = {
  date: TODAY,
  tiredness: { value: 4, provenance: 'confermato' },
  mood: { value: 5, provenance: 'confermato' },
  factors: ['sport', 'cena-tardi'],
  napMinutesToday: { value: 30, provenance: 'confermato' },
};
const savedView = buildEveningView({
  today: TODAY,
  check,
  exceptionTypes: EXCEPTION_TYPES,
  activeExceptions: ['viaggio'],
});

const render = (props: Partial<Parameters<typeof EveningScreen>[0]> = {}, view = emptyView) =>
  renderToStaticMarkup(<EveningScreen today={TODAY} tonightNightDate={NIGHT} view={view} {...props} />);

function expectClean(html: string) {
  const t = text(html);
  expect(t).not.toContain('NaN');
  expect(t).not.toContain('undefined');
  expect(t).not.toContain('null');
  expect(t).not.toContain('[object');
}

describe('answersToActionInput', () => {
  it('senza risposte invia solo la data', () => {
    expect(answersToActionInput(TODAY, {})).toEqual({ date: TODAY });
  });

  it('omette i campi non risposti (undefined o null)', () => {
    const input = answersToActionInput(TODAY, { tiredness: 3, mood: null, napMinutes: undefined });
    expect(input).toEqual({ date: TODAY, tiredness: 3 });
    expect(Object.keys(input)).toEqual(['date', 'tiredness']);
  });

  it('include tutti i campi risposti, compreso il sonnellino "Nessuno" (0) e i fattori vuoti toccati', () => {
    expect(
      answersToActionInput(TODAY, { tiredness: 5, mood: 2, factors: ['sport'], napMinutes: 0 }),
    ).toEqual({ date: TODAY, tiredness: 5, mood: 2, factors: ['sport'], napMinutesToday: 0 });
    expect(answersToActionInput(TODAY, { factors: [] })).toEqual({ date: TODAY, factors: [] });
  });

  it('scarta voti e minuti non validi invece di inviarli', () => {
    const input = answersToActionInput(TODAY, {
      tiredness: 9 as never,
      mood: Number.NaN as never,
      napMinutes: Number.NaN,
    });
    expect(input).toEqual({ date: TODAY });
    expect(answersToActionInput(TODAY, { napMinutes: -5 })).toEqual({ date: TODAY });
    expect(answersToActionInput(TODAY, { napMinutes: 12.5 })).toEqual({ date: TODAY });
  });

  it('non condivide l\'array dei fattori con l\'input', () => {
    const factors = ['sport'];
    const input = answersToActionInput(TODAY, { factors });
    factors.push('alcol');
    expect(input.factors).toEqual(['sport']);
  });
});

describe('toggleSlug', () => {
  it('aggiunge e toglie senza modificare l\'originale', () => {
    const base = ['sport'];
    expect(toggleSlug(base, 'alcol')).toEqual(['sport', 'alcol']);
    expect(toggleSlug(base, 'sport')).toEqual([]);
    expect(base).toEqual(['sport']);
  });
});

describe('initialFromView e summaryRows', () => {
  it('senza check non c\'è nulla di precompilato', () => {
    expect(initialFromView(emptyView)).toEqual({
      tiredness: null,
      mood: null,
      factors: [],
      exceptions: [],
      napMinutes: null,
    });
  });

  it('con check precompila voti, fattori, eccezioni e sonnellino', () => {
    expect(initialFromView(savedView)).toEqual({
      tiredness: 4,
      mood: 5,
      factors: ['sport', 'cena-tardi'],
      exceptions: ['viaggio'],
      napMinutes: 30,
    });
  });

  it('il riepilogo senza risposte è quello del view', () => {
    expect(summaryRows(savedView, {}, ['viaggio'], initialFromView(savedView))).toEqual(savedView.summary.rows);
  });

  it('il riepilogo segue le risposte date e usa il trattino per ciò che manca', () => {
    const initial = initialFromView(emptyView);
    const rows = summaryRows(
      emptyView,
      { tiredness: 2, mood: null, factors: ['sport'], napMinutes: 15 },
      ['festa'],
      initial,
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey.tiredness).toBe('2 su 5');
    expect(byKey.mood).toBe('—');
    expect(byKey.factors).toBe('Sport, Festa');
    expect(byKey.nap).toBe('15 min');
  });

  it('fattori toccati e tutti tolti: "Nessuno"', () => {
    const rows = summaryRows(savedView, { factors: [] }, [], initialFromView(savedView));
    expect(rows.find((r) => r.key === 'factors')?.value).toBe('Nessuno');
  });
});

describe('EveningScreen: telefono, un passo per volta', () => {
  const STEPS = [
    { n: 1, question: 'Quanto sei stanco?' },
    { n: 2, question: "Com'è il tuo umore?" },
    { n: 3, question: 'Cosa è successo oggi?' },
    { n: 4, question: 'Hai fatto un sonnellino?' },
  ];

  for (const { n, question } of STEPS) {
    it(`passo ${n}: domanda, avanzamento, un solo pulsante principale al massimo, testi puliti`, () => {
      const html = render({ initialStep: n, layout: 'phone' });
      expect(text(html)).toContain(question.replace("'", '&#x27;') === question ? question : question);
      expect(text(html)).toContain('Check serale · domanda ' + n + ' di 4');
      expect(html).toContain('role="progressbar"');
      expect(html).toContain(`aria-valuenow="${n}"`);
      expect(html).toContain('aria-valuemax="4"');
      expect(count(html, /btn-primary/g)).toBe(n === 4 ? 1 : 0);
      expect(count(html, /<h1/g)).toBe(0);
      expect(count(html, /<h2/g)).toBe(1);
      expect(count(html, /<h3/g)).toBe(0);
      expect(text(html).includes('Indietro')).toBe(n > 1);
      expect(text(html).includes('Avanti')).toBe(n < 4);
      expect(text(html).includes('Vado a dormire')).toBe(n === 4);
      expectClean(html);
    });
  }

  it('i testi apostrofati sono quelli del view', () => {
    // renderToStaticMarkup scrive l'apostrofo come &#x27;
    expect(render({ initialStep: 2, layout: 'phone' })).toContain('Com&#x27;è il tuo umore?');
  });

  it('passo 1: cinque lune azzurre in radiogroup e il testo del primo uso', () => {
    const html = render({ initialStep: 1, layout: 'phone' });
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Stanchezza di stasera"');
    expect(count(html, /role="radio"/g)).toBe(5);
    expect(html).toContain('aria-label="Stanchezza 3 di 5"');
    expect(html).not.toContain('aria-checked="true"');
    expect(text(html)).toContain('Per niente');
    expect(text(html)).toContain('Esausto');
    expect(text(html)).toContain('Bastano pochi tocchi, e ogni domanda si può saltare.');
  });

  it('passo 2: cinque chip umore, nessuno selezionato', () => {
    const html = render({ initialStep: 2, layout: 'phone' });
    expect(count(html, /chip chip-mood/g)).toBe(5);
    expect(count(html, /aria-pressed="false"/g)).toBe(5);
    expect(count(html, /aria-pressed="true"/g)).toBe(0);
    for (const label of ['Pesante', 'Così così', 'Neutro', 'Leggero', 'Sereno']) expect(text(html)).toContain(label);
    expect(html).toContain('aria-label="Umore di stasera"');
  });

  it('passo 3: fattori a selezione multipla ed eccezioni a un tocco', () => {
    const html = render({ initialStep: 3, layout: 'phone' });
    for (const label of ['Schermo a letto', 'Sport', 'Giornata stressante', 'Cena tardi', 'Alcol', 'Mal di testa']) {
      expect(text(html)).toContain(label);
    }
    expect(text(html)).not.toContain('Caffè');
    expect(count(html, /chip chip-exc/g)).toBeGreaterThanOrEqual(2);
    expect(html).toContain('Giornata particolare');
    expect(html).toContain('aria-label="Fattori di oggi"');
    expect(text(html)).toContain('Non conta nel riferimento della regolarità.');
    // L'eccezione più usata viene per prima.
    expect(html.indexOf('Viaggio')).toBeLessThan(html.indexOf('Malattia'));
  });

  it('passo 4: cinque chip sonnellino gialli e riepilogo con i trattini', () => {
    const html = render({ initialStep: 4, layout: 'phone' });
    expect(count(html, /chip chip-nap/g)).toBe(5);
    for (const label of ['Nessuno', '15 min', '30 min', '45 min', '1 ora']) expect(text(html)).toContain(label);
    expect(text(html)).toContain('Riepilogo');
    expect(html).toContain('<dl');
    for (const label of ['Stanchezza', 'Umore', 'Fattori', 'Sonnellino']) expect(text(html)).toContain(label);
    expect(count(html, /<dd>—<\/dd>/g)).toBe(4);
    expect(html).toContain('btn btn-primary btn-lg');
  });

  it('passo 4 dopo un check salvato: campi precompilati ed eccezione attiva, solo "Vado a dormire"', () => {
    const html = render({ initialStep: 4, layout: 'phone' }, savedView);
    expect(html).toMatch(/chip chip-nap is-on"[^>]*aria-pressed="true"[^>]*>30 min/);
    expect(text(html)).toContain('4 su 5');
    expect(text(html)).toContain('Sereno');
    expect(text(html)).toContain('Schermo a letto'.slice(0, 0) + 'Sport, Cena tardi, Viaggio');
    expect(text(html)).not.toContain('Aggiorna');
    expect(text(html)).toContain('Vado a dormire');
    expect(text(html)).not.toContain('Nessun check per stasera');
    expectClean(html);
  });

  it('passo 3 con check salvato: fattori ed eccezione premuti', () => {
    const html = render({ initialStep: 3, layout: 'phone' }, savedView);
    expect(count(html, /aria-pressed="true"/g)).toBe(3);
    expect(html).toMatch(/chip chip-exc is-on"[^>]*aria-pressed="true"[^>]*>Viaggio/);
  });

  it('passo 1 con check salvato: la luna 4 è scelta', () => {
    const html = render({ initialStep: 1, layout: 'phone' }, savedView);
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="Stanchezza 4 di 5"/);
  });

  it('un passo fuori intervallo viene riportato nei limiti', () => {
    expect(render({ initialStep: 99, layout: 'phone' })).toContain('domanda 4 di 4');
    expect(render({ initialStep: 0, layout: 'phone' })).toContain('domanda 1 di 4');
    expect(render({ initialStep: Number.NaN, layout: 'phone' })).toContain('domanda 1 di 4');
  });

  it('di default (server) è il telefono: un passo alla volta', () => {
    const html = render();
    expect(html).toContain('domanda 1 di 4');
    expect(html).toContain('role="progressbar"');
  });
});

describe('EveningScreen: PC, una scheda con tutti i passi', () => {
  const html = render({ layout: 'wide' });

  it('mostra i quattro passi insieme con titoli di sezione', () => {
    expect(count(html, /<section class="card /g)).toBe(1);
    expect(count(html, /<h2/g)).toBe(1);
    expect(count(html, /<h3/g)).toBe(4);
    expect(text(html)).toContain('Come stai stasera?');
    expect(text(html)).toContain('sabato 24 ottobre');
    for (const q of ['Quanto sei stanco?', 'Hai fatto un sonnellino?', 'Cosa è successo oggi?']) {
      expect(text(html)).toContain(q);
    }
    expect(html).toContain('Com&#x27;è il tuo umore?');
    expect(count(html, /role="radio"/g)).toBe(5);
    expect(count(html, /chip chip-mood/g)).toBe(5);
    expect(count(html, /chip chip-nap/g)).toBe(5);
    expect(html).toContain('chip chip-exc');
  });

  it('niente barra di avanzamento né Avanti/Indietro; un solo pulsante pieno', () => {
    expect(html).not.toContain('role="progressbar"');
    expect(text(html)).not.toContain('Avanti');
    expect(text(html)).not.toContain('Indietro');
    expect(count(html, /btn-primary/g)).toBe(1);
    expect(text(html)).toContain('Vado a dormire');
    expect(html).not.toContain('role="status"');
    expectClean(html);
  });

  it('con check salvato precompila tutto e non cambia l\'etichetta del pulsante', () => {
    const saved = render({ layout: 'wide' }, savedView);
    expect(count(saved, /aria-pressed="true"/g)).toBe(1 + 1 + 2 + 1); // umore, nap, 2 fattori, eccezione => 5
    expect(text(saved)).toContain('Vado a dormire');
    expect(text(saved)).not.toContain('Aggiorna');
    expectClean(saved);
  });
});
