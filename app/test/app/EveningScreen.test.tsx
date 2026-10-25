import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions', () => ({
  actionSaveEveningCheck: vi.fn(async () => ({ ok: true })),
  actionSetExceptions: vi.fn(async () => ({ ok: true })),
}));

import {
  EVENING_ERROR_TEXT,
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
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");

const emptyView = buildEveningView({ today: TODAY });
const empty: EveningAnswers = initialAnswers(emptyView);

const savedCheck: EveningCheck = {
  date: TODAY,
  tiredness: { value: 4, provenance: 'confermato' },
  mood: { value: 2, provenance: 'confermato' },
  factors: ['sport'],
  napMinutesToday: { value: 30, provenance: 'confermato' },
};

/** Parte telefono (WizardStep): tutto ciò che precede la scheda PC. */
const phonePart = (html: string) => html.slice(0, html.indexOf('Come stai stasera?'));

function render(step: number, view = emptyView) {
  return renderToStaticMarkup(<EveningScreen today={TODAY} tonightNightDate={NIGHT} view={view} initialStep={step} />);
}

describe('mappatura risposte → input azione', () => {
  it('senza risposte: solo la data', () => {
    expect(toCheckInput(TODAY, empty)).toEqual({ date: TODAY });
    expect(Object.keys(toCheckInput(TODAY, empty))).toEqual(['date']);
    expect(toExceptionsInput(NIGHT, empty)).toBeNull();
  });

  it('include solo i campi risposti', () => {
    expect(toCheckInput(TODAY, { ...empty, tiredness: 3 })).toEqual({ date: TODAY, tiredness: 3 });
    expect(toCheckInput(TODAY, { ...empty, mood: 5, factors: ['sport'] })).toEqual({
      date: TODAY,
      mood: 5,
      factors: ['sport'],
    });
  });

  it('il sonnellino 0 ("Nessuno") è una risposta; non toccato o deselezionato è omesso', () => {
    expect(toCheckInput(TODAY, { ...empty, nap: 0, napTouched: true })).toEqual({ date: TODAY, napMinutesToday: 0 });
    expect(toCheckInput(TODAY, { ...empty, nap: 30, napTouched: false })).toEqual({ date: TODAY });
    expect(toCheckInput(TODAY, { ...empty, nap: null, napTouched: true })).toEqual({ date: TODAY });
  });

  it('fattori svuotati dopo la scelta sono una risposta (elenco vuoto), mai omessi', () => {
    expect(toCheckInput(TODAY, { ...empty, factors: [] })).toEqual({ date: TODAY, factors: [] });
  });

  it('le eccezioni si inviano solo se toccate, per la notte di stasera', () => {
    expect(toExceptionsInput(NIGHT, { ...empty, exceptions: ['viaggio'] })).toEqual({ nightDate: NIGHT, slugs: ['viaggio'] });
    expect(toExceptionsInput(NIGHT, { ...empty, exceptions: [] })).toEqual({ nightDate: NIGHT, slugs: [] });
  });

  it('withSlug aggiunge e toglie senza duplicati', () => {
    expect(withSlug(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(withSlug(['a', 'b'], 'a', true)).toEqual(['b', 'a']);
    expect(withSlug(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});

describe('risposte iniziali e riepilogo', () => {
  it('senza check tutto è vuoto', () => {
    expect(empty).toEqual({
      tiredness: null,
      mood: null,
      factors: null,
      exceptions: null,
      nap: null,
      napTouched: false,
    });
    expect(summaryRows(emptyView, empty).map((r) => r.value)).toEqual(['—', '—', '—', '—']);
  });

  it('con un check salvato precompila dalla view', () => {
    const view = buildEveningView({ today: TODAY, check: savedCheck, activeExceptions: ['viaggio'] });
    const a = initialAnswers(view);
    expect(a).toMatchObject({ tiredness: 4, mood: 2, factors: ['sport'], nap: 30, napTouched: false });
    expect(currentExceptions(view, a)).toEqual(['viaggio']);
    const rows = summaryRows(view, a);
    expect(rows.map((r) => r.label)).toEqual(['Stanchezza', 'Umore', 'Fattori', 'Sonnellino']);
    expect(rows[0]?.value).toBe('4 su 5');
    expect(rows[1]?.value).toBe('Così così');
    expect(rows[2]?.value).toContain('Viaggio');
    expect(rows[3]?.value).toBe('30 min');
  });

  it('"Nessuno" per fattori vuoti e sonnellino 0', () => {
    const rows = summaryRows(emptyView, { ...empty, factors: [], nap: 0, napTouched: true });
    expect(rows[2]?.value).toBe('Nessuno');
    expect(rows[3]?.value).toBe('Nessuno');
  });
});

describe('submitEveningCheck', () => {
  const ok = async () => ({ ok: true });
  const ko = async () => ({ ok: false });

  it('salva il check con i soli campi risposti e non tocca le eccezioni se non cambiate', async () => {
    const saveCheck = vi.fn(ok);
    const setExceptions = vi.fn(ok);
    const r = await submitEveningCheck(
      { today: TODAY, tonightNightDate: NIGHT, answers: { ...empty, mood: 4 } },
      { saveCheck, setExceptions },
    );
    expect(r).toEqual({ ok: true });
    expect(saveCheck).toHaveBeenCalledWith({ date: TODAY, mood: 4 });
    expect(setExceptions).not.toHaveBeenCalled();
  });

  it('senza nessuna risposta salva comunque (nessun dato obbligatorio)', async () => {
    const saveCheck = vi.fn(ok);
    const r = await submitEveningCheck(
      { today: TODAY, tonightNightDate: NIGHT, answers: empty },
      { saveCheck, setExceptions: vi.fn(ok) },
    );
    expect(r.ok).toBe(true);
    expect(saveCheck).toHaveBeenCalledWith({ date: TODAY });
  });

  it('imposta le eccezioni toccate sulla notte di stasera', async () => {
    const setExceptions = vi.fn(ok);
    await submitEveningCheck(
      { today: TODAY, tonightNightDate: NIGHT, answers: { ...empty, exceptions: ['festa'] } },
      { saveCheck: ok, setExceptions },
    );
    expect(setExceptions).toHaveBeenCalledWith({ nightDate: NIGHT, slugs: ['festa'] });
  });

  it('errore del salvataggio, delle eccezioni o eccezione lanciata: ok false, senza lanciare', async () => {
    const answers = { ...empty, exceptions: ['festa'] };
    const args = { today: TODAY, tonightNightDate: NIGHT, answers };
    expect(await submitEveningCheck(args, { saveCheck: ko, setExceptions: ok })).toEqual({ ok: false });
    expect(await submitEveningCheck(args, { saveCheck: ok, setExceptions: ko })).toEqual({ ok: false });
    const boom = async (): Promise<{ ok: boolean }> => {
      throw new Error('rete');
    };
    expect(await submitEveningCheck(args, { saveCheck: boom, setExceptions: ok })).toEqual({ ok: false });
  });
});

describe('EveningScreen: markup', () => {
  it.each([0, 1, 2, 3])('passo %i: wizard su telefono e scheda su PC, ARIA e testi', (step) => {
    const html = render(step);
    const view = emptyView.steps[step]!;
    expect(text(html)).toContain(view.question);
    expect(text(html)).toContain(`Check serale · domanda ${step + 1} di 4`);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain(`aria-valuenow="${step + 1}"`);
    expect(html).toContain('<fieldset');
    expect(html).not.toMatch(/NaN|undefined|\[object/);
    // Vista PC: tutti i passi con la loro domanda.
    for (const s of emptyView.steps) expect(text(html)).toContain(s.question);
    expect(text(html)).toContain('Come stai stasera?');
    // Nessun h1 nella schermata (lo mette la pagina).
    expect(html).not.toContain('<h1');
  });

  it('un solo pulsante pieno per vista: nei passi non finali il wizard non ne ha, la scheda PC uno', () => {
    for (const step of [0, 1, 2]) {
      const html = render(step);
      expect(html.match(/btn-primary/g)).toHaveLength(1);
      expect(text(html)).toContain('Avanti');
    }
    const last = render(3);
    // Ultimo passo: Vado a dormire nel wizard e nella scheda PC (nascosta a CSS sul telefono, e viceversa).
    expect(last.match(/btn-primary/g)).toHaveLength(2);
    expect(text(last)).not.toContain('Avanti');
    expect(phonePart(last).match(/btn-primary/g)).toHaveLength(1);
    expect(last.slice(last.indexOf('Come stai stasera?')).match(/btn-primary/g)).toHaveLength(1);
  });

  it('Avanti non è mai disabilitato e il primo passo non ha Indietro', () => {
    const html = render(0);
    expect(html).toContain('<button type="button" class="btn btn-soft btn-lg');
    expect(text(phonePart(render(0)))).not.toContain('Indietro');
    expect(text(phonePart(render(2)))).toContain('Indietro');
  });

  it('passo 1: lune di stanchezza con nome accessibile e nessuna selezionata', () => {
    const html = render(0);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Stanchezza 3 di 5"');
    expect(html).not.toContain('aria-checked="true"');
    expect(text(html)).toContain('Nessun check per stasera. Bastano pochi tocchi, e ogni domanda si può saltare.');
  });

  it('passo 2: cinque chip umore, nessuno premuto', () => {
    const phone = phonePart(render(1));
    for (const label of ['Pesante', 'Così così', 'Neutro', 'Leggero', 'Sereno']) expect(text(phone)).toContain(label);
    expect(phone.match(/chip chip-mood/g)).toHaveLength(5);
    expect(phone).not.toContain('aria-pressed="true"');
  });

  it('passo 3: fattori ed eccezioni, con la nota della view', () => {
    const phone = phonePart(render(2));
    expect(phone).toContain('chip-exc');
    expect(text(phone)).toContain('Giornata particolare');
    expect(text(phone)).toContain('Le eccezioni non contano nel riferimento della regolarità.');
  });

  it('passo 4: cinque chip sonnellino e riepilogo con quattro righe', () => {
    const phone = phonePart(render(3));
    for (const label of ['Nessuno', '15 min', '30 min', '45 min', '1 ora']) expect(text(phone)).toContain(label);
    expect(phone.match(/chip chip-nap/g)).toHaveLength(5);
    expect(text(phone)).toContain('Riepilogo');
    expect(phone.match(/<dt /g)).toHaveLength(4);
    expect(text(phone)).toContain('Vado a dormire');
    expect(phone).not.toContain('role="status"');
    expect(phone).not.toContain('role="alert"');
  });

  it('con un check salvato i controlli sono precompilati', () => {
    const view = buildEveningView({ today: TODAY, check: savedCheck, activeExceptions: ['viaggio'] });
    const html = render(1, view);
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-pressed="true"');
    expect(text(html)).not.toContain('Nessun check per stasera');
    expect(text(render(3, view))).toContain('Così così');
    expect(JSON.stringify(summaryRows(view, initialAnswers(view)))).not.toMatch(/NaN|undefined/);
  });

  it('il messaggio di errore è calmo e non appare nello stato iniziale', () => {
    expect(EVENING_ERROR_TEXT).toContain('Le tue risposte sono ancora qui');
    expect(EVENING_ERROR_TEXT).not.toMatch(/!|errore/i);
    expect(render(3)).not.toContain(EVENING_ERROR_TEXT);
  });
});
