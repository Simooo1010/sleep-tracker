import { describe, expect, it } from 'vitest';
import {
  computeSocialJetlag,
  formatDuration,
  sleepMidpointAxisMinutes,
} from '../../src/domain/social-jetlag';
import type { Night, Provenance } from '../../src/domain/types';
import { addDays, isWeekendNight, localParts } from '../../src/domain/time';

/** Istante ISO UTC corrispondente all'ora locale Europe/Rome `hhmm` del giorno `date`. */
function rome(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  for (const off of [2, 1]) {
    const iso = new Date(Date.UTC(y, mo - 1, d, h - off, m)).toISOString();
    const p = localParts(iso);
    if (p.date === date && p.minutes === h * 60 + m) return iso;
  }
  throw new Error(`Ora locale inesistente: ${date} ${hhmm}`);
}

interface NightOpts {
  isException?: boolean;
  status?: Night['status'];
  provenance?: Provenance;
}

/**
 * Notte identificata dalla data del risveglio. Letto ≥ 18:00 → sera precedente, altrimenti dopo mezzanotte.
 * bed/wake null = orario mancante.
 */
function night(nightDate: string, bed: string | null, wake: string | null, opts: NightOpts = {}): Night {
  const prov = opts.provenance ?? 'confermato';
  const bedIso =
    bed === null
      ? null
      : rome(Number(bed.slice(0, 2)) >= 18 ? addDays(nightDate, -1) : nightDate, bed);
  const wakeIso = wake === null ? null : rome(nightDate, wake);
  return {
    nightDate,
    bedAt: { value: bedIso, provenance: bedIso === null ? 'mancante' : prov },
    wakeAt: { value: wakeIso, provenance: wakeIso === null ? 'mancante' : prov },
    status: opts.status ?? (bedIso && wakeIso ? 'confermata' : 'mancante'),
    quality: { value: null, provenance: 'mancante' },
    energy: { value: null, provenance: 'mancante' },
    isException: opts.isException ?? false,
    factors: [],
  };
}

const AS_OF = '2026-10-24'; // sabato
/** Le 28 date di notte che finiscono ad AS_OF (2026-09-27 … 2026-10-24). */
const WINDOW_28 = Array.from({ length: 28 }, (_, i) => addDays(AS_OF, -27 + i));

/** Mese regolare: feriali 23:00→07:00, weekend 01:00→10:00. */
function regularMonth(): Night[] {
  return WINDOW_28.map((d) =>
    isWeekendNight(d) ? night(d, '01:00', '10:00') : night(d, '23:00', '07:00'),
  );
}

describe('sleepMidpointAxisMinutes', () => {
  it('usa l’asse "minuti dalle 18:00" per letto e sveglia', () => {
    // 23:00 → 300, 07:00 → 420+360 = 780 → punto medio 540 (03:00)
    expect(sleepMidpointAxisMinutes(rome('2026-10-13', '23:00'), rome('2026-10-14', '07:00'))).toBe(540);
  });

  it('gestisce il letto dopo mezzanotte (a cavallo di mezzanotte)', () => {
    // 00:40 → 400, 08:20 → 500+360 = 860 → 630
    expect(sleepMidpointAxisMinutes(rome('2026-10-14', '00:40'), rome('2026-10-14', '08:20'))).toBe(630);
  });

  it('letto presto la sera (21:00 → 180)', () => {
    // 21:00 → 180, 05:00 → 300+360 = 660 → 420
    expect(sleepMidpointAxisMinutes(rome('2026-10-13', '21:00'), rome('2026-10-14', '05:00'))).toBe(420);
  });

  it('può restituire mezzi minuti', () => {
    expect(sleepMidpointAxisMinutes(rome('2026-10-13', '23:01'), rome('2026-10-14', '07:00'))).toBe(540.5);
  });

  it('ora legale 2026-03-29: punto medio sull’orologio locale (non sulla durata fisica)', () => {
    const bed = rome('2026-03-28', '23:00'); // CET
    const wake = rome('2026-03-29', '07:00'); // CEST
    expect(bed).toBe('2026-03-28T22:00:00.000Z');
    expect(wake).toBe('2026-03-29T05:00:00.000Z');
    expect(sleepMidpointAxisMinutes(bed, wake)).toBe(540);
  });

  it('ora solare 2026-10-25: punto medio sull’orologio locale', () => {
    const bed = rome('2026-10-24', '23:00'); // CEST
    const wake = rome('2026-10-25', '07:00'); // CET
    expect(bed).toBe('2026-10-24T21:00:00.000Z');
    expect(wake).toBe('2026-10-25T06:00:00.000Z');
    expect(sleepMidpointAxisMinutes(bed, wake)).toBe(540);
  });
});

