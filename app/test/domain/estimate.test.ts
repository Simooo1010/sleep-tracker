import { describe, expect, it } from 'vitest';
import { estimateMissing, localToIso } from '../../src/domain/estimate';
import { addDays, localParts } from '../../src/domain/time';
import type { Night, Provenance, Tracked } from '../../src/domain/types';

const hm = (h: number, m = 0) => h * 60 + m;

describe('localToIso', () => {
  it('converte in inverno (CET, +1) e in estate (CEST, +2)', () => {
    expect(localToIso('2026-01-15', hm(23, 30))).toBe('2026-01-15T22:30:00.000Z');
    expect(localToIso('2026-07-15', hm(23, 30))).toBe('2026-07-15T21:30:00.000Z');
    expect(localToIso('2026-07-15', 0)).toBe('2026-07-14T22:00:00.000Z');
  });

  it('cavalca la mezzanotte con minuti > 1440 o negativi', () => {
    expect(localToIso('2026-01-14', 1440 + 40)).toBe('2026-01-14T23:40:00.000Z'); // 15 gen 00:40 locali
    expect(localToIso('2026-01-15', -30)).toBe('2026-01-14T22:30:00.000Z'); // 14 gen 23:30 locali
    expect(localToIso('2026-12-31', 1440 + 60)).toBe('2027-01-01T00:00:00.000Z'); // cambio anno
    expect(localToIso('2026-03-01', -1440)).toBe('2026-02-27T23:00:00.000Z'); // 28 feb 00:00
    expect(localToIso('2026-01-15', 2 * 1440 + 5)).toBe('2026-01-16T23:05:00.000Z');
  });

  it('arrotonda i minuti frazionari', () => {
    expect(localToIso('2026-01-15', 600.4)).toBe('2026-01-15T09:00:00.000Z');
    expect(localToIso('2026-01-15', 600.5)).toBe('2026-01-15T09:01:00.000Z');
  });

  it('ora legale: 2026-03-29 02:30 non esiste → scatta in avanti a 03:30 CEST', () => {
    const iso = localToIso('2026-03-29', hm(2, 30));
    expect(iso).toBe('2026-03-29T01:30:00.000Z');
    expect(localParts(iso)).toMatchObject({ date: '2026-03-29', minutes: hm(3, 30) });
    expect(localToIso('2026-03-29', hm(2, 0))).toBe('2026-03-29T01:00:00.000Z');
    expect(localToIso('2026-03-29', hm(2, 59))).toBe('2026-03-29T01:59:00.000Z');
  });

  it('ora legale: intorno al buco gli orari esistenti sono esatti', () => {
    expect(localToIso('2026-03-29', hm(1, 59))).toBe('2026-03-29T00:59:00.000Z');
    expect(localToIso('2026-03-29', hm(3, 0))).toBe('2026-03-29T01:00:00.000Z');
    expect(localToIso('2026-03-29', hm(8, 0))).toBe('2026-03-29T06:00:00.000Z');
    // Sera prima del salto + minuti oltre la mezzanotte
    expect(localToIso('2026-03-28', 1440 + hm(1, 0))).toBe('2026-03-29T00:00:00.000Z');
    expect(localToIso('2026-03-28', 1440 + hm(2, 30))).toBe('2026-03-29T01:30:00.000Z');
  });

  it('ora solare: 2026-10-25 02:30 è ambigua → prima occorrenza (ancora CEST)', () => {
    const iso = localToIso('2026-10-25', hm(2, 30));
    expect(iso).toBe('2026-10-25T00:30:00.000Z');
    expect(localParts(iso)).toMatchObject({ date: '2026-10-25', minutes: hm(2, 30) });
    // La seconda occorrenza esiste ma non viene scelta
    expect(localParts('2026-10-25T01:30:00.000Z')).toMatchObject({ minutes: hm(2, 30) });
    expect(localToIso('2026-10-25', hm(2, 0))).toBe('2026-10-25T00:00:00.000Z');
    expect(localToIso('2026-10-25', hm(2, 59))).toBe('2026-10-25T00:59:00.000Z');
  });

  it('ora solare: intorno alla sovrapposizione gli orari sono esatti', () => {
    expect(localToIso('2026-10-25', hm(1, 59))).toBe('2026-10-24T23:59:00.000Z');
    expect(localToIso('2026-10-25', hm(3, 0))).toBe('2026-10-25T02:00:00.000Z');
    expect(localToIso('2026-10-25', hm(8, 0))).toBe('2026-10-25T07:00:00.000Z');
    expect(localToIso('2026-10-24', hm(23, 30))).toBe('2026-10-24T21:30:00.000Z');
  });

  it('round-trip con localParts su ogni quarto d’ora dei giorni di cambio ora (fuori dal buco)', () => {
    for (const date of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-10-24', '2026-10-25', '2026-10-26']) {
      for (let m = 0; m < 1440; m += 15) {
        if (date === '2026-03-29' && m >= hm(2) && m < hm(3)) continue;
        expect(localParts(localToIso(date, m)), `${date} ${m}`).toMatchObject({ date, minutes: m });
      }
    }
  });

  it('rifiuta date non valide', () => {
    expect(() => localToIso('2026-02-30', 0)).toThrow();
    expect(() => localToIso('2026/01/01', 0)).toThrow();
    expect(() => localToIso('', 0)).toThrow();
    expect(() => localToIso('2026-01-01', Number.NaN)).toThrow();
  });
});

