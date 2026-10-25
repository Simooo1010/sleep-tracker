import { describe, expect, it } from 'vitest';

import { BASELINE_MIN_NIGHTS, computeBaseline } from '../../src/domain/baseline';
import type { Night, NightStatus } from '../../src/domain/types';
import { addDays } from '../../src/domain/time';

/**
 * Istante ISO UTC a partire da un orario locale Europe/Rome con offset esplicito
 * (+1 = CET/inverno, +2 = CEST/estate). Offset espliciti per non dipendere da time.ts nei test.
 */
function at(date: string, hhmm: string, offsetHours: 1 | 2): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, mo - 1, d, h - offsetHours, mi)).toISOString();
}

interface Opts {
  status?: NightStatus;
  isException?: boolean;
  bed?: string | null;
  wake?: string | null;
}

/** Notte con letto la sera prima (o dopo mezzanotte, se bed < 18:00) e risveglio il giorno nightDate. */
function night(nightDate: string, bed: string, wake: string, offset: 1 | 2 = 1, o: Opts = {}): Night {
  const bedDate = Number(bed.slice(0, 2)) >= 18 ? addDays(nightDate, -1) : nightDate;
  const bedIso = o.bed === undefined ? at(bedDate, bed, offset) : o.bed;
  const wakeIso = o.wake === undefined ? at(nightDate, wake, offset) : o.wake;
  return {
    nightDate,
    bedAt: { value: bedIso, provenance: bedIso ? 'confermato' : 'mancante' },
    wakeAt: { value: wakeIso, provenance: wakeIso ? 'confermato' : 'mancante' },
    status: o.status ?? 'confermata',
    quality: { value: null, provenance: 'mancante' },
    energy: { value: null, provenance: 'mancante' },
    isException: o.isException ?? false,
    factors: [],
  };
}

/** N notti consecutive che terminano il giorno prima di asOf, tutte con gli stessi orari. */
function series(asOf: string, n: number, bed = '23:00', wake = '07:00', offset: 1 | 2 = 1): Night[] {
  return Array.from({ length: n }, (_, i) => night(addDays(asOf, -1 - i), bed, wake, offset));
}

const AS_OF = '2026-01-20';

describe('computeBaseline — soglia e copertura', () => {
  it('esporta la soglia minima di 5 notti', () => {
    expect(BASELINE_MIN_NIGHTS).toBe(5);
  });

  it('input vuoto: valore nascosto, copertura 0 su 14', () => {
    expect(computeBaseline([], AS_OF)).toEqual({
      value: null,
      coverage: { used: 0, window: 14 },
      hiddenReason: 'Servono almeno 5 notti. Per ora ne hai 0.',
    });
  });

  it('4 notti valide: sotto soglia, con messaggio che riporta il conteggio', () => {
    const r = computeBaseline(series(AS_OF, 4), AS_OF);
    expect(r.value).toBeNull();
    expect(r.coverage).toEqual({ used: 4, window: 14 });
    expect(r.hiddenReason).toBe('Servono almeno 5 notti. Per ora ne hai 4.');
  });

  it('esattamente 5 notti valide: valore calcolato e nessun hiddenReason', () => {
    const r = computeBaseline(series(AS_OF, 5), AS_OF);
    expect(r.value).toEqual({ bedMin: 300, wakeMin: 420 }); // 23:00 → 300 sull'asse dalle 18:00; 07:00 → 420
    expect(r.coverage).toEqual({ used: 5, window: 14 });
    expect(r.hiddenReason).toBeUndefined();
    expect('hiddenReason' in r).toBe(false);
  });

  it('14 notti valide: copertura piena 14 su 14', () => {
    const r = computeBaseline(series(AS_OF, 14), AS_OF);
    expect(r.coverage).toEqual({ used: 14, window: 14 });
    expect(r.value).toEqual({ bedMin: 300, wakeMin: 420 });
  });

  it('più di 14 notti nell\'input: conta solo le 14 della finestra', () => {
    const r = computeBaseline(series(AS_OF, 30), AS_OF);
    expect(r.coverage).toEqual({ used: 14, window: 14 });
  });
});

