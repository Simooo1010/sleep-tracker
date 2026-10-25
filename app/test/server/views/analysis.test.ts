import { describe, expect, it } from 'vitest';

import { localToIso } from '../../../src/domain/estimate';
import { addDays, isWeekendNight } from '../../../src/domain/time';
import type { Nap, Night } from '../../../src/domain/types';
import { buildAnalysisView, type AnalysisViewInput } from '../../../src/server/views/analysis';
import type { AnalysisPeriod, AnalysisView } from '../../../src/server/views/analysis-types';
import {
  ESTIMATED_DATES,
  EXCEPTION_DATE,
  GAP_DATES,
  MISSING_DATE,
  TODAY,
  buildDataset,
  expectSerializable,
  makeNight,
} from './fixtures';

/** Notti dalla più vecchia a `today` (inclusa); `fn` restituisce [letto, sveglia] oppure null (nessun record). */
function series(days: number, today: string, fn: (i: number, date: string) => [string, string] | null): Night[] {
  const out: Night[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -(days - 1 - i));
    const t = fn(i, date);
    if (t) out.push(makeNight(date, t[0], t[1]));
  }
  return out;
}

function clock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function view(nights: Night[], extra: Partial<AnalysisViewInput> = {}): AnalysisView {
  return buildAnalysisView({ today: TODAY, nights, naps: [], eveningChecks: [], period: 14, ...extra });
}