// ---------- estimateMissing ----------

const tracked = (value: string | null, provenance: Provenance): Tracked<string> => ({ value, provenance });

/** Notte di storico: letto la sera prima alle `bed` (minuti locali, >1440 = dopo mezzanotte), sveglia alle `wake`. */
function hist(nightDate: string, bed: number, wake: number, extra: Partial<Night> = {}): Night {
  return {
    nightDate,
    bedAt: tracked(localToIso(addDays(nightDate, -1), bed), 'automatico'),
    wakeAt: tracked(localToIso(nightDate, wake), 'automatico'),
    status: 'confermata',
    quality: { value: 3, provenance: 'confermato' },
    energy: { value: 3, provenance: 'confermato' },
    isException: false,
    factors: [],
    ...extra,
  };
}

function missing(nightDate: string, extra: Partial<Night> = {}): Night {
  return {
    nightDate,
    bedAt: tracked(null, 'mancante'),
    wakeAt: tracked(null, 'mancante'),
    status: 'mancante',
    quality: { value: null, provenance: 'mancante' },
    energy: { value: null, provenance: 'mancante' },
    isException: false,
    factors: [],
    ...extra,
  };
}

// Notti feriali (risveglio lun–ven) di gennaio 2026: 12–16 = lun–ven.
const weekdaysJan = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16'];
// Notti weekend (risveglio sab/dom): 10, 11, 17, 18 gennaio.
const weekendJan = ['2026-01-10', '2026-01-11', '2026-01-17', '2026-01-18'];

