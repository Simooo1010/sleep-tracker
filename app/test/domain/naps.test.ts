import { describe, expect, it } from 'vitest';
import {
  hasPlaceholderStart,
  localNoonIso,
  napFromCheck,
  napsFromEvents,
  napStats,
} from '../../src/domain/naps';
import type { EveningCheck, Nap, Night, Provenance, Score, SignalEvent } from '../../src/domain/types';
import { addDays, localParts } from '../../src/domain/time';

const ev = (type: SignalEvent['type'], ts: string, source: SignalEvent['source'] = 'comandi'): SignalEvent => ({
  type,
  ts,
  source,
});

const check = (date: string, value: number | null, provenance: Provenance = 'confermato'): EveningCheck => ({
  date,
  tiredness: { value: null, provenance: 'mancante' },
  mood: { value: null, provenance: 'mancante' },
  factors: [],
  napMinutesToday: { value, provenance },
});

/** Notte con letto alle hh:mm UTC della sera prima (in ottobre/luglio CEST = UTC+2). */
function night(
  nightDate: string,
  opts: { bedUtc?: string | null; energy?: Score | null; isException?: boolean; status?: Night['status'] } = {},
): Night {
  const bed = opts.bedUtc === undefined ? `${addDays(nightDate, -1)}T21:00:00Z` : opts.bedUtc;
  return {
    nightDate,
    bedAt: { value: bed, provenance: bed === null ? 'mancante' : 'confermato' },
    wakeAt: { value: `${nightDate}T05:30:00Z`, provenance: 'confermato' },
    status: opts.status ?? 'confermata',
    quality: { value: null, provenance: 'mancante' },
    energy: { value: opts.energy ?? null, provenance: opts.energy == null ? 'mancante' : 'confermato' },
    isException: opts.isException ?? false,
    factors: [],
  };
}

const nap = (date: string, startAt: string, minutes: number, provenance: Provenance = 'automatico'): Nap => ({
  date,
  startAt,
  minutes,
  provenance,
});