/** Tutte le stringhe della view. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

const regularNights = (today = TODAY) => series(42, today, () => ['23:30', '07:30']);

describe('buildAnalysisView — scene', () => {
  it("'regolare': orari stabili, durata sopra l'obiettivo, nessun debito", () => {
    const v = view(regularNights());
    expect(v.scene.key).toBe('regolare');
    expect(v.scene.label).toMatch(/Illustrazione/);
    expect(v.score).toMatchObject({ value: 100, word: 'Buona', tone: 'sage', hidden: false, hiddenText: '' });
    expect(v.headline).toBe('Un sonno regolare');
    expect(v.summary).toBe('Nelle ultime 14 notti hai dormito in media 8h 00m, con 14 notti su 14 negli orari abituali.');
    expect(v.actions).toEqual([]);
    expect(v.causes.hidden).toBe(true);
    expect(v.causes.hiddenText).toBe('Servono almeno 14 notti. Per ora ne hai 0.');
  });

  it("'debito': più di 2 ore sotto l'obiettivo nelle ultime 7 notti", () => {
    const v = view(series(42, TODAY, () => ['23:30', '05:30']));
    expect(v.scene.key).toBe('debito');
    // durata 80, regolarità 100, debito 0 → (40·80 + 35·100 + 25·0) / 100 = 67.
    expect(v.score).toMatchObject({ value: 67, word: 'Discreta', tone: 'blue' });
    expect(v.summary).toBe("Nelle ultime 7 notti mancano 10h 30m rispetto all'obiettivo di 7h 30m.");
    const a = v.actions.find((x) => x.id === 'anticipa-letto');
    expect(a).toMatchObject({ title: 'Anticipa il letto di 30 min', impact: 3, impactLabel: 'Impatto alto' });
    expect(a?.why).toContain('verso le 23:00 invece delle 23:30');
  });

  it("'deriva': la mediana del letto si sposta oltre ± 30 min", () => {
    const v = view(series(42, TODAY, (i) => [clock(23 * 60 + i * 2), clock(23 * 60 + i * 2 + 480)]));
    expect(v.scene.key).toBe('deriva');
    expect(v.headline).toBe("L'orario di letto si sta spostando");
    const c = v.causes.items.find((x) => x.id === 'deriva');
    expect(c?.evidence).toMatch(/^\+\d+ min in 5 settimane · da \d\d:\d\d a \d\d:\d\d$/);
    expect(c?.body).toContain('tende a spostarsi più tardi');
    expect(v.actions[0]?.id).toBe('anticipa-letto');
  });

  it("'recupero': un po' di debito e l'ultima notte raggiunge l'obiettivo", () => {
    const short = new Set([addDays(TODAY, -3), addDays(TODAY, -2)]);
    const v = view(series(42, TODAY, (_, d) => (short.has(d) ? ['23:30', '06:20'] : ['23:30', '07:30'])));
    expect(v.scene.key).toBe('recupero');
    expect(v.headline).toBe('Stai recuperando');
    expect(v.summary).toBe("L'ultima notte ha raggiunto l'obiettivo di 7h 30m. Restano 1h 20m di debito nelle ultime 7 notti.");
  });

  it("'pochi-dati': meno di 3 notti con dati", () => {
    const v = view(series(2, TODAY, () => ['23:30', '07:30']));
    expect(v.scene.key).toBe('pochi-dati');
    expect(v.empty).toBe(false);
    expect(v.headline).toBe('Ancora pochi dati');
    expect(v.summary).toBe("Per ora ci sono 2 notti con dati su 14. L'analisi diventa più precisa con qualche notte in più.");
  });
});

describe('buildAnalysisView — punteggio e soglie', () => {
  it('sotto soglia: punteggio, indizi e previsione nascosti con la frase della soglia', () => {
    const v = view(series(2, TODAY, () => ['23:30', '07:30']));
    expect(v.score.hidden).toBe(true);
    expect(v.score.value).toBeNull();
    // Il riferimento usa le 14 notti prima di oggi: qui ce n'è 1.
    expect(v.score.hiddenText).toBe('Servono almeno 5 notti. Per ora ne hai 1.');
    expect(v.score.parts.map((p) => p.pct)).toEqual([100, null, null]);
    expect(v.score.parts[2]?.note).toBe('Servono almeno 3 notti. Per ora ne hai 2.');
    expect(v.forecast).toMatchObject({ hidden: true, score: null, hiddenText: 'Servono almeno 10 notti con energia. Per ora ne hai 0.' });
    expect(v.causes.hidden).toBe(true);
    expect(v.actions).toEqual([]);
  });

  it('se manca una parte i pesi si ricalcolano sulle parti presenti', () => {
    // 3 notti da 6h: durata 80, debito 270 min → 40; regolarità assente → (40·80 + 25·40) / 65 = 65.
    const v = view(series(3, TODAY, () => ['23:30', '05:30']));
    expect(v.score.parts.map((p) => p.pct)).toEqual([80, null, 40]);
    expect(v.score).toMatchObject({ value: 65, hidden: false, word: 'Discreta', tone: 'blue' });
    expect(v.scene.key).toBe('debito');
  });

  it("sotto 50 il tono è peach con la parola 'Da sistemare'", () => {
    const v = view(series(3, TODAY, () => ['01:30', '05:30']));
    expect(v.score).toMatchObject({ value: 33, word: 'Da sistemare', tone: 'peach' });
  });

  it("usa l'obiettivo passato", () => {
    const v = view(regularNights(), { targetMin: 540 });
    expect(v.nights.targetMin).toBe(540);
    expect(v.score.parts[0]?.note).toBe('8h 00m di media su 14 notti, obiettivo 9h 00m');
    expect(v.scene.key).toBe('debito'); // 7 × 60 min = 7h di debito
  });
});

describe('buildAnalysisView — periodo e notti', () => {
  it.each([7, 14, 30] as AnalysisPeriod[])('periodo %i: una notte per giorno, fino a oggi', (period) => {
    const ds = buildDataset();
    const v = buildAnalysisView({ today: TODAY, nights: ds.nights, naps: ds.naps, eveningChecks: ds.checks, period });
    expect(v.period).toBe(period);
    expect(v.nights.points).toHaveLength(period);
    expect(v.nights.points[period - 1]?.nightDate).toBe(TODAY);
    expect(v.nights.points[0]?.nightDate).toBe(addDays(TODAY, -(period - 1)));
    expect(v.coverage.window).toBe(period);
    expect(v.coverage.marks).toHaveLength(period);
    expect(v.nights.coverage).toEqual(v.coverage);
    expectSerializable(v);
  });

  it('notti mancanti, stimate ed eccezioni', () => {
    const ds = buildDataset();
    const v = buildAnalysisView({ today: TODAY, nights: ds.nights, naps: ds.naps, eveningChecks: ds.checks, period: 30 });
    const at = (d: string) => v.nights.points.find((p) => p.nightDate === d);
    for (const d of [...GAP_DATES, MISSING_DATE]) {
      expect(at(d)).toMatchObject({ status: 'mancante', durationMin: null, bedAxisMin: null, wakeMin: null, outlier: false });
      expect(at(d)?.summary).toMatch(/: notte mancante\.$/);
    }
    for (const d of ESTIMATED_DATES) {
      expect(at(d)?.status).toBe('stimata');
      expect(at(d)?.summary).toContain('Stimata.');
    }
    expect(at(EXCEPTION_DATE)).toMatchObject({ exception: true, outlier: false });
    expect(at(EXCEPTION_DATE)?.summary).toContain('Giorno-eccezione');
    expect(v.coverage.used).toBe(30 - GAP_DATES.length - 1);
    expect(v.nights.caption).toMatch(/^\d+ nott[ei] su \d+ fuori dall'orario abituale \(± 30 min\)\.$|^Nessuna notte fuori/);
    expect(v.nights.avgLabel).toMatch(/^Media \dh \d\dm$/);
  });

  it('gli outlier sono le notti fuori dalla tolleranza rispetto alla mediana', () => {
    const late = addDays(TODAY, -1);
    const v = view(series(42, TODAY, (_, d) => (d === late ? ['00:45', '08:45'] : ['23:30', '07:30'])));
    const p = v.nights.points.find((x) => x.nightDate === late);
    expect(p?.outlier).toBe(true);
    expect(p?.summary).toBe("venerdì 23 ottobre: 8h 00m, letto 00:45, sveglia 08:45. Confermata. Fuori dall'orario abituale.");
    expect(v.nights.caption).toBe("1 notte su 14 fuori dall'orario abituale (± 30 min).");
    expect(p?.label).toBe('ven 23');
    expect(p?.bedAxisMin).toBe(405);
    expect(p?.wakeMin).toBe(525);
    expect(v.actions.find((a) => a.id === 'sveglia-fissa')?.title).toBe('Sveglia costante alle 07:30');
  });

  it("cambio d'ora nel periodo: indizio, nota e durata reale", () => {
    const today = '2026-10-27';
    const v = buildAnalysisView({ today, nights: regularNights(today), naps: [], eveningChecks: [], period: 7 });
    const p = v.nights.points.find((x) => x.nightDate === '2026-10-25');
    expect(p?.durationMin).toBe(540);
    expect(p?.summary).toContain("Cambio d'ora");
    expect(v.nights.caption).toContain("cambiata l'ora");
    const c = v.causes.items.find((x) => x.id === 'cambio-ora');
    expect(c).toMatchObject({ tone: 'blue', evidence: '25 ottobre: +1 ora' });
    expect(v.causes.hidden).toBe(false);
    expectSerializable(v);
  });

  it('nessun cambio d’ora fuori dal periodo', () => {
    const v = view(regularNights());
    expect(v.causes.items.some((c) => c.id === 'cambio-ora')).toBe(false);
  });
});

describe('buildAnalysisView — indizi e azioni', () => {
  it('correlazioni: solo tono non neutro, al massimo 3, un fattore una volta, linguaggio non causale', () => {
    const ds = buildDataset();
    const v = buildAnalysisView({ today: TODAY, nights: ds.nights, naps: ds.naps, eveningChecks: ds.checks, period: 14 });
    const corr = v.causes.items.filter((c) => c.id.startsWith('fattore-'));
    expect(corr.length).toBeGreaterThan(0);
    expect(corr.length).toBeLessThanOrEqual(3);
    const factors = corr.map((c) => c.id.split('-').slice(1, -1).join('-'));
    expect(new Set(factors).size).toBe(factors.length);
    for (const c of corr) {
      expect(['sage', 'peach']).toContain(c.tone);
      expect(c.body).toContain('tende a');
      expect(c.body).toContain('È un indizio, non una causa.');
      expect(c.evidence).toMatch(/^[+−]\d,\d su 5 · \d+ notti? con, \d+ senza$/);
    }
  });

  it('social jet lag ≥ 60 min: indizio e azione sul weekend', () => {
    const v = view(series(42, TODAY, (_, d) => (isWeekendNight(d) ? ['01:30', '09:30'] : ['23:30', '07:30'])));
    const c = v.causes.items.find((x) => x.id === 'social-jet-lag');
    expect(c?.title).toBe('Weekend spostato più tardi');
    expect(c?.evidence).toContain('social jet lag +120 min');
    const a = v.actions.find((x) => x.id === 'weekend');
    expect(a).toMatchObject({ title: 'Avvicina gli orari del weekend di 60 min', impact: 3, impactLabel: 'Impatto alto' });
    expect(a?.expected).toBe('Lo scarto tra weekend e feriali potrebbe scendere verso 60 min.');
  });

  it('sonnellini che tendono a spostare il letto: indizio e azione', () => {
    const naps: Nap[] = [];
    const nights = series(42, TODAY, (i, d) => {
      if (i % 3 !== 1) return ['23:30', '07:30'];
      const prev = addDays(d, -1);
      naps.push({ date: prev, startAt: localToIso(prev, 14 * 60), minutes: 40, provenance: 'automatico' });
      return ['00:30', '08:30'];
    });
    expect(naps.length).toBeGreaterThan(3);
    const v = view(nights, { naps });
    const c = v.causes.items.find((x) => x.id === 'sonnellini');
    expect(c?.body).toContain('Dopo i giorni con sonnellino tendi ad andare a letto 60 min più tardi.');
    expect(c?.tone).toBe('peach');
    const a = v.actions.find((x) => x.id === 'sonnellino-breve');
    expect(a).toMatchObject({ title: 'Sonnellino entro 20 min', impact: 2 });
    expect(a?.why).toContain('iniziano verso le 14:00');
  });

  it('azioni: al massimo 3, ordinate per impatto, con etichetta testuale', () => {
    const ds = buildDataset();
    const v = buildAnalysisView({ today: TODAY, nights: ds.nights, naps: ds.naps, eveningChecks: ds.checks, period: 14 });
    expect(v.actions.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < v.actions.length; i++) {
      expect(v.actions[i - 1]?.impact).toBeGreaterThanOrEqual(v.actions[i]?.impact ?? 0);
    }
    for (const a of v.actions) {
      expect(a.impactLabel).toBe({ 1: 'Impatto piccolo', 2: 'Impatto medio', 3: 'Impatto alto' }[a.impact]);
      expect(a.expected).toMatch(/potrebbe/);
    }
  });
});

describe('buildAnalysisView — previsione, vuoto, pulizia', () => {
  it('previsione visibile con abbastanza notti con energia', () => {
    const ds = buildDataset();
    const v = buildAnalysisView({ today: TODAY, nights: ds.nights, naps: ds.naps, eveningChecks: ds.checks, period: 14 });
    expect(v.forecast.hidden).toBe(false);
    expect(v.forecast.score).not.toBeNull();
    expect(v.forecast.label).toMatch(/^Energia di domani: (bassa|media|alta) \(\d,\d su 5\)$/);
    expect(v.forecast.explanation).toMatch(/^Stima su \d+ notti simili, con il letto verso le \d\d:\d\d\. È una stima, non una certezza\.$/);
  });

  it('vista vuota senza notti nel periodo', () => {
    const old = series(5, addDays(TODAY, -40), () => ['23:30', '07:30']);
    const v = view(old, { period: 7 });
    expect(v.empty).toBe(true);
    expect(v.emptyText).toBe("Nessuna notte registrata negli ultimi 7 giorni. L'analisi compare dalla prima notte, nessuna fretta.");
    expect(v.nights).toMatchObject({ hidden: true, hiddenText: 'Serve almeno 1 notte. Per ora ne hai 0.', avgMin: null, avgLabel: 'Media —' });
    expect(v.nights.points.every((p) => p.status === 'mancante')).toBe(true);
    expect(v.scene.key).toBe('pochi-dati');
    expect(v.coverage).toMatchObject({ used: 0, window: 7 });
    expectSerializable(v);
    expectSerializable(view([]));
  });

  it('ignora le notti dopo oggi', () => {
    const future = makeNight(addDays(TODAY, 1), '23:30', '07:30');
    expect(view([...regularNights(), future])).toEqual(view(regularNights()));
  });

  it('deterministica e senza NaN/undefined/null nelle stringhe; nessun rimprovero', () => {
    const ds = buildDataset();
    const input: AnalysisViewInput = { today: TODAY, nights: ds.nights, naps: ds.naps, eveningChecks: ds.checks, period: 30 };
    const a = buildAnalysisView(input);
    const b = buildAnalysisView(structuredClone(input));
    expect(a).toEqual(b);
    expectSerializable(a);
    const scenarios = [
      a,
      view(regularNights()),
      view(series(42, TODAY, () => ['23:30', '05:30'])),
      view(series(2, TODAY, () => ['23:30', '07:30'])),
      view([]),
    ];
    for (const v of scenarios) {
      for (const s of strings(v)) {
        expect(s).not.toMatch(/NaN|undefined|null|Infinity/);
        expect(s).not.toMatch(/\bdevi\b|colpa|sbagli|male\b/i);
        expect(s).not.toMatch(/causato|provoca|è colpa/i);
      }
    }
  });
});