describe('computeBaseline — finestra di 14 giorni di calendario', () => {
  it('asOf escluso, asOf−14 incluso, asOf−15 escluso, notti future escluse', () => {
    const base = series(AS_OF, 4); // 19..16 gennaio
    const nights = [
      ...base,
      night(AS_OF, '20:00', '05:00'), // asOf stesso: escluso
      night(addDays(AS_OF, 3), '20:00', '05:00'), // futuro: escluso
      night(addDays(AS_OF, -15), '20:00', '05:00'), // fuori finestra: escluso
    ];
    const r1 = computeBaseline(nights, AS_OF);
    expect(r1.value).toBeNull();
    expect(r1.coverage.used).toBe(4);

    const r2 = computeBaseline([...nights, night(addDays(AS_OF, -14), '23:00', '07:00')], AS_OF);
    expect(r2.coverage.used).toBe(5);
    expect(r2.value).toEqual({ bedMin: 300, wakeMin: 420 });
  });

  it('la finestra è di giorni di calendario, non di notti: i buchi non allargano la finestra', () => {
    // 3 notti recenti + 3 notti più vecchie di 14 giorni → solo 3 usate
    const nights = [
      ...series(AS_OF, 3),
      night(addDays(AS_OF, -15), '23:00', '07:00'),
      night(addDays(AS_OF, -16), '23:00', '07:00'),
      night(addDays(AS_OF, -17), '23:00', '07:00'),
    ];
    const r = computeBaseline(nights, AS_OF);
    expect(r.coverage).toEqual({ used: 3, window: 14 });
    expect(r.hiddenReason).toBe('Servono almeno 5 notti. Per ora ne hai 3.');
  });

  it('finestra a cavallo di fine anno', () => {
    const asOf = '2026-01-03'; // finestra: 2025-12-20 … 2026-01-02
    const nights = [
      night('2026-01-02', '23:00', '07:00'),
      night('2026-01-01', '23:00', '07:00'),
      night('2025-12-31', '23:00', '07:00'),
      night('2025-12-21', '23:00', '07:00'),
      night('2025-12-20', '23:00', '07:00'),
      night('2025-12-19', '23:00', '07:00'), // fuori
    ];
    const r = computeBaseline(nights, asOf);
    expect(r.coverage.used).toBe(5);
    expect(r.value).toEqual({ bedMin: 300, wakeMin: 420 });
  });

  it('l\'ordine dell\'input non conta', () => {
    const nights = [
      night('2026-01-15', '22:00', '06:00'),
      night('2026-01-19', '23:30', '07:30'),
      night('2026-01-17', '01:00', '09:00'),
      night('2026-01-16', '23:00', '07:00'),
      night('2026-01-18', '00:00', '08:00'),
    ];
    const r1 = computeBaseline(nights, AS_OF);
    const r2 = computeBaseline([...nights].reverse(), AS_OF);
    expect(r1).toEqual(r2);
    expect(r1.value).toEqual({ bedMin: 330, wakeMin: 450 }); // 23:30 / 07:30
  });

  it('non modifica l\'array in input', () => {
    const nights = [
      night('2026-01-15', '01:00', '09:00'),
      night('2026-01-19', '22:00', '06:00'),
      night('2026-01-17', '23:00', '07:00'),
    ];
    const snapshot = JSON.parse(JSON.stringify(nights));
    computeBaseline(nights, AS_OF);
    expect(nights).toEqual(snapshot);
  });

  it('data di riferimento non valida: errore', () => {
    expect(() => computeBaseline([], '20-01-2026')).toThrow();
    expect(() => computeBaseline([], '')).toThrow();
  });
});

describe('computeBaseline — esclusioni', () => {
  it('esclude notti-eccezione', () => {
    const nights = [
      ...series(AS_OF, 4),
      night(addDays(AS_OF, -5), '03:00', '11:00', 1, { isException: true }),
      night(addDays(AS_OF, -6), '03:00', '11:00', 1, { isException: true }),
    ];
    const r = computeBaseline(nights, AS_OF);
    expect(r.coverage.used).toBe(4);
    expect(r.value).toBeNull();

    const r2 = computeBaseline([...nights, night(addDays(AS_OF, -7), '23:00', '07:00')], AS_OF);
    expect(r2.coverage.used).toBe(5);
    expect(r2.value).toEqual({ bedMin: 300, wakeMin: 420 }); // le eccezioni non spostano la mediana
  });

  it('esclude notti senza orario di letto o di risveglio', () => {
    const nights = [
      ...series(AS_OF, 4),
      night(addDays(AS_OF, -5), '23:00', '07:00', 1, { bed: null }),
      night(addDays(AS_OF, -6), '23:00', '07:00', 1, { wake: null }),
      night(addDays(AS_OF, -7), '23:00', '07:00', 1, { bed: null, wake: null, status: 'mancante' }),
    ];
    const r = computeBaseline(nights, AS_OF);
    expect(r.coverage).toEqual({ used: 4, window: 14 });
    expect(r.value).toBeNull();
  });

  it('esclude notti con status mancante anche se hanno orari', () => {
    const nights = [
      ...series(AS_OF, 4),
      night(addDays(AS_OF, -5), '23:00', '07:00', 1, { status: 'mancante' }),
    ];
    expect(computeBaseline(nights, AS_OF).coverage.used).toBe(4);
  });

  it('include le notti stimate', () => {
    const nights = [
      ...series(AS_OF, 4),
      night(addDays(AS_OF, -5), '23:00', '07:00', 1, { status: 'stimata' }),
    ];
    const r = computeBaseline(nights, AS_OF);
    expect(r.coverage.used).toBe(5);
    expect(r.value).toEqual({ bedMin: 300, wakeMin: 420 });
  });

  it('notti duplicate per la stessa data contano una volta sola, preferendo la confermata', () => {
    const d = addDays(AS_OF, -1);
    const nights = [
      night(d, '02:00', '10:00', 1, { status: 'stimata' }),
      night(d, '23:00', '07:00', 1, { status: 'confermata' }),
      night(d, '03:00', '11:00', 1, { status: 'stimata' }),
      ...series(addDays(AS_OF, -1), 4), // 18..15 gennaio
    ];
    const r = computeBaseline(nights, AS_OF);
    expect(r.coverage.used).toBe(5);
    expect(r.value).toEqual({ bedMin: 300, wakeMin: 420 });
  });

  it('una duplicata non valida non oscura quella valida', () => {
    const d = addDays(AS_OF, -1);
    const nights = [
      night(d, '23:00', '07:00', 1, { isException: true }),
      night(d, '23:00', '07:00', 1, { status: 'stimata' }),
      ...series(addDays(AS_OF, -1), 4),
    ];
    expect(computeBaseline(nights, AS_OF).coverage.used).toBe(5);
  });
});