describe('napsFromEvents', () => {
  it('input vuoto → nessun sonnellino', () => {
    expect(napsFromEvents([])).toEqual([]);
  });

  it('accoppia inizio e fine dello stesso giorno locale', () => {
    const naps = napsFromEvents([ev('nap_start', '2026-07-10T12:00:00Z'), ev('nap_end', '2026-07-10T12:35:00Z')]);
    expect(naps).toEqual([{ date: '2026-07-10', startAt: '2026-07-10T12:00:00Z', minutes: 35, provenance: 'automatico' }]);
  });

  it('ignora eventi non di sonnellino e ordina input disordinato', () => {
    const naps = napsFromEvents([
      ev('nap_end', '2026-07-11T13:30:00Z'),
      ev('wake', '2026-07-11T05:00:00Z'),
      ev('nap_end', '2026-07-10T12:20:00Z'),
      ev('app_open', '2026-07-10T12:10:00Z'),
      ev('nap_start', '2026-07-11T13:00:00Z'),
      ev('nap_start', '2026-07-10T12:00:00Z'),
    ]);
    expect(naps.map((n) => [n.date, n.minutes])).toEqual([
      ['2026-07-10', 20],
      ['2026-07-11', 30],
    ]);
  });

  it('nap_start senza fine → nessun sonnellino (non inventa durate)', () => {
    expect(napsFromEvents([ev('nap_start', '2026-07-10T12:00:00Z')])).toEqual([]);
  });

  it('due inizi consecutivi: il primo viene scartato, il secondo si accoppia', () => {
    const naps = napsFromEvents([
      ev('nap_start', '2026-07-10T11:00:00Z'),
      ev('nap_start', '2026-07-10T12:00:00Z'),
      ev('nap_end', '2026-07-10T12:30:00Z'),
    ]);
    expect(naps).toHaveLength(1);
    expect(naps[0]!.startAt).toBe('2026-07-10T12:00:00Z');
    expect(naps[0]!.minutes).toBe(30);
  });

  it('nap_end senza inizio → ignorato; anche una seconda fine consecutiva', () => {
    expect(napsFromEvents([ev('nap_end', '2026-07-10T12:30:00Z')])).toEqual([]);
    const naps = napsFromEvents([
      ev('nap_start', '2026-07-10T12:00:00Z'),
      ev('nap_end', '2026-07-10T12:30:00Z'),
      ev('nap_end', '2026-07-10T12:50:00Z'),
    ]);
    expect(naps.map((n) => n.minutes)).toEqual([30]);
  });

  it('due sonnellini nello stesso giorno', () => {
    const naps = napsFromEvents([
      ev('nap_start', '2026-07-10T09:00:00Z'),
      ev('nap_end', '2026-07-10T09:20:00Z'),
      ev('nap_start', '2026-07-10T14:00:00Z'),
      ev('nap_end', '2026-07-10T14:45:00Z'),
    ]);
    expect(naps.map((n) => n.minutes)).toEqual([20, 45]);
  });

  it('inizio e fine in giorni locali diversi (a cavallo di mezzanotte) → scartati', () => {
    // 23:50 CEST del 10 → 00:20 CEST dell'11
    const naps = napsFromEvents([ev('nap_start', '2026-07-10T21:50:00Z'), ev('nap_end', '2026-07-10T22:20:00Z')]);
    expect(naps).toEqual([]);
  });

  it('la fine di un giorno diverso consuma l\'inizio: un nuovo inizio successivo riparte pulito', () => {
    const naps = napsFromEvents([
      ev('nap_start', '2026-07-10T12:00:00Z'),
      ev('nap_end', '2026-07-11T12:30:00Z'),
      ev('nap_start', '2026-07-11T13:00:00Z'),
      ev('nap_end', '2026-07-11T13:40:00Z'),
    ]);
    expect(naps.map((n) => [n.date, n.minutes])).toEqual([['2026-07-11', 40]]);
  });

  it('usa la data locale, non quella UTC', () => {
    // 2026-07-10T22:10Z = 00:10 CEST dell'11
    const naps = napsFromEvents([ev('nap_start', '2026-07-10T22:10:00Z'), ev('nap_end', '2026-07-10T22:40:00Z')]);
    expect(naps[0]!.date).toBe('2026-07-11');
  });

  it('soglie di rumore: <5 e >240 scartati, 5 e 240 inclusi', () => {
    const mk = (startMin: number, minutes: number) => {
      const s = new Date(Date.UTC(2026, 6, 10, 6, startMin));
      const e = new Date(s.getTime() + minutes * 60000);
      return [ev('nap_start', s.toISOString()), ev('nap_end', e.toISOString())];
    };
    expect(napsFromEvents(mk(0, 4))).toEqual([]);
    expect(napsFromEvents(mk(0, 5)).map((n) => n.minutes)).toEqual([5]);
    expect(napsFromEvents(mk(0, 240)).map((n) => n.minutes)).toEqual([240]);
    expect(napsFromEvents(mk(0, 241))).toEqual([]);
    expect(napsFromEvents(mk(0, 0))).toEqual([]);
  });

  it('ignora eventi con ts non valido senza lanciare', () => {
    const naps = napsFromEvents([
      ev('nap_start', 'non-una-data'),
      ev('nap_start', '2026-07-10T12:00:00Z'),
      ev('nap_end', 'boh'),
      ev('nap_end', '2026-07-10T12:30:00Z'),
    ]);
    expect(naps.map((n) => n.minutes)).toEqual([30]);
  });

  it('provenienza sempre automatico, anche da sorgente app o stima', () => {
    const naps = napsFromEvents([ev('nap_start', '2026-07-10T12:00:00Z', 'app'), ev('nap_end', '2026-07-10T12:30:00Z', 'stima')]);
    expect(naps[0]!.provenance).toBe('automatico');
  });

  it('cambio ora legale 2026-03-29: durata reale e data locale corrette', () => {
    // 01:30 CET → 03:30 CEST = 60 minuti reali, stesso giorno locale
    const dst = napsFromEvents([ev('nap_start', '2026-03-29T00:30:00Z'), ev('nap_end', '2026-03-29T01:30:00Z')]);
    expect(dst).toEqual([{ date: '2026-03-29', startAt: '2026-03-29T00:30:00Z', minutes: 60, provenance: 'automatico' }]);
    // pomeriggio del 29 (CEST, UTC+2): 14:00 locali = 12:00Z
    const pm = napsFromEvents([ev('nap_start', '2026-03-29T12:00:00Z'), ev('nap_end', '2026-03-29T12:30:00Z')]);
    expect(localParts(pm[0]!.startAt).minutes).toBe(14 * 60);
  });

  it('cambio ora solare 2026-10-25: 02:30 CEST → 02:30 CET = 60 minuti', () => {
    const naps = napsFromEvents([ev('nap_start', '2026-10-25T00:30:00Z'), ev('nap_end', '2026-10-25T01:30:00Z')]);
    expect(naps).toEqual([{ date: '2026-10-25', startAt: '2026-10-25T00:30:00Z', minutes: 60, provenance: 'automatico' }]);
  });

  it('inizio e fine allo stesso istante → 0 min, scartato', () => {
    expect(napsFromEvents([ev('nap_end', '2026-07-10T12:00:00Z'), ev('nap_start', '2026-07-10T12:00:00Z')])).toEqual([]);
  });
});

