import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions', () => ({
  actionSaveEveningCheck: vi.fn(async () => ({ ok: true })),
  actionSetExceptions: vi.fn(async () => ({ ok: true })),
}));

import {
  EveningScreen,
  currentExceptions,
  initialAnswers,
  submitEveningCheck,
  summaryRows,
  toCheckInput,
  toExceptionsInput,
  withSlug,
  type EveningAnswers,
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

/** La schermata contiene due viste (telefono e PC) scambiate via CSS: le si separa per ispezionarle. */
function render(view = emptyView, initialStep = 0) {
  const html = renderToStaticMarkup(
    <EveningScreen today={TODAY} tonightNightDate={NIGHT} view={view} initialStep={initialStep} />,
  );
  const at = html.search(/<section class="card [^"]*desktop/);
  expect(at).toBeGreaterThan(0);
  return { html, phone: html.slice(0, at), desktop: html.slice(at) };
}

function expectClean(html: string) {
  const t = text(html);
  for (const bad of ['NaN', 'undefined', 'null', '[object']) expect(t).not.toContain(bad);
}

const blank = (): EveningAnswers => initialAnswers(emptyView);

describe('toCheckInput: solo i campi risposti', () => {
  it('senza risposte invia solo la data', () => {
    expect(toCheckInput(TODAY, blank())).toEqual({ date: TODAY });
    expect(Object.keys(toCheckInput(TODAY, blank()))).toEqual(['date']);
  });

  it('omette i campi null', () => {
    const input = toCheckInput(TODAY, { ...blank(), tiredness: 3 });
    expect(input).toEqual({ date: TODAY, tiredness: 3 });
    expect('mood' in input).toBe(false);
    expect('napMinutesToday' in input).toBe(false);
  });

  it('include tutti i campi risposti, anche "Nessuno" (0) e i fattori vuoti toccati', () => {
    expect(
      toCheckInput(TODAY, { ...blank(), tiredness: 5, mood: 2, factors: ['sport'], nap: 0, napTouched: true }),
    ).toEqual({ date: TODAY, tiredness: 5, mood: 2, factors: ['sport'], napMinutesToday: 0 });
    expect(toCheckInput(TODAY, { ...blank(), factors: [] })).toEqual({ date: TODAY, factors: [] });
  });

  it('il sonnellino precompilato (comando rapido) non viene reinviato se non toccato', () => {
    const napView = buildEveningView({
      today: TODAY,
      naps: [{ date: TODAY, startAt: '2026-10-24T12:00:00.000Z', minutes: 45, provenance: 'automatico' }],
    });
    const answers = initialAnswers(napView);
    expect(answers.nap).toBe(45);
    expect(toCheckInput(TODAY, answers)).toEqual({ date: TODAY });
    expect(toCheckInput(TODAY, { ...answers, napTouched: true })).toEqual({ date: TODAY, napMinutesToday: 45 });
  });

  it('non condivide l\'array dei fattori con l\'input', () => {
    const factors = ['sport'];
    const input = toCheckInput(TODAY, { ...blank(), factors });
    factors.push('alcol');
    expect(input.factors).toEqual(['sport']);
  });
});

describe('eccezioni', () => {
  it('toExceptionsInput è null se non toccate', () => {
    expect(toExceptionsInput(NIGHT, blank())).toBeNull();
    expect(toExceptionsInput(NIGHT, { ...blank(), exceptions: [] })).toEqual({ nightDate: NIGHT, slugs: [] });
    expect(toExceptionsInput(NIGHT, { ...blank(), exceptions: ['festa'] })).toEqual({
      nightDate: NIGHT,
      slugs: ['festa'],
    });
  });

  it('currentExceptions mostra quelle attive della view finché l\'utente non le tocca', () => {
    expect(currentExceptions(savedView, initialAnswers(savedView))).toEqual(['viaggio']);
    expect(currentExceptions(savedView, { ...initialAnswers(savedView), exceptions: [] })).toEqual([]);
  });

  it('withSlug aggiunge e toglie senza duplicati né modifiche all\'originale', () => {
    const base = ['sport'];
    expect(withSlug(base, 'alcol', true)).toEqual(['sport', 'alcol']);
    expect(withSlug(base, 'sport', true)).toEqual(['sport']);
    expect(withSlug(base, 'sport', false)).toEqual([]);
    expect(withSlug(base, 'x', false)).toEqual(['sport']);
    expect(base).toEqual(['sport']);
  });
});

