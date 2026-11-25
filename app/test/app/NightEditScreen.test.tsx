import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/actions', () => ({
  actionSaveNightDetails: vi.fn(async () => ({ ok: true, value: {} })),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import {
  NightEditScreen,
  SAVE_ERROR_TEXT,
  TIMES_ORDER_TEXT,
  TIMES_PARTIAL_TEXT,
  UNSAVED_TEXT,
  applyDraftToView,
  buildNightEditInput,
  draftFromView,
  liveDurationText,
  submitNightEdit,
  timesProblem,
  timesState,
  withSlug,
  type NightEditDraft,
} from '../../src/app/storico/[date]/NightEditScreen';
import { toNightIso } from '../../src/app/NightScreen';
import type { NightEditView } from '../../src/server/night-edit-contract';

const view: NightEditView = {
  date: '2026-10-13',
  title: 'Notte del 13 ottobre',
  dateLabel: 'martedì 13 ottobre 2026',
  eveningLabel: 'Sera di lunedì 12 ottobre',
  status: 'confermata',
  statusWord: 'Confermata',
  bedTime: '23:30',
  wakeTime: '07:00',
  bedProvenanceWord: 'Confermato',
  wakeProvenanceWord: 'Confermato',
  durationText: '7h 30m',
  suggestedBedTime: '23:30',
  suggestedWakeTime: '07:30',
  quality: 4,
  energy: null,
  exceptions: [
    { slug: 'viaggio', label: 'Viaggio', selected: false },
    { slug: 'malattia', label: 'Malattia', selected: true },
  ],
  factors: [
    { slug: 'sport', label: 'Sport', selected: true },
    { slug: 'alcol', label: 'Alcol', selected: false },
  ],
  tiredness: 3,
  mood: 5,
  dayNote: 'Giornata lunga',
  napText: 'Sonnellino 32 min',
  prevDate: '2026-10-12',
  nextDate: '2026-10-14',
  backHref: '/storico?m=2026-10&d=2026-10-13',
};

const missingView: NightEditView = {
  ...view,
  status: 'mancante',
  statusWord: 'Mancante',
  bedTime: null,
  wakeTime: null,
  durationText: '—',
  quality: null,
  exceptions: view.exceptions.map((e) => ({ ...e, selected: false })),
  factors: view.factors.map((f) => ({ ...f, selected: false })),
  tiredness: null,
  mood: null,
  dayNote: '',
  napText: null,
  nextDate: null,
};