describe('computeBaseline — mediana', () => {
  it('usa la mediana, non la media: una notte anomala non sposta il riferimento', () => {
    const nights = [
      night('2026-01-19', '23:00', '07:00'),
      night('2026-01-18', '23:10', '07:10'),
      night('2026-01-17', '22:50', '06:50'),
      night('2026-01-16', '23:05', '07:05'),
      night('2026-01-15', '04:00', '12:30'), // anomala
    ];
    const r = computeBaseline(nights, AS_OF);
    // letto: 290, 300, 305, 310, 600 → 305 (23:05); sveglia: 410, 420, 425, 430, 750 → 425 (07:05)
    expect(r.value).toEqual({ bedMin: 305, wakeMin: 425 });
  });

  it('numero pari di notti: media dei due valori centrali (anche non intera)', () => {
    const nights = [
      night('2026-01-19', '23:00', '07:00'),
      night('2026-01-18', '23:01', '07:01'),
      night('2026-01-17', '23:02', '07:02'),
      night('2026-01-16', '23:03', '07:03'),
      night('2026-01-15', '23:04', '07:04'),
      night('2026-01-14', '23:05', '07:05'),
    ];
    const r = computeBaseline(nights, AS_OF);
    expect(r.value).toEqual({ bedMin: 302.5, wakeMin: 422.5 });
  });

  it('notti a cavallo di mezzanotte: asse continuo dalle 18:00', () => {
    // 23:30, 23:50, 00:10, 00:20, 00:40 → 330, 350, 370, 380, 400 → mediana 370 (00:10)
    const nights = [
      night('2026-01-19', '23:30', '07:30'),
      night('2026-01-18', '23:50', '07:40'),
      night('2026-01-17', '00:10', '07:50'),
      night('2026-01-16', '00:20', '08:00'),
      night('2026-01-15', '00:40', '08:10'),
    ];
    const r = computeBaseline(nights, AS_OF);
    expect(r.value).toEqual({ bedMin: 370, wakeMin: 470 });
  });

  it('mediana pari a cavallo di mezzanotte: 23:50 e 00:10 → 00:00', () => {
    const nights = [
      night('2026-01-19', '23:30', '07:00'),
      night('2026-01-18', '23:40', '07:00'),
      night('2026-01-17', '23:50', '07:00'),
      night('2026-01-16', '00:10', '07:00'),
      night('2026-01-15', '00:20', '07:00'),
      night('2026-01-14', '00:30', '07:00'),
    ];
    expect(computeBaseline(nights, AS_OF).value).toEqual({ bedMin: 360, wakeMin: 420 });
  });
});