describe('localNoonIso', () => {
  it('mezzogiorno locale in ora solare e legale, inclusi i giorni di cambio', () => {
    expect(localNoonIso('2026-01-15')).toBe('2026-01-15T11:00:00.000Z');
    expect(localNoonIso('2026-07-15')).toBe('2026-07-15T10:00:00.000Z');
    expect(localNoonIso('2026-03-28')).toBe('2026-03-28T11:00:00.000Z');
    expect(localNoonIso('2026-03-29')).toBe('2026-03-29T10:00:00.000Z');
    expect(localNoonIso('2026-10-24')).toBe('2026-10-24T10:00:00.000Z');
    expect(localNoonIso('2026-10-25')).toBe('2026-10-25T11:00:00.000Z');
  });

  it('data non valida → null', () => {
    expect(localNoonIso('')).toBeNull();
    expect(localNoonIso('2026-13-01')).toBeNull();
    expect(localNoonIso('2026-02-30')).toBeNull();
    expect(localNoonIso('ieri')).toBeNull();
  });
});

describe('napFromCheck', () => {
  it('valore > 0 confermato → Nap confermato a mezzogiorno locale', () => {
    const n = napFromCheck(check('2026-07-10', 30));
    expect(n).toEqual({ date: '2026-07-10', startAt: '2026-07-10T10:00:00.000Z', minutes: 30, provenance: 'confermato' });
    expect(localParts(n!.startAt)).toMatchObject({ date: '2026-07-10', minutes: 720 });
  });

  it('provenienza stimato resta stimato; automatico diventa confermato', () => {
    expect(napFromCheck(check('2026-07-10', 15, 'stimato'))!.provenance).toBe('stimato');
    expect(napFromCheck(check('2026-07-10', 15, 'automatico'))!.provenance).toBe('confermato');
  });

  it('nessuno (0), mancante (null), negativo, NaN o provenienza mancante → null', () => {
    expect(napFromCheck(check('2026-07-10', 0))).toBeNull();
    expect(napFromCheck(check('2026-07-10', null, 'mancante'))).toBeNull();
    expect(napFromCheck(check('2026-07-10', -10))).toBeNull();
    expect(napFromCheck(check('2026-07-10', Number.NaN))).toBeNull();
    expect(napFromCheck(check('2026-07-10', 30, 'mancante'))).toBeNull();
  });

  it('data non valida → null', () => {
    expect(napFromCheck(check('2026-02-30', 30))).toBeNull();
  });

  it('giorni di cambio ora: il segnaposto resta alle 12:00 locali', () => {
    for (const d of ['2026-03-29', '2026-10-25']) {
      const n = napFromCheck(check(d, 60))!;
      expect(localParts(n.startAt)).toMatchObject({ date: d, minutes: 720 });
    }
  });

  it('nessun filtro di rumore sul valore dichiarato (es. 300 min)', () => {
    expect(napFromCheck(check('2026-07-10', 300))!.minutes).toBe(300);
  });

  it('hasPlaceholderStart distingue il segnaposto da un orario reale', () => {
    expect(hasPlaceholderStart(napFromCheck(check('2026-07-10', 30))!)).toBe(true);
    // un sonnellino automatico iniziato proprio a mezzogiorno non è un segnaposto
    expect(hasPlaceholderStart(nap('2026-07-10', '2026-07-10T10:00:00.000Z', 30))).toBe(false);
  });
});

