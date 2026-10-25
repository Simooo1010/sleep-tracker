import { describe, expect, it } from 'vitest';

import type { EveningCheck } from '../../../src/domain/types';
import { MemoryRepo } from '../../../src/server/memory-repo';
import { loadEveningPage } from '../../../src/server/pages/evening';
import { DEMO_NOW, buildDemoSeed } from '../../../src/server/seed';

const MORNING = new Date(DEMO_NOW); // sabato 24 ottobre 2026, 08:30 a Roma
const EVENING = new Date('2026-10-24T21:30:00+02:00');

const check = (date: string): EveningCheck => ({
  date,
  tiredness: { value: 4, provenance: 'confermato' },
  mood: { value: 5, provenance: 'confermato' },
  factors: ['sport'],
  napMinutesToday: { value: 30, provenance: 'confermato' },
});

describe('loadEveningPage', () => {
  it('con un repo vuoto: nessun check, quattro passi, nessun errore', async () => {
    const { today, tonightNightDate, view } = await loadEveningPage(new MemoryRepo(), MORNING);
    expect(today).toBe('2026-10-24');
    expect(tonightNightDate).toBe('2026-10-24');
    expect(view.empty).toBe(true);
    expect(view.date).toBe('2026-10-24');
    expect(view.steps.map((s) => s.key)).toEqual(['tiredness', 'mood', 'factors', 'nap']);
  });

  it('prima delle 12:00 la notte delle eccezioni è oggi, dalle 12:00 è domani', async () => {
    const repo = new MemoryRepo();
    expect((await loadEveningPage(repo, new Date('2026-10-24T11:59:00+02:00'))).tonightNightDate).toBe('2026-10-24');
    expect((await loadEveningPage(repo, new Date('2026-10-24T12:00:00+02:00'))).tonightNightDate).toBe('2026-10-25');
    expect((await loadEveningPage(repo, EVENING)).tonightNightDate).toBe('2026-10-25');
  });

  it('il confine delle 12:00 segue il fuso Europe/Rome, non UTC', async () => {
    // 10:30 UTC = 12:30 a Roma (ora legale): già sera.
    const { today, tonightNightDate } = await loadEveningPage(new MemoryRepo(), new Date('2026-10-24T10:30:00Z'));
    expect(today).toBe('2026-10-24');
    expect(tonightNightDate).toBe('2026-10-25');
    // 23:30 UTC del 24 = 01:30 del 25 a Roma: oggi è il 25, la notte è quella del 25.
    const late = await loadEveningPage(new MemoryRepo(), new Date('2026-10-24T23:30:00Z'));
    expect(late.today).toBe('2026-10-25');
    expect(late.tonightNightDate).toBe('2026-10-25');
  });

  it('precompila dal check di oggi e ignora quelli di altri giorni', async () => {
    const repo = new MemoryRepo({ checks: [check('2026-10-23'), check('2026-10-24')] });
    const { view } = await loadEveningPage(repo, EVENING);
    expect(view.empty).toBe(false);
    expect(view.saved).toBe(true);
    expect(view.steps[0]?.options.find((o) => o.selected)?.value).toBe('4');
    expect(view.steps[1]?.options.find((o) => o.selected)?.value).toBe('5');
    expect(view.steps[3]?.options.find((o) => o.selected)?.value).toBe('30');

    const other = await loadEveningPage(new MemoryRepo({ checks: [check('2026-10-23')] }), EVENING);
    expect(other.view.empty).toBe(true);
  });

  it('segna le eccezioni attive della notte di stasera, non quelle di altre notti', async () => {
    const repo = new MemoryRepo();
    await repo.setNightExceptions('2026-10-25', ['viaggio']);
    await repo.setNightExceptions('2026-10-24', ['festa']);

    const evening = await loadEveningPage(repo, EVENING);
    const on = evening.view.steps[2]?.exceptions.filter((e) => e.selected).map((e) => e.value);
    expect(on).toEqual(['viaggio']);

    const morning = await loadEveningPage(repo, MORNING);
    const onMorning = morning.view.steps[2]?.exceptions.filter((e) => e.selected).map((e) => e.value);
    expect(onMorning).toEqual(['festa']);
  });

  it('usa i tipi di eccezione del repo (ordinati per uso) e i sonnellini di oggi', async () => {
    const repo = new MemoryRepo(buildDemoSeed(DEMO_NOW));
    const { view } = await loadEveningPage(repo, MORNING);
    expect(view.steps[2]?.exceptions.length).toBeGreaterThan(0);
    expect(view.steps[3]?.options).toHaveLength(5);
    expect(JSON.stringify(view)).not.toMatch(/NaN|undefined/);
  });
});