describe('initialAnswers e summaryRows', () => {
  it('senza check non c\'è nulla di precompilato', () => {
    expect(blank()).toEqual({
      tiredness: null,
      mood: null,
      factors: null,
      exceptions: null,
      nap: null,
      napTouched: false,
    });
  });

  it('con check precompila voti, fattori e sonnellino', () => {
    expect(initialAnswers(savedView)).toMatchObject({ tiredness: 4, mood: 5, factors: ['sport', 'cena-tardi'], nap: 30 });
  });

  it('riepilogo senza risposte: trattini ovunque', () => {
    const rows = summaryRows(emptyView, blank());
    expect(rows.map((r) => r.value)).toEqual(['—', '—', '—', '—']);
    expect(rows.map((r) => r.label)).toEqual(['Stanchezza', 'Umore', 'Fattori', 'Sonnellino']);
  });

  it('riepilogo con le risposte di adesso', () => {
    const rows = summaryRows(emptyView, {
      tiredness: 2,
      mood: 4,
      factors: ['sport'],
      exceptions: ['festa'],
      nap: 15,
      napTouched: true,
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(by.tiredness).toBe('2 su 5');
    expect(by.mood).toBe('Leggero');
    expect(by.factors).toBe('Sport, Festa');
    expect(by.nap).toBe('15 min');
  });

  it('fattori toccati e tutti tolti: "Nessuno"; sonnellino 0: "Nessuno"', () => {
    const rows = summaryRows(emptyView, { ...blank(), factors: [], nap: 0, napTouched: true });
    const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(by.factors).toBe('Nessuno');
    expect(by.nap).toBe('Nessuno');
  });
});

describe('submitEveningCheck', () => {
  it('salva il check con i soli campi risposti e non tocca le eccezioni se non cambiate', async () => {
    const saveCheck = vi.fn(async () => ({ ok: true }));
    const setExceptions = vi.fn(async () => ({ ok: true }));
    const res = await submitEveningCheck(
      { today: TODAY, tonightNightDate: NIGHT, answers: { ...blank(), mood: 3 } },
      { saveCheck, setExceptions },
    );
    expect(res).toEqual({ ok: true });
    expect(saveCheck).toHaveBeenCalledWith({ date: TODAY, mood: 3 });
    expect(setExceptions).not.toHaveBeenCalled();
  });

  it('senza nessuna risposta salva comunque (nulla è obbligatorio)', async () => {
    const saveCheck = vi.fn(async () => ({ ok: true }));
    const res = await submitEveningCheck(
      { today: TODAY, tonightNightDate: NIGHT, answers: blank() },
      { saveCheck, setExceptions: vi.fn(async () => ({ ok: true })) },
    );
    expect(res.ok).toBe(true);
    expect(saveCheck).toHaveBeenCalledWith({ date: TODAY });
  });

  it('invia le eccezioni toccate alla notte di stasera', async () => {
    const setExceptions = vi.fn(async () => ({ ok: true }));
    const res = await submitEveningCheck(
      { today: TODAY, tonightNightDate: NIGHT, answers: { ...blank(), exceptions: ['viaggio'] } },
      { saveCheck: vi.fn(async () => ({ ok: true })), setExceptions },
    );
    expect(res.ok).toBe(true);
    expect(setExceptions).toHaveBeenCalledWith({ nightDate: NIGHT, slugs: ['viaggio'] });
  });

  it('errore del salvataggio o eccezione lanciata: ok false, senza propagare', async () => {
    const noExc = vi.fn(async () => ({ ok: true }));
    expect(
      await submitEveningCheck(
        { today: TODAY, tonightNightDate: NIGHT, answers: blank() },
        { saveCheck: async () => ({ ok: false }), setExceptions: noExc },
      ),
    ).toEqual({ ok: false });
    expect(
      await submitEveningCheck(
        { today: TODAY, tonightNightDate: NIGHT, answers: blank() },
        {
          saveCheck: async () => {
            throw new Error('rete');
          },
          setExceptions: noExc,
        },
      ),
    ).toEqual({ ok: false });
    expect(
      await submitEveningCheck(
        { today: TODAY, tonightNightDate: NIGHT, answers: { ...blank(), exceptions: ['festa'] } },
        { saveCheck: async () => ({ ok: true }), setExceptions: async () => ({ ok: false }) },
      ),
    ).toEqual({ ok: false });
    expect(noExc).not.toHaveBeenCalled();
  });
});

describe('EveningScreen: vista telefono, un passo per volta', () => {
  const STEPS = [
    { i: 0, question: 'Quanto sei stanco?' },
    { i: 1, question: 'Com&#x27;è il tuo umore?' },
    { i: 2, question: 'Cosa è successo oggi?' },
    { i: 3, question: 'Hai fatto un sonnellino?' },
  ];

  for (const { i, question } of STEPS) {
    it(`passo ${i + 1}: domanda, avanzamento, pulsanti e testi puliti`, () => {
      const { html, phone } = render(emptyView, i);
      expect(phone).toContain(question);
      expect(text(phone)).toContain(`Check serale · domanda ${i + 1} di 4`);
      expect(phone).toContain('role="progressbar"');
      expect(phone).toContain(`aria-valuenow="${i + 1}"`);
      expect(phone).toContain('aria-valuemax="4"');
      expect(count(phone, /<h2/g)).toBe(1);
      expect(text(phone).includes('Indietro')).toBe(i > 0);
      expect(text(phone).includes('Avanti')).toBe(i < 3);
      expect(text(phone).includes('Vado a dormire')).toBe(i === 3);
      // Un solo pulsante pieno visibile: su telefono solo l'ultimo passo, su PC quello della scheda.
      expect(count(phone, /btn-primary/g)).toBe(i === 3 ? 1 : 0);
      expect(count(html, /<h1/g)).toBe(0); // l'<h1> è nella pagina
      expectClean(html);
    });
  }

  it('Avanti è un pulsante normale, attivo anche senza risposta', () => {
    const { phone } = render(emptyView, 0);
    expect(phone).toMatch(/<button type="button" class="btn btn-soft btn-lg[^"]*">Avanti<\/button>/);
    expect(phone).not.toMatch(/<button[^>]*disabled[^>]*>Avanti/);
  });

  it('passo 1: cinque lune in radiogroup, nessuna scelta, testo del primo uso', () => {
    const { phone } = render(emptyView, 0);
    expect(phone).toContain('role="radiogroup"');
    expect(count(phone, /role="radio"/g)).toBe(5);
    expect(phone).toContain('aria-label="Stanchezza 3 di 5"');
    expect(phone).not.toContain('aria-checked="true"');
    expect(text(phone)).toContain('Per niente');
    expect(text(phone)).toContain('Esausto');
    expect(text(phone)).toContain('Bastano pochi tocchi, e ogni domanda si può saltare.');
  });

  it('passo 2: cinque chip umore, nessuno premuto', () => {
    const { phone } = render(emptyView, 1);
    expect(count(phone, /chip chip-mood/g)).toBe(5);
    expect(count(phone, /aria-pressed="true"/g)).toBe(0);
    for (const l of ['Pesante', 'Così così', 'Neutro', 'Leggero', 'Sereno']) expect(text(phone)).toContain(l);
  });

  it('passo 3: fattori (mai il caffè) ed eccezioni a un tocco, la più usata per prima', () => {
    const { phone } = render(emptyView, 2);
    for (const l of ['Schermo a letto', 'Sport', 'Giornata stressante', 'Cena tardi', 'Alcol', 'Mal di testa']) {
      expect(text(phone)).toContain(l);
    }
    expect(text(phone)).not.toContain('Caffè');
    expect(count(phone, /chip chip-exc/g)).toBeGreaterThanOrEqual(2);
    expect(text(phone)).toContain('Giornata particolare');
    expect(phone.indexOf('Viaggio')).toBeLessThan(phone.indexOf('Malattia'));
  });

  it('passo 4: cinque chip sonnellino, riepilogo con trattini e Vado a dormire', () => {
    const { phone } = render(emptyView, 3);
    expect(count(phone, /chip chip-nap/g)).toBe(5);
    for (const l of ['Nessuno', '15 min', '30 min', '45 min', '1 ora']) expect(text(phone)).toContain(l);
    expect(text(phone)).toContain('Riepilogo');
    expect(phone).toContain('<dl');
    expect(count(phone, /<dd[^>]*>—<\/dd>/g)).toBe(4);
  });

  it('con check salvato: campi precompilati, riepilogo coerente, nessun "Aggiorna"', () => {
    const last = render(savedView, 3);
    expect(last.phone).toMatch(/chip chip-nap is-on"[^>]*aria-pressed="true"[^>]*>30 min/);
    expect(text(last.phone)).toContain('4 su 5');
    expect(text(last.phone)).toContain('Sereno');
    expect(text(last.phone)).toContain('Sport, Cena tardi, Viaggio');
    expect(text(last.html)).not.toContain('Aggiorna');
    expect(text(last.html)).not.toContain('Nessun check per stasera');
    expectClean(last.html);

    const first = render(savedView, 0);
    expect(first.phone).toMatch(/aria-checked="true"[^>]*aria-label="Stanchezza 4 di 5"/);

    const third = render(savedView, 2).phone;
    expect(count(third, /aria-pressed="true"/g)).toBe(3); // due fattori + eccezione
    expect(third).toMatch(/chip chip-exc is-on"[^>]*aria-pressed="true"[^>]*>Viaggio/);
  });

  it('un passo fuori intervallo o non valido viene riportato nei limiti', () => {
    expect(render(emptyView, 99).phone).toContain('domanda 4 di 4');
    expect(render(emptyView, -3).phone).toContain('domanda 1 di 4');
    expect(render(emptyView, Number.NaN).phone).toContain('domanda 1 di 4');
  });
});

describe('EveningScreen: vista PC, una scheda con tutti i passi', () => {
  const { desktop, html } = render();

  it('mostra i quattro passi insieme', () => {
    expect(count(desktop, /<h2/g)).toBe(1);
    expect(count(desktop, /<h3/g)).toBe(4);
    expect(text(desktop)).toContain('Come stai stasera?');
    expect(text(desktop)).toContain('sabato 24 ottobre');
    expect(desktop).toContain('Quanto sei stanco?');
    expect(desktop).toContain('Com&#x27;è il tuo umore?');
    expect(desktop).toContain('Cosa è successo oggi?');
    expect(desktop).toContain('Hai fatto un sonnellino?');
    expect(count(desktop, /role="radio"/g)).toBe(5);
    expect(count(desktop, /chip chip-mood/g)).toBe(5);
    expect(count(desktop, /chip chip-nap/g)).toBe(5);
    expect(desktop).toContain('chip chip-exc');
  });

  it('un solo pulsante pieno, nessuna navigazione a passi, testi puliti', () => {
    expect(count(desktop, /btn-primary/g)).toBe(1);
    expect(text(desktop)).toContain('Vado a dormire');
    expect(desktop).not.toContain('role="progressbar"');
    expect(text(desktop)).not.toContain('Avanti');
    expect(text(desktop)).not.toContain('Indietro');
    expect(desktop).not.toContain('role="status"');
    expect(desktop).not.toMatch(/<button[^>]*disabled/);
    expectClean(html);
  });

  it('con check salvato precompila tutto', () => {
    const { desktop: d } = render(savedView);
    expect(count(d, /aria-pressed="true"/g)).toBe(1 + 1 + 2 + 1); // umore, nap, 2 fattori, eccezione
    expect(text(d)).toContain('Vado a dormire');
    expect(text(d)).not.toContain('Aggiorna');
  });
});