const draft = (patch: Partial<NightEditDraft> = {}, v: NightEditView = view): NightEditDraft => ({
  ...draftFromView(v),
  ...patch,
});
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('buildNightEditInput', () => {
  it('nessuna modifica: null', () => {
    expect(buildNightEditInput(view, draftFromView(view))).toBeNull();
    expect(buildNightEditInput(missingView, draftFromView(missingView))).toBeNull();
  });

  it('solo la qualità: nessun altro campo', () => {
    expect(buildNightEditInput(view, draft({ quality: 2 }))).toEqual({ nightDate: '2026-10-13', quality: 2 });
  });

  it('gli orari vanno insieme, in ISO, anche se ne cambia uno solo', () => {
    const input = buildNightEditInput(view, draft({ bed: '23:45' }));
    expect(input).toEqual({
      nightDate: '2026-10-13',
      times: {
        bedAt: toNightIso('2026-10-13', '23:45', 'bed'),
        wakeAt: toNightIso('2026-10-13', '07:00', 'wake'),
      },
    });
  });

  it('orari incompleti: non vengono inviati', () => {
    expect(buildNightEditInput(missingView, draft({ bed: '23:30' }, missingView))).toBeNull();
    const input = buildNightEditInput(missingView, draft({ bed: '23:30', quality: 3 }, missingView));
    expect(input).toEqual({ nightDate: '2026-10-13', quality: 3 });
  });

  it('rimozione del voto, dell’umore e della nota: null', () => {
    expect(buildNightEditInput(view, draft({ quality: null }))).toEqual({ nightDate: '2026-10-13', quality: null });
    expect(buildNightEditInput(view, draft({ mood: null, tiredness: null, dayNote: '  ' }))).toEqual({
      nightDate: '2026-10-13',
      evening: { tiredness: null, mood: null, dayNote: null },
    });
  });

  it('energia impostata', () => {
    expect(buildNightEditInput(view, draft({ energy: 5 }))).toEqual({ nightDate: '2026-10-13', energy: 5 });
  });

  it('fattori della sera: sostituisce l’elenco, nessuna modifica se uguale in altro ordine', () => {
    expect(buildNightEditInput(view, draft({ factors: ['sport', 'alcol'] }))).toEqual({
      nightDate: '2026-10-13',
      evening: { factors: ['sport', 'alcol'] },
    });
    expect(buildNightEditInput(view, draft({ factors: [] }))).toEqual({
      nightDate: '2026-10-13',
      evening: { factors: [] },
    });
    expect(buildNightEditInput(missingView, draft({ factors: ['alcol', 'sport'] }, missingView))?.evening?.factors).toEqual([
      'alcol',
      'sport',
    ]);
  });

  it('nota: tagliata dagli spazi, uguale alla salvata = nessuna modifica', () => {
    expect(buildNightEditInput(view, draft({ dayNote: ' Giornata lunga ' }))).toBeNull();
    expect(buildNightEditInput(view, draft({ dayNote: 'Cena fuori ' }))?.evening).toEqual({ dayNote: 'Cena fuori' });
  });

  it('imprevisti: sostituisce l’elenco, con le etichette dei soli nuovi', () => {
    expect(buildNightEditInput(view, draft({ exceptions: ['malattia', 'viaggio'] }))).toEqual({
      nightDate: '2026-10-13',
      exceptions: { slugs: ['malattia', 'viaggio'] },
    });
    expect(
      buildNightEditInput(
        view,
        draft({ exceptions: ['malattia', 'cena-fuori'], exceptionLabels: { 'cena-fuori': 'Cena fuori', viaggio: 'x' } }),
      ),
    ).toEqual({
      nightDate: '2026-10-13',
      exceptions: { slugs: ['malattia', 'cena-fuori'], labels: { 'cena-fuori': 'Cena fuori' } },
    });
    expect(buildNightEditInput(view, draft({ exceptions: [] }))?.exceptions).toEqual({ slugs: [] });
  });

  it('withSlug non crea doppioni', () => {
    expect(withSlug(['a'], 'a', true)).toEqual(['a']);
    expect(withSlug(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});

describe('orari', () => {
  it('stati: invariati, salvabili, incompleti, incoerenti', () => {
    expect(timesState(view, draftFromView(view))).toBe('same');
    expect(timesState(view, draft({ bed: '23:00' }))).toBe('ok');
    expect(timesState(missingView, draft({ bed: '23:30' }, missingView))).toBe('partial');
    expect(timesState(view, draft({ bed: '07:30', wake: '07:00' }))).toBe('order');
    expect(timesState(view, draft({ bed: '18:00', wake: '12:00' }))).toBe('long');
  });

  it('messaggi a parole', () => {
    expect(timesProblem(view, draft({ bed: '07:30', wake: '07:00' }))).toBe(TIMES_ORDER_TEXT);
    expect(timesProblem(missingView, draft({ bed: '23:30' }, missingView))).toBe(TIMES_PARTIAL_TEXT);
    expect(timesProblem(view, draft({ bed: '23:00' }))).toBeNull();
  });

  it('durata dal vivo', () => {
    expect(liveDurationText(view, draftFromView(view))).toBe('7h 30m');
    expect(liveDurationText(view, draft({ bed: '23:00' }))).toBe('8h 00m');
    expect(liveDurationText(view, draft({ bed: '07:30', wake: '07:00' }))).toBe('—');
    expect(liveDurationText(missingView, draftFromView(missingView))).toBe('—');
  });
});

describe('submitNightEdit', () => {
  it('ok: invia solo i campi cambiati', async () => {
    const save = vi.fn(async () => ({ ok: true }));
    const result = await submitNightEdit(view, draft({ quality: 2 }), save);
    expect(result).toEqual({ ok: true });
    expect(save).toHaveBeenCalledWith({ nightDate: '2026-10-13', quality: 2 });
  });

  it('errore del server o eccezione: ok false', async () => {
    expect((await submitNightEdit(view, draft({ quality: 2 }), async () => ({ ok: false }))).ok).toBe(false);
    const boom = async () => {
      throw new Error('rete');
    };
    expect((await submitNightEdit(view, draft({ quality: 2 }), boom)).ok).toBe(false);
  });

  it('niente da salvare o orari incoerenti: non chiama l’azione', async () => {
    const save = vi.fn(async () => ({ ok: true }));
    expect((await submitNightEdit(view, draftFromView(view), save)).ok).toBe(false);
    expect((await submitNightEdit(view, draft({ bed: '08:00', wake: '07:00' }), save)).ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('dopo il salvataggio la bozza diventa lo stato di base', () => {
    const d = draft({ bed: '23:00', quality: null, exceptions: ['malattia', 'cena'], exceptionLabels: { cena: 'Cena' } });
    const next = applyDraftToView(view, d);
    expect(buildNightEditInput(next, d)).toBeNull();
    expect(next.durationText).toBe('8h 00m');
    expect(next.exceptions.find((e) => e.slug === 'cena')?.label).toBe('Cena');
  });

  it('una notte mancante con orari salvati diventa confermata', () => {
    const d = draft({ bed: '23:30', wake: '07:30' }, missingView);
    expect(applyDraftToView(missingView, d).status).toBe('confermata');
  });
});

describe('NightEditScreen', () => {
  const html = (v: NightEditView) => renderToStaticMarkup(<NightEditScreen view={v} />);

  it('intestazione, sezioni e un solo pulsante pieno', () => {
    const s = html(view);
    expect(s).toContain('<h1');
    expect(s).toContain('>Modifica notte</h1>');
    expect(s).toContain('Notte del 13 ottobre');
    expect(s).toContain('martedì 13 ottobre 2026');
    expect(s).toContain('badge-confirmed');
    expect(s).toContain('href="/storico?m=2026-10&amp;d=2026-10-13"');
    for (const h of ['Orari', 'Qualità e Energia', 'Giornata particolare', 'Sera di lunedì 12 ottobre', 'Sonnellino']) {
      expect(s).toMatch(new RegExp(`<h2[^>]*>${h}</h2>`));
    }
    expect(count(s, /btn-primary/g)).toBe(1);
    expect(count(s, /type="time"/g)).toBe(2);
    expect(s).toContain('Sono andato a letto');
    expect(s).toContain('Mi sono svegliato');
    expect(s).toContain('Sonnellino 32 min');
    expect(s).not.toMatch(/NaN|undefined|\bnull\b|\[object/);
  });

  it('senza modifiche `Salva notte` è disabilitato; Togli il voto solo dove c’è un voto', () => {
    const s = html(view);
    expect(s).toMatch(/<button[^>]*disabled=""[^>]*>Salva notte<\/button>/);
    // qualità 4, tiredness 3 hanno voto; energia no
    expect(count(s, /Togli il voto/g)).toBe(2);
    expect(s).toContain('aria-pressed="true"');
    expect(s).toContain('Giornata lunga');
  });

  it('notte mancante: orari mancanti con suggerimenti, nessun sonnellino, nessun `Notte dopo`', () => {
    const s = html(missingView);
    expect(s).toContain('badge-missing');
    expect(count(s, />Mancante<\/p>/g)).toBe(2);
    expect(s).toContain('>Usa 23:30</button>');
    expect(s).toContain('>Usa 07:30</button>');
    expect(s).not.toContain('Togli il voto');
    expect(s).not.toContain('Sonnellino');
    expect(s).toContain('Notte prima');
    expect(s).not.toContain('Notte dopo');
    expect(text(s)).toContain('Durata: —');
    expect(count(s, /btn-primary/g)).toBe(1);
  });

  it('link alle notti vicine', () => {
    const s = html(view);
    expect(s).toContain('href="/storico/2026-10-12"');
    expect(s).toContain('href="/storico/2026-10-14"');
  });

  it('nessun dialogo né messaggi finché non succede qualcosa', () => {
    const s = html(view);
    expect(s).not.toContain(UNSAVED_TEXT);
    expect(s).not.toContain('role="alert"');
    expect(s).not.toContain('role="status"');
    expect(s).not.toContain(SAVE_ERROR_TEXT);
  });
});
