import { describe, expect, it, vi } from 'vitest';
import { addDays, bedAxisMinutes, durationMinutes, hasTimes, isWeekendNight, localParts, median, nightDateOf } from '../../src/domain/time';
import type { Night } from '../../src/domain/types';
import { MemoryRepo } from '../../src/server/memory-repo';
import {
  DEMO_DAYS,
  DEMO_EXCEPTION_SLUGS,
  DEMO_NOW,
  buildDemoSeed,
  demoNightExceptions,
} from '../../src/server/seed';
import { generateToken, hashToken } from '../../src/server/token';
import {
  buildChartsView,
  buildHistoryView,
  buildNightView,
  buildRegularityView,
  buildSignalsView,
} from '../../src/server/views';
import { expectClean, expectSerializable } from './views/fixtures';

const TODAY = '2026-10-24';
const seed = buildDemoSeed(DEMO_NOW);
const nights = seed.nights as Night[];
const naps = seed.naps ?? [];
const checks = seed.checks ?? [];
const events = seed.events ?? [];

const timed = nights.filter(hasTimes);
const confirmed = nights.filter((n) => n.status === 'confermata');
const meanOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('buildDemoSeed: determinismo e forma', () => {
  it('due chiamate identiche danno lo stesso oggetto', () => {
    expect(buildDemoSeed(DEMO_NOW)).toStrictEqual(buildDemoSeed(DEMO_NOW));
  });

  it('lo stesso istante in UTC dà lo stesso dataset', () => {
    expect(buildDemoSeed('2026-10-24T06:30:00.000Z')).toStrictEqual(seed);
  });

  it('rifiuta un istante non valido', () => {
    expect(() => buildDemoSeed('boh')).toThrow();
  });

  it('è serializzabile e senza NaN/undefined', () => {
    expectSerializable(seed);
    expect(JSON.stringify(seed)).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('settings esplicite con target e fuso', () => {
    expect(seed.settings).toStrictEqual({ target_sleep_minutes: 450, timezone: 'Europe/Rome' });
  });
});

describe('buildDemoSeed: conteggi e copertura', () => {
  it('60 notti consecutive da oggi−59 a oggi', () => {
    expect(DEMO_DAYS).toBe(60);
    expect(nights).toHaveLength(60);
    nights.forEach((n, i) => expect(n.nightDate).toBe(addDays(TODAY, i - 59)));
    expect(nights.at(-1)?.nightDate).toBe(TODAY);
  });

  it('6 mancanti, 10 stimate, 44 confermate, 3 eccezioni', () => {
    expect(nights.filter((n) => n.status === 'mancante')).toHaveLength(6);
    expect(nights.filter((n) => n.status === 'stimata')).toHaveLength(10);
    expect(confirmed).toHaveLength(44);
    expect(nights.filter((n) => n.isException)).toHaveLength(3);
    expect(nights.filter((n) => n.isException).every((n) => n.status === 'confermata')).toBe(true);
  });

  it('le notti mancanti non hanno orari, voti né fattori', () => {
    for (const n of nights.filter((x) => x.status === 'mancante')) {
      expect(n.bedAt).toStrictEqual({ value: null, provenance: 'mancante' });
      expect(n.wakeAt).toStrictEqual({ value: null, provenance: 'mancante' });
      expect(n.quality.value).toBeNull();
      expect(n.energy.value).toBeNull();
      expect(n.factors).toStrictEqual([]);
    }
  });

  it('provenienze: confermata → confermato; stimata → stimato e/o automatico', () => {
    for (const n of confirmed) {
      expect(n.bedAt.provenance).toBe('confermato');
      expect(n.wakeAt.provenance).toBe('confermato');
    }
    for (const n of nights.filter((x) => x.status === 'stimata')) {
      expect(['stimato', 'automatico']).toContain(n.bedAt.provenance);
      expect(['stimato', 'automatico']).toContain(n.wakeAt.provenance);
      expect(n.bedAt.provenance === 'stimato' || n.wakeAt.provenance === 'automatico').toBe(true);
    }
    expect(nights.some((n) => n.status === 'stimata' && n.bedAt.provenance === 'stimato' && n.wakeAt.provenance === 'automatico')).toBe(true);
    expect(nights.some((n) => n.status === 'stimata' && n.bedAt.provenance === 'stimato' && n.wakeAt.provenance === 'stimato')).toBe(true);
  });

  it('copre weekend e feriali, anche tra le notti confermate', () => {
    const weekend = confirmed.filter((n) => isWeekendNight(n.nightDate));
    expect(weekend.length).toBeGreaterThanOrEqual(8);
    expect(confirmed.length - weekend.length).toBeGreaterThanOrEqual(20);
  });

  it('stanotte: stimata, letto e sveglia automatici, voti mancanti', () => {
    const tonight = nights.at(-1) as Night;
    expect(tonight.nightDate).toBe(TODAY);
    expect(tonight.status).toBe('stimata');
    expect(tonight.bedAt.provenance).toBe('automatico');
    expect(tonight.wakeAt.provenance).toBe('automatico');
    expect(tonight.quality).toStrictEqual({ value: null, provenance: 'mancante' });
    expect(tonight.energy).toStrictEqual({ value: null, provenance: 'mancante' });
    // Il risveglio di stanotte è già avvenuto prima di "adesso".
    expect(Date.parse(tonight.wakeAt.value as string)).toBeLessThan(Date.parse(DEMO_NOW));
    const bedEvent = events.find((e) => e.type === 'bedtime_candidate' && e.ts === tonight.bedAt.value);
    const wakeEvent = events.find((e) => e.type === 'wake' && e.ts === tonight.wakeAt.value);
    expect(bedEvent).toBeDefined();
    expect(wakeEvent).toBeDefined();
  });

  it('eccezioni: malattia, viaggio, festa, e mappa per setNightExceptions', () => {
    const exc = nights.filter((n) => n.isException);
    expect(exc.flatMap((n) => n.factors.filter((f) => DEMO_EXCEPTION_SLUGS.includes(f))).sort()).toStrictEqual(['festa', 'malattia', 'viaggio']);
    const map = demoNightExceptions(nights);
    expect(Object.keys(map)).toHaveLength(3);
    expect(Object.values(map).flat().sort()).toStrictEqual(['festa', 'malattia', 'viaggio']);
  });

  it('14 sonnellini di 15–45 minuti nel pomeriggio, mai nel futuro', () => {
    expect(naps).toHaveLength(14);
    for (const p of naps) {
      expect(p.minutes).toBeGreaterThanOrEqual(15);
      expect(p.minutes).toBeLessThanOrEqual(45);
      expect(p.provenance).not.toBe('mancante');
      const { date, minutes } = localParts(p.startAt);
      expect(date).toBe(p.date);
      expect(minutes).toBeGreaterThanOrEqual(13 * 60);
      expect(minutes).toBeLessThan(17 * 60);
      expect(p.date < TODAY).toBe(true);
    }
    expect(new Set(naps.map((p) => `${p.date}|${p.startAt}`)).size).toBe(14);
  });

  it('45 check serali, mai per le notti mancanti, voti 1–5', () => {
    expect(checks).toHaveLength(45);
    expect(new Set(checks.map((c) => c.date)).size).toBe(45);
    const missingEvenings = nights.filter((n) => n.status === 'mancante').map((n) => addDays(n.nightDate, -1));
    for (const c of checks) {
      expect(missingEvenings).not.toContain(c.date);
      for (const v of [c.tiredness.value, c.mood.value]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v as number).toBeGreaterThanOrEqual(1);
        expect(v as number).toBeLessThanOrEqual(5);
      }
      expect(c.napMinutesToday.provenance === 'mancante').toBe(c.napMinutesToday.value === null);
    }
  });
});

describe('buildDemoSeed: coerenza dei dati', () => {
  it('sveglia dopo il letto, durata 4–11 h, nightDate = data del risveglio', () => {
    expect(timed.length).toBe(54);
    for (const n of timed) {
      const bed = n.bedAt.value;
      const wake = n.wakeAt.value;
      expect(Date.parse(wake)).toBeGreaterThan(Date.parse(bed));
      const dur = durationMinutes(bed, wake);
      expect(dur, n.nightDate).toBeGreaterThanOrEqual(240);
      expect(dur, n.nightDate).toBeLessThanOrEqual(660);
      expect(nightDateOf(wake)).toBe(n.nightDate);
      expect(Number.isFinite(Date.parse(bed))).toBe(true);
    }
  });

  it('voti 1–5 interi solo sulle notti confermate; mancanti altrove', () => {
    for (const n of nights) {
      if (n.status === 'confermata') {
        for (const t of [n.quality, n.energy]) {
          expect(Number.isInteger(t.value)).toBe(true);
          expect(t.value as number).toBeGreaterThanOrEqual(1);
          expect(t.value as number).toBeLessThanOrEqual(5);
          expect(t.provenance).toBe('confermato');
        }
      } else {
        expect(n.quality.value).toBeNull();
        expect(n.energy.value).toBeNull();
      }
    }
  });

  it('fattori con frequenze plausibili e solo slug noti', () => {
    const base = nights.filter((n) => n.status !== 'mancante');
    const freq = (slug: string): number => base.filter((n) => n.factors.includes(slug)).length / base.length;
    expect(freq('schermo-a-letto')).toBeGreaterThan(0.2);
    expect(freq('schermo-a-letto')).toBeLessThan(0.5);
    expect(freq('sport')).toBeGreaterThan(0.12);
    expect(freq('sport')).toBeLessThan(0.4);
    expect(freq('giornata-stressante')).toBeGreaterThan(0.08);
    expect(freq('giornata-stressante')).toBeLessThan(0.35);
    expect(freq('cena-tardi')).toBeGreaterThan(0.04);
    expect(freq('cena-tardi')).toBeLessThan(0.3);
    expect(freq('alcol')).toBeGreaterThan(0.02);
    expect(freq('alcol')).toBeLessThan(0.2);
    const known = new Set(['schermo-a-letto', 'sport', 'giornata-stressante', 'cena-tardi', 'alcol', ...DEMO_EXCEPTION_SLUGS]);
    for (const n of nights) for (const f of n.factors) expect(known.has(f)).toBe(true);
  });

  it('qualità più bassa con lo schermo a letto, più alta con lo sport', () => {
    const regular = confirmed.filter((n) => !n.isException);
    const q = (xs: Night[]): number => meanOf(xs.map((n) => n.quality.value as number));
    const withScreen = regular.filter((n) => n.factors.includes('schermo-a-letto'));
    const noScreen = regular.filter((n) => !n.factors.includes('schermo-a-letto'));
    expect(q(withScreen)).toBeLessThan(q(noScreen));
    const withSport = regular.filter((n) => n.factors.includes('sport'));
    const noSport = regular.filter((n) => !n.factors.includes('sport'));
    expect(q(withSport)).toBeGreaterThan(q(noSport));
  });

  it('weekend più tardi dei feriali e deriva del letto nelle ultime settimane', () => {
    const regular = timed.filter((n) => !n.isException);
    const bed = (n: Night): number => bedAxisMinutes(n.bedAt.value as string);
    const weekdays = regular.filter((n) => !isWeekendNight(n.nightDate));
    const weekends = regular.filter((n) => isWeekendNight(n.nightDate));
    // ~23:45 → asse 345; weekend ~00:40 → asse 400.
    expect(median(weekdays.map(bed)) as number).toBeGreaterThan(335);
    expect(median(weekdays.map(bed)) as number).toBeLessThan(385);
    expect((median(weekends.map(bed)) as number) - (median(weekdays.map(bed)) as number)).toBeGreaterThan(35);
    const early = weekdays.filter((n) => n.nightDate < addDays(TODAY, -35)).map(bed);
    const late = weekdays.filter((n) => n.nightDate >= addDays(TODAY, -14)).map(bed);
    expect(meanOf(late) - meanOf(early)).toBeGreaterThan(15);
    // Sveglia feriale ~07:20, weekend ~09:00.
    const wakeMin = (n: Night): number => localParts(n.wakeAt.value as string).minutes;
    expect(Math.abs((median(weekdays.map(wakeMin)) as number) - (7 * 60 + 20))).toBeLessThan(25);
    expect(Math.abs((median(weekends.map(wakeMin)) as number) - 9 * 60)).toBeLessThan(25);
  });
});

describe('buildDemoSeed: eventi grezzi', () => {
  const windowOf = (nightDate: string) =>
    events.filter((e) => {
      const p = localParts(e.ts);
      return p.date === addDays(nightDate, -1) ? p.minutes >= 18 * 60 : p.date === nightDate && p.minutes <= 14 * 60;
    });

  it('chiavi di idempotenza uniche, nessun evento nel futuro, solo le ultime 10 notti', () => {
    expect(new Set(events.map((e) => e.idempotencyKey)).size).toBe(events.length);
    const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    expect(events).toStrictEqual(sorted);
    const from = Date.parse(DEMO_NOW);
    for (const e of events) {
      expect(Date.parse(e.ts)).toBeLessThanOrEqual(from);
      expect(localParts(e.ts).date >= addDays(TODAY, -10)).toBe(true);
    }
    for (const type of ['bedtime_candidate', 'evening_check', 'wake', 'app_open'] as const) {
      expect(events.some((e) => e.type === type)).toBe(true);
    }
  });

  it('due notti con solo app_open e una senza alcun segnale', () => {
    const last10 = nights.slice(-10);
    const onlyAppOpen = last10.filter((n) => {
      const w = windowOf(n.nightDate);
      return w.length === 1 && w[0]?.type === 'app_open';
    });
    expect(onlyAppOpen).toHaveLength(2);
    for (const n of onlyAppOpen) {
      expect(n.status).toBe('stimata');
      expect(windowOf(n.nightDate)[0]?.ts).toBe(n.wakeAt.value);
    }
    const silent = last10.filter((n) => windowOf(n.nightDate).length === 0);
    expect(silent).toHaveLength(1);
    expect(silent[0]?.status).toBe('mancante');
  });

  it('ogni notte confermata delle ultime 10 ha il quartetto coerente con gli orari', () => {
    for (const n of nights.slice(-10).filter((x) => x.status === 'confermata')) {
      const w = windowOf(n.nightDate);
      const byType = (t: string) => w.filter((e) => e.type === t);
      expect(byType('bedtime_candidate').map((e) => e.ts)).toStrictEqual([n.bedAt.value]);
      expect(byType('wake').map((e) => e.ts)).toStrictEqual([n.wakeAt.value]);
      expect(byType('evening_check')).toHaveLength(1);
      expect(Date.parse(byType('evening_check')[0]?.ts as string)).toBeLessThan(Date.parse(n.bedAt.value as string));
      expect(byType('app_open')).toHaveLength(1);
      expect(Date.parse(byType('app_open')[0]?.ts as string)).toBeGreaterThan(Date.parse(n.wakeAt.value as string));
      expect(checks.some((c) => c.date === addDays(n.nightDate, -1))).toBe(true);
    }
  });
});

describe('buildDemoSeed: altri istanti e ora legale', () => {
  it('attraversa il cambio ora del 25 ottobre senza orari impossibili', () => {
    const s = buildDemoSeed('2026-10-26T08:30:00+01:00');
    const ns = s.nights as Night[];
    expect(ns).toHaveLength(60);
    expect(ns.at(-1)?.nightDate).toBe('2026-10-26');
    for (const n of ns.filter(hasTimes)) {
      expect(Date.parse(n.wakeAt.value)).toBeGreaterThan(Date.parse(n.bedAt.value));
      const dur = durationMinutes(n.bedAt.value, n.wakeAt.value);
      expect(dur, n.nightDate).toBeGreaterThanOrEqual(240);
      expect(dur, n.nightDate).toBeLessThanOrEqual(660);
    }
    // La notte tra il 24 e il 25 dura un'ora in più dell'orologio a muro.
    const dst = ns.find((n) => n.nightDate === '2026-10-25') as Night & { bedAt: { value: string }; wakeAt: { value: string } };
    const bed = localParts(dst.bedAt.value as string);
    const wake = localParts(dst.wakeAt.value as string);
    const wall = wake.minutes - bed.minutes + (bed.date === wake.date ? 0 : 1440);
    expect(durationMinutes(dst.bedAt.value as string, dst.wakeAt.value as string)).toBe(wall + 60);
    expectSerializable(s);
  });

  it('un altro giorno sposta il dataset senza rompere il conteggio', () => {
    const s = buildDemoSeed('2026-03-10T08:30:00+01:00');
    expect((s.nights as Night[]).filter((n) => n.status === 'mancante')).toHaveLength(6);
    expect((s.checks ?? []).length).toBe(45);
    expect((s.naps ?? []).length).toBe(14);
  });
});

describe('buildDemoSeed: alimenta MemoryRepo e i view model', () => {
  const repo = new MemoryRepo(seed);

  it('il MemoryRepo accetta il seed e restituisce i dati', async () => {
    expect(repo.nights).toHaveLength(60);
    expect(repo.checks).toHaveLength(45);
    expect(repo.naps).toHaveLength(14);
    expect(repo.events).toHaveLength(events.length);
    expect(await repo.getSetting('target_sleep_minutes')).toBe(450);
    expect(await repo.listNights(addDays(TODAY, -6), TODAY)).toHaveLength(7);
  });

  it('i builder non lanciano e producono viste piene e pulite', () => {
    const night = buildNightView({ today: TODAY, nights, events, naps, eveningChecks: checks });
    const regularity = buildRegularityView({ today: TODAY, nights });
    const charts = buildChartsView({ today: TODAY, nights, naps, eveningChecks: checks });
    const history = buildHistoryView({ today: TODAY, nights, naps });
    const signals = buildSignalsView({ today: TODAY, events, nights, eveningChecks: checks });
    for (const [name, view] of Object.entries({ night, regularity, charts, history, signals })) {
      expect(view.empty, name).toBe(false);
      expectClean(view, name);
      expectSerializable(view);
    }
    expect(night.status).toBe('stimata');
    expect(night.canConfirm).toBe(true);
    expect(night.comparison.hidden).toBe(false);
    expect(signals.log.items.length).toBeGreaterThan(0);
  });

  it('la vista Notte dei mesi precedenti nello storico è piena', () => {
    const prev = buildHistoryView({ today: TODAY, nights, naps, month: '2026-09' });
    expect(prev.empty).toBe(false);
    expectClean(prev);
  });
});

describe('getRepo con APP_SEED=demo', () => {
  const PEPPER = 'pepper-di-prova-per-i-test-0123456789';

  async function load() {
    vi.resetModules();
    return (await import('../../src/server/repo-factory')).getRepo;
  }

  it('carica il dataset demo, le eccezioni e il token di prova', async () => {
    const getRepo = await load();
    const token = generateToken();
    const env = {
      NODE_ENV: 'test',
      APP_DATA_MODE: 'memory',
      APP_SEED: 'demo',
      APP_FIXED_NOW: DEMO_NOW,
      INGEST_TOKEN_PEPPER: PEPPER,
      DEMO_INGEST_TOKEN: token,
    } as unknown as NodeJS.ProcessEnv;
    const repo = getRepo(env) as MemoryRepo;
    expect(repo.nights).toStrictEqual(nights);
    expect(await repo.tokenExists(hashToken(token, PEPPER))).toBe(true);
    expect(await repo.tokenExists(hashToken(generateToken(), PEPPER))).toBe(false);
    expect(Object.values(repo.exceptions).flat().sort()).toStrictEqual(['festa', 'malattia', 'viaggio']);
    expect(getRepo(env)).toBe(repo);
  });

  it('senza APP_SEED il repo in memoria resta vuoto', async () => {
    const getRepo = await load();
    const env = { NODE_ENV: 'test', APP_DATA_MODE: 'memory' } as unknown as NodeJS.ProcessEnv;
    const repo = getRepo(env) as MemoryRepo;
    expect(repo.nights).toHaveLength(0);
  });
});