describe('estimateMissing', () => {
  it('stima letto e sveglia dalla mediana dei feriali e marca stimato/stimata', () => {
    const bedTimes = [hm(23, 0), hm(23, 30), 1440 + hm(0, 10), hm(23, 20), hm(23, 40)]; // mediana 23:30
    const wakeTimes = [hm(7, 0), hm(7, 10), hm(7, 30), hm(6, 50), hm(7, 20)]; // mediana 07:10
    const history = [
      ...weekdaysJan.map((d, i) => hist(d, bedTimes[i] as number, wakeTimes[i] as number)),
      ...weekendJan.map((d) => hist(d, 1440 + hm(1, 30), hm(10, 0))),
    ];
    const out = estimateMissing(missing('2026-01-20'), history); // martedì
    expect(out.bedAt).toEqual({ value: '2026-01-19T22:30:00.000Z', provenance: 'stimato' });
    expect(out.wakeAt).toEqual({ value: '2026-01-20T06:10:00.000Z', provenance: 'stimato' });
    expect(out.status).toBe('stimata');
  });

  it('usa la categoria weekend per una notte di weekend', () => {
    const history = [
      ...weekdaysJan.map((d) => hist(d, hm(23, 0), hm(7, 0))),
      ...weekendJan.map((d, i) => hist(d, 1440 + hm(0, 30 + i * 10), hm(9, 30))),
    ];
    // bed 00:30, 00:40, 00:50, 01:00 → mediana 00:45; notte di sab 24 gen (risveglio sabato)
    const out = estimateMissing(missing('2026-01-24'), history);
    expect(localParts(out.bedAt.value as string)).toMatchObject({ date: '2026-01-24', minutes: hm(0, 45) });
    expect(localParts(out.wakeAt.value as string)).toMatchObject({ date: '2026-01-24', minutes: hm(9, 30) });
  });

  it('la mediana sull’asse da 18:00 tratta correttamente letti a cavallo della mezzanotte', () => {
    const history = ['2026-01-13', '2026-01-14', '2026-01-15'].map((d, i) =>
      hist(d, [hm(23, 50), 1440 + hm(0, 20), 1440 + hm(0, 10)][i] as number, hm(7, 0)),
    );
    const out = estimateMissing(missing('2026-01-16'), history);
    // mediana 00:10 del giorno nightDate (non 23:50 né una media "sballata" a mezzogiorno)
    expect(out.bedAt.value).toBe('2026-01-15T23:10:00.000Z');
  });

  it('mediana pari arrotondata al minuto', () => {
    const history = ['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15'].map((d, i) =>
      hist(d, hm(23, 0), [hm(7, 0), hm(7, 1), hm(7, 2), hm(7, 3)][i] as number),
    );
    const out = estimateMissing(missing('2026-01-16'), history);
    expect(localParts(out.wakeAt.value as string).minutes).toBe(hm(7, 2)); // 421.5 → 422
  });

  it('non tocca i campi già presenti (anche se stimati) e riempie solo quelli null', () => {
    const history = weekdaysJan.map((d) => hist(d, hm(23, 0), hm(7, 0)));
    const presentBed = tracked('2026-01-19T23:15:00.000Z', 'stimato');
    const n = missing('2026-01-20', { bedAt: presentBed, status: 'stimata' });
    const out = estimateMissing(n, history);
    expect(out.bedAt).toBe(presentBed);
    expect(out.wakeAt).toEqual({ value: '2026-01-20T06:00:00.000Z', provenance: 'stimato' });
    expect(out.status).toBe('stimata');
  });

  it('non cambia lo status se non era mancante (mai confermata)', () => {
    const history = weekdaysJan.map((d) => hist(d, hm(23, 0), hm(7, 0)));
    const n = missing('2026-01-20', {
      wakeAt: tracked('2026-01-20T06:30:00.000Z', 'automatico'),
      status: 'stimata',
    });
    const out = estimateMissing(n, history);
    expect(out.status).toBe('stimata');
    expect(out.bedAt.provenance).toBe('stimato');
    expect(out.wakeAt.provenance).toBe('automatico');
  });

  it('notte completa: restituita invariata', () => {
    const history = weekdaysJan.map((d) => hist(d, hm(23, 0), hm(7, 0)));
    const n = hist('2026-01-20', hm(22, 0), hm(6, 0), { status: 'confermata' });
    expect(estimateMissing(n, history)).toBe(n);
  });

  it('esclude eccezioni, notti senza orari, notti future e fuori dai 28 giorni', () => {
    const target = '2026-02-10'; // martedì
    const good = ['2026-02-03', '2026-02-04', '2026-02-05'].map((d) => hist(d, hm(23, 0), hm(7, 0)));
    const noise = [
      hist('2026-02-06', 1440 + hm(3, 0), hm(11, 0), { isException: true }),
      hist('2026-02-09', 1440 + hm(3, 0), hm(11, 0), { isException: true }),
      { ...hist('2026-02-02', 1440 + hm(3, 0), hm(11, 0)), wakeAt: tracked(null, 'mancante') },
      hist('2026-01-12', 1440 + hm(3, 0), hm(11, 0)), // 29 giorni prima: fuori finestra
      hist('2026-01-13', 1440 + hm(3, 0), hm(11, 0)), // 28 giorni prima: dentro
      hist('2026-02-11', 1440 + hm(3, 0), hm(11, 0)), // futura
      hist('2026-02-10', 1440 + hm(3, 0), hm(11, 0)), // stessa notte
    ];
    const out = estimateMissing(missing(target), [...noise, ...good]);
    // validi: 3×(23:00, 07:00) + 1×(03:00, 11:00) → mediana (23:00,23:00,23:00,03:00) = 23:00
    expect(localParts(out.bedAt.value as string)).toMatchObject({ date: '2026-02-09', minutes: hm(23, 0) });
    expect(localParts(out.wakeAt.value as string)).toMatchObject({ date: target, minutes: hm(7, 0) });
  });

  it('meno di 3 nella categoria: ripiega su tutte le categorie se sono almeno 5', () => {
    const history = [
      hist('2026-01-17', 1440 + hm(1, 0), hm(10, 0)), // weekend
      hist('2026-01-18', 1440 + hm(1, 0), hm(10, 0)), // weekend
      ...['2026-01-19', '2026-01-20', '2026-01-21'].map((d) => hist(d, hm(23, 0), hm(7, 0))),
    ];
    const out = estimateMissing(missing('2026-01-24'), history); // sabato: 2 weekend < 3 → tutte (5)
    expect(localParts(out.bedAt.value as string)).toMatchObject({ date: '2026-01-23', minutes: hm(23, 0) });
    expect(localParts(out.wakeAt.value as string).minutes).toBe(hm(7, 0));
    expect(out.status).toBe('stimata');
  });

  it('dati insufficienti: lascia mancante, nessun errore', () => {
    const history = [
      hist('2026-01-17', 1440 + hm(1, 0), hm(10, 0)),
      hist('2026-01-18', 1440 + hm(1, 0), hm(10, 0)),
      hist('2026-01-19', hm(23, 0), hm(7, 0)),
      hist('2026-01-20', hm(23, 0), hm(7, 0)),
    ];
    const n = missing('2026-01-24');
    const out = estimateMissing(n, history);
    expect(out).toEqual(n);
    expect(out.bedAt).toEqual({ value: null, provenance: 'mancante' });
    expect(out.status).toBe('mancante');
    expect(estimateMissing(n, [])).toEqual(n);
  });

  it('non produce letto ≥ risveglio: il campo stimato resta mancante', () => {
    const history = weekdaysJan.map((d) => hist(d, hm(23, 0), hm(7, 0)));
    const n = missing('2026-01-20', { bedAt: tracked('2026-01-20T06:30:00.000Z', 'automatico') }); // 07:30 locali
    const out = estimateMissing(n, history);
    expect(out.wakeAt).toEqual({ value: null, provenance: 'mancante' });
    expect(out.status).toBe('mancante');
  });

  it('non modifica gli input', () => {
    const history = weekdaysJan.map((d) => hist(d, hm(23, 0), hm(7, 0)));
    const n = missing('2026-01-20');
    const snapshot = structuredClone({ n, history });
    estimateMissing(n, history);
    expect({ n, history }).toEqual(snapshot);
  });

  it('ora solare: notte del 25 ottobre 2026 stimata con gli offset corretti', () => {
    // Weekend di ottobre: risvegli 3, 4, 10, 11, 17, 18 ottobre (CEST)
    const history = ['2026-10-03', '2026-10-04', '2026-10-10', '2026-10-11', '2026-10-17', '2026-10-18'].map((d) =>
      hist(d, hm(23, 30), hm(8, 0)),
    );
    const out = estimateMissing(missing('2026-10-25'), history); // domenica, cambio ora
    expect(out.bedAt.value).toBe('2026-10-24T21:30:00.000Z'); // 23:30 CEST
    expect(out.wakeAt.value).toBe('2026-10-25T07:00:00.000Z'); // 08:00 CET
    expect(localParts(out.bedAt.value as string)).toMatchObject({ date: '2026-10-24', minutes: hm(23, 30) });
    expect(localParts(out.wakeAt.value as string)).toMatchObject({ date: '2026-10-25', minutes: hm(8, 0) });
  });

  it('ora legale: notte del 29 marzo 2026, letto dopo mezzanotte e sveglia in CEST', () => {
    const history = ['2026-03-14', '2026-03-15', '2026-03-21', '2026-03-22'].map((d) =>
      hist(d, 1440 + hm(1, 0), hm(9, 0)),
    );
    const out = estimateMissing(missing('2026-03-29'), history);
    expect(out.bedAt.value).toBe('2026-03-29T00:00:00.000Z'); // 01:00 CET
    expect(out.wakeAt.value).toBe('2026-03-29T07:00:00.000Z'); // 09:00 CEST
  });
});