describe('computeSocialJetlag', () => {
  it('input vuoto → nascosta, copertura 0 su 28', () => {
    const r = computeSocialJetlag([], AS_OF);
    expect(r.value).toBeNull();
    expect(r.coverage).toEqual({ used: 0, window: 28 });
    expect(r.hiddenReason).toBe(
      'Servono almeno 3 notti nel weekend e 5 nei giorni feriali. Per ora ne hai 0 e 0.',
    );
  });

  it('mese regolare: mediane e social jet lag con segno', () => {
    const r = computeSocialJetlag(regularMonth(), AS_OF);
    expect(r.hiddenReason).toBeUndefined();
    expect(r.coverage).toEqual({ used: 28, window: 28 });
    expect(r.value).toEqual({
      weekdayMidMin: 540, // 03:00
      weekendMidMin: 690, // 05:30 = (420 + 960) / 2
      sjlMin: 150,
      weekdayBedMin: 300,
      weekendBedMin: 420,
      weekdayWakeMin: 420,
      weekendWakeMin: 600,
    });
  });

  it('windowDays di default = 28', () => {
    const nights = regularMonth();
    expect(computeSocialJetlag(nights, AS_OF)).toEqual(computeSocialJetlag(nights, AS_OF, 28));
  });

  it('social jet lag negativo se nel weekend si dorme prima', () => {
    const nights = WINDOW_28.map((d) =>
      isWeekendNight(d) ? night(d, '22:00', '06:00') : night(d, '23:30', '07:30'),
    );
    const r = computeSocialJetlag(nights, AS_OF);
    // weekend: (240 + 720)/2 = 480; feriali: (330 + 810)/2 = 570
    expect(r.value?.sjlMin).toBe(-90);
  });

  it('nessuna differenza → 0', () => {
    const nights = WINDOW_28.map((d) => night(d, '23:00', '07:00'));
    expect(computeSocialJetlag(nights, AS_OF).value?.sjlMin).toBe(0);
  });

  it('weekend = notti di venerdì e sabato (nightDate sabato/domenica)', () => {
    // Domenica sera (nightDate lunedì) è feriale; venerdì sera (nightDate sabato) è weekend.
    expect(isWeekendNight('2026-10-17')).toBe(true); // sabato
    expect(isWeekendNight('2026-10-18')).toBe(true); // domenica
    expect(isWeekendNight('2026-10-19')).toBe(false); // lunedì
    expect(isWeekendNight('2026-10-16')).toBe(false); // venerdì
    const r = computeSocialJetlag(regularMonth(), AS_OF);
    // 8 date weekend nella finestra (27/9, 3-4/10, 10-11/10, 17-18/10, 24/10), 20 feriali.
    expect(r.coverage.used).toBe(28);
  });

  describe('soglie di copertura', () => {
    const weekendDates = WINDOW_28.filter(isWeekendNight);
    const weekdayDates = WINDOW_28.filter((d) => !isWeekendNight(d));
    const build = (we: number, wd: number) => [
      ...weekendDates.slice(0, we).map((d) => night(d, '01:00', '10:00')),
      ...weekdayDates.slice(0, wd).map((d) => night(d, '23:00', '07:00')),
    ];

    it('esattamente 3 weekend e 5 feriali → visibile', () => {
      const r = computeSocialJetlag(build(3, 5), AS_OF);
      expect(r.value).not.toBeNull();
      expect(r.hiddenReason).toBeUndefined();
      expect(r.coverage).toEqual({ used: 8, window: 28 });
      expect(r.value?.sjlMin).toBe(150);
    });

    it('2 weekend e 5 feriali → nascosta', () => {
      const r = computeSocialJetlag(build(2, 5), AS_OF);
      expect(r.value).toBeNull();
      expect(r.coverage).toEqual({ used: 7, window: 28 });
      expect(r.hiddenReason).toBe(
        'Servono almeno 3 notti nel weekend e 5 nei giorni feriali. Per ora ne hai 2 e 5.',
      );
    });

    it('3 weekend e 4 feriali → nascosta', () => {
      const r = computeSocialJetlag(build(3, 4), AS_OF);
      expect(r.value).toBeNull();
      expect(r.hiddenReason).toBe(
        'Servono almeno 3 notti nel weekend e 5 nei giorni feriali. Per ora ne hai 3 e 4.',
      );
    });

    it('tanti feriali non compensano weekend insufficienti', () => {
      const r = computeSocialJetlag(build(0, 20), AS_OF);
      expect(r.value).toBeNull();
      expect(r.hiddenReason).toContain('Per ora ne hai 0 e 20.');
    });
  });

  it('esclude le notti-eccezione (anche dal conteggio)', () => {
    const nights = regularMonth().map((n) =>
      isWeekendNight(n.nightDate) && n.nightDate !== '2026-10-24'
        ? { ...n, isException: true }
        : n,
    );
    // Rimane 1 sola notte weekend valida.
    const r = computeSocialJetlag(nights, AS_OF);
    expect(r.value).toBeNull();
    expect(r.coverage.used).toBe(21);
    expect(r.hiddenReason).toContain('Per ora ne hai 1 e 20.');
  });

  it('un’eccezione estrema non sposta il risultato', () => {
    const base = computeSocialJetlag(regularMonth(), AS_OF);
    const withException = [
      ...regularMonth().filter((n) => n.nightDate !== '2026-10-17'),
      night('2026-10-17', '05:00', '14:00', { isException: true }),
    ];
    const r = computeSocialJetlag(withException, AS_OF);
    expect(r.value).toEqual(base.value);
    expect(r.coverage.used).toBe(27);
  });

  it('esclude notti senza orari (letto o sveglia mancanti)', () => {
    const nights = regularMonth().map((n) => {
      if (n.nightDate === '2026-10-17') return night(n.nightDate, null, '10:00');
      if (n.nightDate === '2026-10-18') return night(n.nightDate, '01:00', null);
      if (n.nightDate === '2026-10-19') return night(n.nightDate, null, null, { status: 'mancante' });
      return n;
    });
    const r = computeSocialJetlag(nights, AS_OF);
    expect(r.coverage.used).toBe(25);
    expect(r.value?.sjlMin).toBe(150);
  });

  it('include le notti stimate che hanno orari', () => {
    const nights = regularMonth().map((n) =>
      night(
        n.nightDate,
        isWeekendNight(n.nightDate) ? '01:00' : '23:00',
        isWeekendNight(n.nightDate) ? '10:00' : '07:00',
        { status: 'stimata', provenance: 'stimato' },
      ),
    );
    const r = computeSocialJetlag(nights, AS_OF);
    expect(r.coverage.used).toBe(28);
    expect(r.value?.sjlMin).toBe(150);
  });

  describe('finestra', () => {
    it('esclude notti prima della finestra e dopo la data di riferimento', () => {
      const nights = [
        ...regularMonth(),
        night('2026-09-26', '04:00', '13:00'), // sabato, appena fuori (prima)
        night('2026-09-20', '04:00', '13:00'),
        night('2026-10-25', '04:00', '13:00'), // dopo asOf
        night('2026-10-31', '04:00', '13:00'),
      ];
      const r = computeSocialJetlag(nights, AS_OF);
      expect(r.coverage.used).toBe(28);
      expect(r.value?.weekendMidMin).toBe(690);
    });

    it('il primo giorno della finestra è incluso', () => {
      const weekdayDates = WINDOW_28.filter((d) => !isWeekendNight(d)).slice(0, 5);
      const nights = [
        night('2026-09-27', '01:00', '10:00'), // primo giorno (domenica)
        night('2026-10-03', '01:00', '10:00'),
        night('2026-10-04', '01:00', '10:00'),
        ...weekdayDates.map((d) => night(d, '23:00', '07:00')),
      ];
      const r = computeSocialJetlag(nights, AS_OF);
      expect(r.coverage.used).toBe(8);
      expect(r.value).not.toBeNull();
    });

    it('windowDays personalizzato riduce la finestra e compare nella copertura', () => {
      const r = computeSocialJetlag(regularMonth(), AS_OF, 7);
      // 2026-10-18 … 2026-10-24: 2 notti weekend (18, 24) e 5 feriali → nascosta.
      expect(r.value).toBeNull();
      expect(r.coverage).toEqual({ used: 7, window: 7 });
      expect(r.hiddenReason).toContain('Per ora ne hai 2 e 5.');
    });

    it('windowDays 14 con dati sufficienti', () => {
      const r = computeSocialJetlag(regularMonth(), AS_OF, 14);
      // 2026-10-11 … 2026-10-24: weekend 11, 17, 18, 24 → 4; feriali 10.
      expect(r.coverage).toEqual({ used: 14, window: 14 });
      expect(r.value?.sjlMin).toBe(150);
    });

    it('windowDays 0 → nessuna notte', () => {
      const r = computeSocialJetlag(regularMonth(), AS_OF, 0);
      expect(r.value).toBeNull();
      expect(r.coverage).toEqual({ used: 0, window: 0 });
    });
  });

  it('mediane robuste: un outlier non eccezione sposta poco il risultato', () => {
    const nights = regularMonth().map((n) =>
      n.nightDate === '2026-10-17' ? night(n.nightDate, '05:00', '14:00') : n,
    );
    const r = computeSocialJetlag(nights, AS_OF);
    expect(r.value?.weekendMidMin).toBe(690);
    expect(r.value?.weekendBedMin).toBe(420);
    expect(r.value?.weekendWakeMin).toBe(600);
  });

  it('mediana con numero pari di notti = media dei due centrali', () => {
    const weekdayDates = WINDOW_28.filter((d) => !isWeekendNight(d)).slice(0, 6);
    const nights = [
      night('2026-10-03', '00:00', '08:00'), // mid 600
      night('2026-10-04', '01:00', '09:00'), // mid 660
      night('2026-10-10', '02:00', '10:00'), // mid 720
      night('2026-10-11', '03:00', '11:00'), // mid 780
      ...weekdayDates.map((d, i) => night(d, i < 3 ? '23:00' : '23:30', i < 3 ? '07:00' : '07:30')),
    ];
    const r = computeSocialJetlag(nights, AS_OF);
    expect(r.value?.weekendMidMin).toBe(690);
    expect(r.value?.weekdayMidMin).toBe(555); // (540 + 570) / 2
    expect(r.value?.sjlMin).toBe(135);
    expect(r.value?.weekendBedMin).toBe(450); // (420 + 480) / 2
    expect(r.value?.weekdayWakeMin).toBe(435); // (420 + 450) / 2
  });

  it('notti a cavallo di mezzanotte: letto 23:30 e 00:30 sullo stesso asse continuo', () => {
    const weekendDates = WINDOW_28.filter(isWeekendNight);
    const weekdayDates = WINDOW_28.filter((d) => !isWeekendNight(d));
    const nights = [
      ...weekendDates.map((d) => night(d, '00:30', '08:30')), // 390, 870 → 630
      ...weekdayDates.map((d) => night(d, '23:30', '07:30')), // 330, 810 → 570
    ];
    const r = computeSocialJetlag(nights, AS_OF);
    expect(r.value).toMatchObject({
      weekendBedMin: 390,
      weekdayBedMin: 330,
      weekendWakeMin: 510,
      weekdayWakeMin: 450,
      sjlMin: 60,
    });
  });

  it('ordine delle notti irrilevante', () => {
    const nights = regularMonth();
    expect(computeSocialJetlag([...nights].reverse(), AS_OF)).toEqual(computeSocialJetlag(nights, AS_OF));
  });

  it('non modifica l’input', () => {
    const nights = regularMonth();
    const snapshot = JSON.stringify(nights);
    computeSocialJetlag(nights, AS_OF);
    expect(JSON.stringify(nights)).toBe(snapshot);
  });

  it('cambio ora legale 2026-03-29 nella finestra: orari locali coerenti', () => {
    const asOf = '2026-04-04'; // sabato
    const dates = Array.from({ length: 28 }, (_, i) => addDays(asOf, -27 + i));
    const nights = dates.map((d) =>
      isWeekendNight(d) ? night(d, '00:00', '09:00') : night(d, '23:00', '07:00'),
    );
    const dstNight = nights.find((n) => n.nightDate === '2026-03-29');
    // La notte del cambio dura fisicamente 8 h ma l'orologio segna 00:00 → 09:00.
    expect(dstNight?.bedAt.value).toBe('2026-03-28T23:00:00.000Z');
    expect(dstNight?.wakeAt.value).toBe('2026-03-29T07:00:00.000Z');
    const r = computeSocialJetlag(nights, asOf);
    expect(r.value).toMatchObject({
      weekendBedMin: 360,
      weekendWakeMin: 540,
      weekendMidMin: 630, // (360 + 900) / 2
      weekdayMidMin: 540,
      sjlMin: 90,
    });
  });

  it('cambio ora solare 2026-10-25 nella finestra (anche ora ripetuta 02:30)', () => {
    const asOf = '2026-10-31'; // sabato
    const dates = Array.from({ length: 28 }, (_, i) => addDays(asOf, -27 + i));
    const nights = dates.map((d) =>
      d === '2026-10-25'
        ? night(d, '02:30', '10:30') // 02:30 esiste due volte: l'helper sceglie CEST
        : isWeekendNight(d)
          ? night(d, '01:00', '10:00')
          : night(d, '23:00', '07:00'),
    );
    const r = computeSocialJetlag(nights, asOf);
    expect(r.coverage.used).toBe(28);
    // Weekend: 7 notti a 690 e una a (510 + 990)/2 = 750 → mediana 690.
    expect(r.value?.weekendMidMin).toBe(690);
    expect(r.value?.sjlMin).toBe(150);
    // Prima e dopo il cambio, le 23:00 feriali restano 300 sull'asse.
    expect(r.value?.weekdayBedMin).toBe(300);
    expect(r.value?.weekdayWakeMin).toBe(420);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [5, '5 min'],
    [40, '40 min'],
    [59, '59 min'],
    [60, '1 h 00 min'],
    [65, '1 h 05 min'],
    [150, '2 h 30 min'],
    [600, '10 h 00 min'],
    [64.6, '1 h 05 min'],
    [59.6, '1 h 00 min'],
    [0.4, '0 min'],
    [-0.4, '0 min'],
    [-40, '-40 min'],
    [-65, '-1 h 05 min'],
  ])('%s → %s', (min, out) => {
    expect(formatDuration(min)).toBe(out);
  });

  it('valori non finiti → RangeError', () => {
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
    expect(() => formatDuration(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