describe('napStats', () => {
  const AS_OF = '2026-10-20';
  /** n notti consecutive che terminano ad AS_OF. */
  const nightsUntil = (asOf: string, count: number, f: (d: string, i: number) => Partial<Parameters<typeof night>[1]> = () => ({})) =>
    Array.from({ length: count }, (_, i) => {
      const d = addDays(asOf, -(count - 1 - i));
      return night(d, f(d, i));
    });

  it('input vuoto: tutto nascosto con motivo, nessun errore', () => {
    const s = napStats([], [], AS_OF);
    expect(s.frequency).toEqual({ value: null, coverage: { used: 0, window: 14 }, hiddenReason: 'Nessun dato negli ultimi 14 giorni.' });
    expect(s.avgMinutes.value).toBeNull();
    expect(s.avgMinutes.hiddenReason).toMatch(/Nessun sonnellino/);
    expect(s.typicalStartMin.value).toBeNull();
    expect(s.effectOnBedtime).toEqual({
      value: null,
      coverage: { used: 0, window: 0 },
      hiddenReason: 'Servono almeno 14 notti. Per ora ne hai 0.',
    });
    expect(s.effectOnEnergy.value).toBeNull();
  });

  describe('frequenza', () => {
    it('conta giorni (non sonnellini) nella finestra asOf−13 … asOf', () => {
      const naps = [
        nap('2026-10-20', '2026-10-20T12:00:00Z', 30), // asOf incluso
        nap('2026-10-15', '2026-10-15T07:00:00Z', 20),
        nap('2026-10-15', '2026-10-15T13:00:00Z', 40), // stesso giorno: conta 1
        nap('2026-10-07', '2026-10-07T12:00:00Z', 30), // asOf−13 incluso
        nap('2026-10-06', '2026-10-06T12:00:00Z', 30), // fuori finestra
        nap('2026-10-21', '2026-10-21T12:00:00Z', 30), // futuro rispetto ad asOf
      ];
      const s = napStats(naps, nightsUntil(AS_OF, 14), AS_OF);
      expect(s.frequency.value).toEqual({ days: 3, of: 14 });
      expect(s.frequency.coverage).toEqual({ used: 14, window: 14 });
    });

    it('copertura = giorni osservati; giorni senza dati non contano come osservati', () => {
      // solo 3 notti registrate: 2026-10-18,19,20 → giorni osservati 17,18,19,20 (D+1 o D) = 4
      const s = napStats([], nightsUntil(AS_OF, 3), AS_OF);
      expect(s.frequency.value).toEqual({ days: 0, of: 14 });
      expect(s.frequency.coverage).toEqual({ used: 4, window: 14 });
    });

    it('notti mancanti non rendono osservato un giorno; un sonnellino sì', () => {
      const nights = [night('2026-10-10', { status: 'mancante', bedUtc: null })];
      const s = napStats([nap('2026-10-12', '2026-10-12T12:00:00Z', 30)], nights, AS_OF);
      expect(s.frequency.coverage.used).toBe(1);
      expect(s.frequency.value).toEqual({ days: 1, of: 14 });
    });

    it('scarta sonnellini con durata non valida', () => {
      const s = napStats([nap('2026-10-12', '2026-10-12T12:00:00Z', 0), nap('2026-10-13', 'x', 30)], [], AS_OF);
      expect(s.frequency.value).toBeNull();
      expect(s.avgMinutes.value).toBeNull();
    });
  });

  describe('durata media e orario tipico', () => {
    it('media per sonnellino e mediana dell\'orario locale di inizio', () => {
      const naps = [
        nap('2026-10-14', '2026-10-14T12:00:00Z', 20), // 14:00 CEST
        nap('2026-10-15', '2026-10-15T13:00:00Z', 30), // 15:00 CEST
        nap('2026-10-16', '2026-10-16T13:30:00Z', 45), // 15:30 CEST
      ];
      const s = napStats(naps, [], AS_OF);
      expect(s.avgMinutes).toEqual({ value: 32, coverage: { used: 3, window: 14 } }); // 31.67 → 32
      expect(s.typicalStartMin).toEqual({ value: 15 * 60, coverage: { used: 3, window: 14 } });
    });

    it('i sonnellini dal check contano per durata ma non per l\'orario tipico', () => {
      const naps = [napFromCheck(check('2026-10-14', 30))!, napFromCheck(check('2026-10-15', 60))!];
      const s = napStats(naps, [], AS_OF);
      expect(s.avgMinutes.value).toBe(45);
      expect(s.typicalStartMin.value).toBeNull();
      expect(s.typicalStartMin.hiddenReason).toMatch(/check serale/);
      expect(s.typicalStartMin.coverage.used).toBe(0);
    });

    it('stesso giorno da segnali e da check: il check è un doppione e viene scartato', () => {
      const naps = [nap('2026-10-14', '2026-10-14T12:00:00Z', 20), napFromCheck(check('2026-10-14', 30))!];
      const s = napStats(naps, [], AS_OF);
      expect(s.avgMinutes.value).toBe(20);
      expect(s.frequency.value).toEqual({ days: 1, of: 14 });
    });

    it('orario tipico corretto a cavallo del cambio ora (fine finestra dopo il 2026-10-25)', () => {
      const naps = [
        nap('2026-10-24', '2026-10-24T13:00:00Z', 30), // 15:00 CEST
        nap('2026-10-26', '2026-10-26T14:00:00Z', 30), // 15:00 CET
      ];
      const s = napStats(naps, [], '2026-10-27');
      expect(s.typicalStartMin.value).toBe(15 * 60);
    });
  });

  describe('effetti', () => {
    /**
     * 20 notti fino ad AS_OF. Giorni con sonnellino: quelli prima delle notti in `napNights`.
     * Notti dopo sonnellino: letto 00:30 CEST (22:30Z) energia 2; altre: letto 23:00 CEST (21:00Z) energia 4.
     */
    function scenario(napNightIdx: number[], count = 20) {
      const nights = nightsUntil(AS_OF, count, (d, i) =>
        napNightIdx.includes(i)
          ? { bedUtc: `${addDays(d, -1)}T22:30:00Z`, energy: 2 as Score }
          : { bedUtc: `${addDays(d, -1)}T21:00:00Z`, energy: 4 as Score },
      );
      const naps = napNightIdx.map((i) => {
        const day = addDays(nights[i]!.nightDate, -1);
        return nap(day, `${day}T13:00:00Z`, 30);
      });
      return { nights, naps };
    }

    it('notte dopo sonnellino (a cavallo di mezzanotte) vs senza: +90 min e −2 energia', () => {
      const { nights, naps } = scenario([3, 8, 12, 17]);
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnBedtime).toEqual({ value: 90, coverage: { used: 20, window: 20 } });
      expect(s.effectOnEnergy).toEqual({ value: -2, coverage: { used: 20, window: 20 } });
    });

    it('la notte D+1 segue il giorno D (non la notte D)', () => {
      const nights = nightsUntil(AS_OF, 14, () => ({ energy: 3 as Score }));
      // sonnellino nel giorno D = nightDate della notte i → influenza la notte i+1 (nightDate D+1)
      const naps = [1, 5, 9].map((i) => {
        const d = nights[i]!.nightDate;
        return nap(d, `${d}T13:00:00Z`, 30);
      });
      const shifted = nights.map((n, i) =>
        [2, 6, 10].includes(i) ? { ...n, energy: { value: 5 as Score, provenance: 'confermato' as const } } : n,
      );
      const s = napStats(naps, shifted, AS_OF);
      expect(s.effectOnEnergy.value).toBe(2); // 5 − 3
    });

    it('sotto 14 notti: nascosto con "Servono almeno 14 notti"', () => {
      const { nights, naps } = scenario([2, 6, 10], 13);
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnBedtime).toEqual({
        value: null,
        coverage: { used: 13, window: 13 },
        hiddenReason: 'Servono almeno 14 notti. Per ora ne hai 13.',
      });
    });

    it('esattamente 14 notti e 3 giorni con sonnellino: visibile', () => {
      const { nights, naps } = scenario([2, 6, 10], 14);
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnBedtime.value).toBe(90);
      expect(s.effectOnEnergy.value).toBe(-2);
    });

    it('solo 2 giorni con sonnellino: nascosto', () => {
      const { nights, naps } = scenario([2, 6], 20);
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnBedtime.value).toBeNull();
      expect(s.effectOnBedtime.hiddenReason).toBe('Servono almeno 3 giorni con sonnellino. Per ora ne hai 2.');
    });

    it('tutte le notti dopo sonnellino: nessun confronto possibile', () => {
      const idx = Array.from({ length: 14 }, (_, i) => i);
      const { nights, naps } = scenario(idx, 14);
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnEnergy.value).toBeNull();
      expect(s.effectOnEnergy.hiddenReason).toMatch(/senza sonnellino/);
    });

    it('notti-eccezione escluse dal calcolo ma contate nella finestra di copertura', () => {
      const { nights, naps } = scenario([3, 8, 12, 17]);
      // le eccezioni avrebbero valori estremi
      const withExc = nights.map((n, i) =>
        i === 0 || i === 1
          ? { ...n, isException: true, bedAt: { value: `${addDays(n.nightDate, -1)}T16:30:00Z`, provenance: 'confermato' as const } }
          : n,
      );
      const s = napStats(naps, withExc, AS_OF);
      expect(s.effectOnBedtime).toEqual({ value: 90, coverage: { used: 18, window: 20 } });
    });

    it('le eccezioni possono far scendere sotto soglia', () => {
      const { nights, naps } = scenario([3, 8, 12], 14);
      nights[0] = { ...nights[0]!, isException: true };
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnBedtime.hiddenReason).toBe('Servono almeno 14 notti. Per ora ne hai 13.');
    });

    it('dati mancanti per metrica: letto mancante ed energia mancante contati separatamente', () => {
      const { nights, naps } = scenario([3, 8, 12, 17]);
      // 6 notti senza energia, 2 senza letto
      const patched = nights.map((n, i) => {
        let m = n;
        if (i >= 14) m = { ...m, energy: { value: null, provenance: 'mancante' as const } };
        if (i === 0 || i === 1) m = { ...m, bedAt: { value: null, provenance: 'mancante' as const } };
        return m;
      });
      const s = napStats(naps, patched, AS_OF);
      expect(s.effectOnBedtime.coverage).toEqual({ used: 18, window: 20 });
      expect(s.effectOnBedtime.value).toBe(90);
      expect(s.effectOnEnergy.coverage).toEqual({ used: 14, window: 20 });
      expect(s.effectOnEnergy.value).toBe(-2); // notti 3, 8, 12 con sonnellino
    });

    it('ignora le notti successive ad asOfNightDate', () => {
      const { nights, naps } = scenario([3, 8, 12, 17]);
      const s = napStats(naps, nights, addDays(AS_OF, -7)); // 13 notti ≤ asOf
      expect(s.effectOnBedtime.coverage).toEqual({ used: 13, window: 13 });
      expect(s.effectOnBedtime.value).toBeNull();
    });

    it('mediana robusta: una sola notte anomala non sposta l\'effetto sul letto', () => {
      const { nights, naps } = scenario([3, 8, 12, 17]);
      nights[5] = { ...nights[5]!, bedAt: { value: `${addDays(nights[5]!.nightDate, 0)}T02:00:00Z`, provenance: 'confermato' } };
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnBedtime.value).toBe(90);
    });

    it('sonnellini dal check valgono per gli effetti', () => {
      const { nights } = scenario([3, 8, 12, 17]);
      const naps = [3, 8, 12, 17].map((i) => napFromCheck(check(addDays(nights[i]!.nightDate, -1), 30))!);
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnBedtime.value).toBe(90);
    });

    it('notti attraverso il cambio ora solare 2026-10-25: asse del letto coerente', () => {
      const asOf = '2026-11-01';
      // 23:00 locali sempre: 21:00Z in CEST (sere fino al 24), 22:00Z in CET (dalla sera del 25)
      const nights = nightsUntil(asOf, 20, (d) => {
        const eve = addDays(d, -1);
        const utcH = eve <= '2026-10-24' ? 21 : 22;
        return { bedUtc: `${eve}T${utcH}:00:00Z`, energy: 3 as Score };
      });
      // notti dopo sonnellino: letto 23:40 locali
      const napIdx = [4, 9, 13, 18];
      for (const i of napIdx) {
        const eve = addDays(nights[i]!.nightDate, -1);
        const utcH = eve <= '2026-10-24' ? 21 : 22;
        nights[i] = { ...nights[i]!, bedAt: { value: `${eve}T${utcH}:40:00Z`, provenance: 'confermato' } };
      }
      const naps = napIdx.map((i) => {
        const day = addDays(nights[i]!.nightDate, -1);
        return nap(day, `${day}T13:00:00Z`, 30);
      });
      const s = napStats(naps, nights, asOf);
      expect(s.effectOnBedtime.value).toBe(40);
      expect(s.effectOnEnergy.value).toBe(0);
    });

    it('notti attraverso il cambio ora legale 2026-03-29', () => {
      const asOf = '2026-04-05';
      const nights = nightsUntil(asOf, 14, (d) => {
        const eve = addDays(d, -1);
        const utcH = eve < '2026-03-29' ? 22 : 21; // 23:00 locali
        return { bedUtc: `${eve}T${utcH}:00:00Z`, energy: 4 as Score };
      });
      const napIdx = [2, 6, 10];
      for (const i of napIdx) {
        nights[i] = { ...nights[i]!, energy: { value: 3, provenance: 'confermato' } };
      }
      const naps = napIdx.map((i) => {
        const day = addDays(nights[i]!.nightDate, -1);
        return nap(day, `${day}T12:00:00Z`, 30);
      });
      const s = napStats(naps, nights, asOf);
      expect(s.effectOnBedtime.value).toBe(0);
      expect(s.effectOnEnergy.value).toBe(-1);
    });

    it('energia arrotondata a 2 decimali', () => {
      const nights = nightsUntil(AS_OF, 14, (_d, i) => ({ energy: (i === 2 ? 5 : i === 6 || i === 10 ? 4 : 3) as Score }));
      const naps = [2, 6, 10].map((i) => {
        const day = addDays(nights[i]!.nightDate, -1);
        return nap(day, `${day}T13:00:00Z`, 30);
      });
      const s = napStats(naps, nights, AS_OF);
      expect(s.effectOnEnergy.value).toBe(1.33); // 4.333 − 3
    });
  });
});