describe('computeBaseline — ora legale (Europe/Rome)', () => {
  it('passaggio all\'ora legale 2026-03-29: orari locali costanti → mediana costante', () => {
    // 2026-03-25 … 2026-04-01; la notte del 28→29 va a letto in CET e si sveglia in CEST.
    const nights: Night[] = [
      night('2026-03-25', '23:00', '07:00', 1),
      night('2026-03-26', '23:00', '07:00', 1),
      night('2026-03-27', '23:00', '07:00', 1),
      night('2026-03-28', '23:00', '07:00', 1),
      {
        ...night('2026-03-29', '23:00', '07:00', 1),
        bedAt: { value: at('2026-03-28', '23:00', 1), provenance: 'automatico' }, // 22:00Z
        wakeAt: { value: at('2026-03-29', '07:00', 2), provenance: 'automatico' }, // 05:00Z
      },
      night('2026-03-30', '23:00', '07:00', 2),
      night('2026-03-31', '23:00', '07:00', 2),
      night('2026-04-01', '23:00', '07:00', 2),
    ];
    const r = computeBaseline(nights, '2026-04-02');
    expect(r.coverage).toEqual({ used: 8, window: 14 });
    expect(r.value).toEqual({ bedMin: 300, wakeMin: 420 });
  });

  it('ora legale 2026-03-29: un errore di fuso sposterebbe di 60 min — la mediana resta locale', () => {
    // Solo notti CEST (dopo il cambio), finestra che inizia prima del cambio.
    const nights = [
      night('2026-03-30', '23:30', '07:15', 2),
      night('2026-03-31', '23:30', '07:15', 2),
      night('2026-04-01', '23:30', '07:15', 2),
      night('2026-04-02', '23:30', '07:15', 2),
      night('2026-04-03', '23:30', '07:15', 2),
    ];
    const r = computeBaseline(nights, '2026-04-04');
    expect(r.value).toEqual({ bedMin: 330, wakeMin: 435 });
  });

  it('ritorno all\'ora solare 2026-10-25: orari locali costanti → mediana costante', () => {
    const nights: Night[] = [
      night('2026-10-21', '00:15', '07:30', 2),
      night('2026-10-22', '00:15', '07:30', 2),
      night('2026-10-23', '00:15', '07:30', 2),
      night('2026-10-24', '00:15', '07:30', 2),
      {
        // letto 00:15 CEST (22:15Z del 24), sveglia 07:30 CET (06:30Z del 25)
        ...night('2026-10-25', '00:15', '07:30', 2),
        bedAt: { value: at('2026-10-25', '00:15', 2), provenance: 'confermato' },
        wakeAt: { value: at('2026-10-25', '07:30', 1), provenance: 'confermato' },
      },
      night('2026-10-26', '00:15', '07:30', 1),
      night('2026-10-27', '00:15', '07:30', 1),
    ];
    expect(nights[4]?.bedAt.value).toBe('2026-10-24T22:15:00.000Z');
    expect(nights[4]?.wakeAt.value).toBe('2026-10-25T06:30:00.000Z');
    const r = computeBaseline(nights, '2026-10-28');
    expect(r.coverage).toEqual({ used: 7, window: 14 });
    expect(r.value).toEqual({ bedMin: 375, wakeMin: 450 }); // 00:15 → 375; 07:30 → 450
  });

  it('notte del cambio 2026-10-25 con letto nell\'ora ripetuta (02:30 CET, seconda occorrenza)', () => {
    const nights: Night[] = [
      ...[21, 22, 23, 24].map((d) => night(`2026-10-${d}`, '02:30', '09:00', 2)),
      {
        ...night('2026-10-25', '02:30', '09:00', 1),
        bedAt: { value: at('2026-10-25', '02:30', 1), provenance: 'confermato' }, // 01:30Z
        wakeAt: { value: at('2026-10-25', '09:00', 1), provenance: 'confermato' },
      },
    ];
    const r = computeBaseline(nights, '2026-10-26');
    expect(r.coverage.used).toBe(5);
    expect(r.value).toEqual({ bedMin: 510, wakeMin: 540 }); // 02:30 → 510; 09:00 → 540
  });

  it('finestra di calendario corretta attraverso i cambi d\'ora (14 giorni esatti)', () => {
    // asOf 2026-04-05 → finestra 2026-03-22 … 2026-04-04
    const inside = ['2026-03-22', '2026-03-28', '2026-03-29', '2026-03-30', '2026-04-04'];
    const nights = [
      ...inside.map((d) => night(d, '23:00', '07:00', d < '2026-03-29' ? 1 : 2)),
      night('2026-03-21', '23:00', '07:00', 1), // fuori
      night('2026-04-05', '23:00', '07:00', 2), // asOf: fuori
    ];
    // qui conta solo l'appartenenza alla finestra (il letto della notte del cambio è approssimato)
    const r = computeBaseline(nights, '2026-04-05');
    expect(r.coverage.used).toBe(5);
    expect(r.value?.wakeMin).toBe(420);

    const asOfAutunno = '2026-11-01'; // finestra 2026-10-18 … 2026-10-31
    const autunno = ['2026-10-18', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-31'].map((d) =>
      night(d, '23:00', '07:00', d < '2026-10-25' ? 2 : 1),
    );
    const r2 = computeBaseline([...autunno, night('2026-10-17', '23:00', '07:00', 2)], asOfAutunno);
    expect(r2.coverage.used).toBe(5);
    expect(r2.value?.wakeMin).toBe(420);
  });
});
