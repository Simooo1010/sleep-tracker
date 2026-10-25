import { describe, expect, it } from 'vitest';
import type { EveningCheck } from '../../../src/domain/types';
import { buildEveningView } from '../../../src/server/views';
import { TODAY, expectSerializable } from './fixtures';
import { localToIso } from '../../../src/domain/estimate';

describe('buildEveningView: senza check', () => {
  const v = buildEveningView({ today: TODAY });

  it('empty, testo dedicato, nulla di obbligatorio', () => {
    expect(v.empty).toBe(true);
    expect(v.saved).toBe(false);
    expect(v.emptyText).toBe('Nessun check per stasera. Bastano pochi tocchi, e ogni domanda si può saltare.');
    expect(v.title).toBe('Come stai stasera?');
    expect(v.dateLabel).toBe('sabato 24 ottobre');
  });

  it('quattro passi del wizard con avanzamento', () => {
    expect(v.steps.map((s) => s.question)).toEqual([
      'Quanto sei stanco?',
      "Com'è il tuo umore?",
      'Cosa è successo oggi?',
      'Hai fatto un sonnellino?',
    ]);
    expect(v.steps.map((s) => s.kicker)).toEqual([
      'Check serale · domanda 1 di 4',
      'Check serale · domanda 2 di 4',
      'Check serale · domanda 3 di 4',
      'Check serale · domanda 4 di 4',
    ]);
    expect(v.steps.map((s) => s.control)).toEqual(['moons', 'chips', 'multi-chips', 'nap-chips']);
    expect(v.steps[1]?.progress).toEqual([true, true, false, false]);
    expect(v.steps.map((s) => s.primaryLabel)).toEqual(['Avanti', 'Avanti', 'Avanti', 'Vado a dormire']);
    expect(v.steps.map((s) => s.backLabel)).toEqual([null, 'Indietro', 'Indietro', 'Indietro']);
    expect(v.steps[0]?.options.map((o) => o.label)).toEqual([
      'Stanchezza 1 di 5',
      'Stanchezza 2 di 5',
      'Stanchezza 3 di 5',
      'Stanchezza 4 di 5',
      'Stanchezza 5 di 5',
    ]);
    expect(v.steps[1]?.options.map((o) => o.label)).toEqual(['Pesante', 'Così così', 'Neutro', 'Leggero', 'Sereno']);
    expect(v.steps[2]?.options.map((o) => o.label)).toEqual([
      'Schermo a letto',
      'Sport',
      'Giornata stressante',
      'Cena tardi',
      'Alcol',
      'Mal di testa',
    ]);
    expect(v.steps[2]?.options.some((o) => /caff/i.test(o.label))).toBe(false);
    expect(v.steps[2]?.exceptions.map((o) => o.label)).toEqual(['Malattia', 'Viaggio', 'Festa', 'Notte in bianco', 'Alcol']);
    expect(v.steps[3]?.options.map((o) => o.label)).toEqual(['Nessuno', '15 min', '30 min', '45 min', '1 ora']);
    expect(v.steps.every((s) => s.options.every((o) => !o.selected))).toBe(true);
  });

  it('riepilogo con i mancanti a "—" e la frase finale', () => {
    expect(v.summary.rows).toEqual([
      { key: 'tiredness', label: 'Stanchezza', value: '—' },
      { key: 'mood', label: 'Umore', value: '—' },
      { key: 'factors', label: 'Fattori', value: '—' },
      { key: 'nap', label: 'Sonnellino', value: '—' },
    ]);
    expect(v.summary.sendLabel).toBe('Vado a dormire');
    expect(v.summary.savedText).toBe('Buonanotte. Check salvato. Riposo è attivo e la sveglia è impostata.');
    expectSerializable(v);
  });
});

describe('buildEveningView: check salvato e sonnellino da comando rapido', () => {
  const check: EveningCheck = {
    date: TODAY,
    tiredness: { value: 4, provenance: 'confermato' },
    mood: { value: 2, provenance: 'confermato' },
    factors: ['sport', 'cena-tardi'],
    napMinutesToday: { value: null, provenance: 'mancante' },
  };
  const v = buildEveningView({
    today: TODAY,
    check,
    naps: [{ date: TODAY, startAt: localToIso(TODAY, 14 * 60 + 5), minutes: 32, provenance: 'automatico' }],
    activeExceptions: ['festa'],
    exceptionTypes: [{ slug: 'festa', label: 'Festa', uses: 4 }],
    alarmMin: 435,
  });

  it('valori selezionati', () => {
    expect(v.empty).toBe(false);
    expect(v.saved).toBe(true);
    expect(v.steps[0]?.options.find((o) => o.selected)?.value).toBe('4');
    expect(v.steps[1]?.options.find((o) => o.selected)?.label).toBe('Così così');
    expect(v.steps[2]?.options.filter((o) => o.selected).map((o) => o.label)).toEqual(['Sport', 'Cena tardi']);
    expect(v.steps[2]?.exceptions[0]).toEqual({ value: 'festa', label: 'Festa', selected: true });
    expect(v.steps[3]?.options.find((o) => o.selected)?.label).toBe('30 min');
    expect(v.steps[3]?.note).toBe('Registrato dal comando rapido: 32 min.');
  });

  it('riepilogo e conferma con l’orario della sveglia', () => {
    expect(v.summary.rows.map((r) => r.value)).toEqual(['4 su 5', 'Così così', 'Sport, Cena tardi, Festa', '32 min']);
    expect(v.summary.savedText).toBe(
      'Buonanotte. Check salvato. Riposo è attivo e la sveglia delle 07:15 è impostata.',
    );
    expectSerializable(v);
  });

  it('nessun sonnellino dichiarato: "Nessuno"', () => {
    const w = buildEveningView({ today: TODAY, check: { ...check, factors: [], napMinutesToday: { value: 0, provenance: 'confermato' } } });
    expect(w.summary.rows.map((r) => r.value)).toEqual(['4 su 5', 'Così così', 'Nessuno', 'Nessuno']);
    expect(w.steps[3]?.options.find((o) => o.selected)?.label).toBe('Nessuno');
    expectSerializable(w);
  });
});

describe('buildEveningView: avviso del cambio d’ora', () => {
  it('la sera prima del ritorno all’ora solare avvisa con una frase calma', () => {
    const v = buildEveningView({ today: '2026-10-24', tonightNightDate: '2026-10-25' });
    expect(v.clockChangeNotice).toBe(
      "Stanotte cambia l'ora: le lancette tornano indietro di 1 ora, quindi la notte dura 1 ora in più di quanto dicono gli orari. L'app lo tiene in conto da sola.",
    );
    expectSerializable(v);
  });

  it('la sera prima del passaggio all’ora legale dice che la notte è più corta', () => {
    const v = buildEveningView({ today: '2026-03-28', tonightNightDate: '2026-03-29' });
    expect(v.clockChangeNotice).toContain('vanno avanti di 1 ora');
    expect(v.clockChangeNotice).toContain('1 ora in meno');
  });

  it('in una sera normale, o senza la notte indicata, non c’è nessun avviso', () => {
    expect(buildEveningView({ today: TODAY, tonightNightDate: '2026-10-25'.replace('25', '26') }).clockChangeNotice).toBeNull();
    expect(buildEveningView({ today: TODAY }).clockChangeNotice).toBeNull();
  });
});
