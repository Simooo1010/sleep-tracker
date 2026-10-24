import { describe, expect, it } from 'vitest';
import { signalsHealth } from '../../src/domain/signals-health';
import type { SignalEvent, SignalType } from '../../src/domain/types';

const ev = (type: SignalType, ts: string): SignalEvent => ({ type, ts, source: 'comandi' });
const row = (r: ReturnType<typeof signalsHealth>, t: SignalType) => r.signals.find((s) => s.type === t)!;

describe('signalsHealth', () => {
  it('mostra le cinque righe con le etichette italiane, nell\'ordine', () => {
    const r = signalsHealth([], '2026-10-24', []);
    expect(r.signals.map((s) => [s.type, s.label])).toEqual([
      ['wake', 'Sveglia interrotta'],
      ['bedtime_candidate', 'Riposo attivato'],
      ['evening_check', 'Check serale'],
      ['nap_start', 'Sonnellino rapido'],
      ['app_open', 'Prima apertura al mattino'],
    ]);
  });

  it('mai visto: da configurare, nessuna attesa interrotta, nessun avviso', () => {
    const r = signalsHealth([], '2026-10-24', []);
    for (const s of r.signals) {
      expect(s.status).toBe('da-configurare');
      expect(s.lastSeen).toBeNull();
      expect(s.daysSince).toBeNull();
    }
    expect(r.shouldStopWaiting).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('visto ieri: attivo con daysSince 1 e lastSeen = ultimo evento', () => {
    const r = signalsHealth(
      [ev('wake', '2026-10-20T05:00:00Z'), ev('wake', '2026-10-23T05:10:00Z')],
      '2026-10-24',
      [],
    );
    expect(row(r, 'wake')).toMatchObject({ status: 'attivo', daysSince: 1, lastSeen: '2026-10-23T05:10:00Z' });
    expect(r.warnings).toEqual([]);
  });

  it('2 giorni: ancora attivo; 3 giorni esatti: inattivo, non più atteso e un avviso', () => {
    const two = signalsHealth([ev('wake', '2026-10-22T05:00:00Z')], '2026-10-24', []);
    expect(row(two, 'wake').status).toBe('attivo');
    expect(two.shouldStopWaiting).toEqual([]);

    const r = signalsHealth(
      [ev('wake', '2026-10-21T05:00:00Z'), ev('app_open', '2026-10-24T06:00:00Z')],
      '2026-10-24',
      [],
    );
    expect(row(r, 'wake')).toMatchObject({ status: 'inattivo', daysSince: 3 });
    expect(r.shouldStopWaiting).toEqual(['wake']);
    expect(r.warnings).toEqual([
      { type: 'wake', text: 'La sveglia interrotta non arriva da 3 giorni: userò la prima apertura al mattino come limite.' },
    ]);
  });

  it('avviso già dato: niente secondo avviso, ma il segnale resta non atteso', () => {
    const r = signalsHealth([ev('wake', '2026-10-18T05:00:00Z')], '2026-10-24', ['wake']);
    expect(r.shouldStopWaiting).toEqual(['wake']);
    expect(r.warnings).toEqual([]);
  });

  it('avvisa solo per sveglia e Riposo, non per sonnellino, check serale o apertura app', () => {
    const old = '2026-10-10T12:00:00Z';
    const r = signalsHealth(
      (['wake', 'bedtime_candidate', 'evening_check', 'nap_start', 'nap_end', 'app_open'] as SignalType[]).map((t) =>
        ev(t, old),
      ),
      '2026-10-24',
      [],
    );
    expect(r.shouldStopWaiting).toEqual(['wake', 'bedtime_candidate', 'evening_check', 'nap_start', 'app_open']);
    expect(r.warnings.map((w) => w.type)).toEqual(['wake', 'bedtime_candidate']);
    // Ripieghi non attivi: si dichiara la stima, con tono neutro.
    expect(r.warnings[0]!.text).toBe('La sveglia interrotta non arriva da 14 giorni: stimerò il risveglio dai giorni simili.');
    expect(r.warnings[1]!.text).toBe("Riposo non si attiva da 14 giorni: stimerò l'orario di letto dai giorni simili.");
  });

  it('Riposo inattivo con check serale attivo: usa il check serale', () => {
    const r = signalsHealth(
      [ev('bedtime_candidate', '2026-10-19T21:30:00Z'), ev('evening_check', '2026-10-23T21:00:00Z')],
      '2026-10-24',
      [],
    );
    expect(r.warnings).toEqual([
      { type: 'bedtime_candidate', text: 'Riposo non si attiva da 5 giorni: userò il check serale come orario di letto.' },
    ]);
  });

  it('sonnellino: una sola riga alimentata da nap_start e nap_end', () => {
    const r = signalsHealth(
      [ev('nap_start', '2026-10-15T13:00:00Z'), ev('nap_end', '2026-10-23T13:30:00Z')],
      '2026-10-24',
      [],
    );
    expect(r.signals.filter((s) => s.label === 'Sonnellino rapido')).toHaveLength(1);
    expect(row(r, 'nap_start')).toMatchObject({ status: 'attivo', daysSince: 1, lastSeen: '2026-10-23T13:30:00Z' });
  });

  it('ignora eventi successivi a oggi e timestamp non validi', () => {
    const r = signalsHealth(
      [ev('wake', '2026-10-26T05:00:00Z'), ev('wake', 'non-una-data'), ev('wake', '2026-10-20T05:00:00Z')],
      '2026-10-24',
      [],
    );
    expect(row(r, 'wake')).toMatchObject({ daysSince: 4, lastSeen: '2026-10-20T05:00:00Z' });
  });

  it('ora legale (fine, 25 ottobre): i giorni sono di calendario locale, non UTC', () => {
    // 2026-10-24T22:30Z = 00:30 CEST del 25 ottobre a Roma.
    const r = signalsHealth([ev('bedtime_candidate', '2026-10-24T22:30:00Z')], '2026-10-27', []);
    expect(row(r, 'bedtime_candidate')).toMatchObject({ status: 'attivo', daysSince: 2 });
    const r2 = signalsHealth([ev('bedtime_candidate', '2026-10-24T22:30:00Z')], '2026-10-28', []);
    expect(row(r2, 'bedtime_candidate')).toMatchObject({ status: 'inattivo', daysSince: 3 });
  });

  it('ora legale (inizio, 29 marzo): giorno corto di 23 ore contato come un giorno', () => {
    // 2026-03-28T23:30Z = 00:30 CET del 29 marzo; 2026-03-30T22:30Z = 00:30 CEST del 31 marzo.
    const r = signalsHealth([ev('wake', '2026-03-28T23:30:00Z')], '2026-03-31', []);
    expect(row(r, 'wake')).toMatchObject({ status: 'attivo', daysSince: 2 });
    const r2 = signalsHealth([ev('wake', '2026-03-28T23:30:00Z')], '2026-04-01', []);
    expect(row(r2, 'wake')).toMatchObject({ status: 'inattivo', daysSince: 3 });
    const r3 = signalsHealth([ev('wake', '2026-03-30T22:30:00Z')], '2026-03-31', []);
    expect(row(r3, 'wake').daysSince).toBe(0);
  });

  it('data di oggi non valida: errore esplicito', () => {
    expect(() => signalsHealth([], '24/10/2026', [])).toThrow();
  });
});
