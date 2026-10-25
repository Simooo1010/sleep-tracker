import { describe, expect, it } from 'vitest';
import type { SignalEvent } from '../../../src/domain/types';
import { buildSignalsView } from '../../../src/server/views';
import { TODAY, datasetWithTonight, expectSerializable, wakeIso } from './fixtures';

describe('buildSignalsView: segnali attivi', () => {
  const ds = datasetWithTonight();
  const v = buildSignalsView({ today: TODAY, events: ds.events, nights: ds.nights, eveningChecks: ds.checks });

  it('una riga per automazione, stato a parole', () => {
    expect(v.empty).toBe(false);
    expect(v.title).toBe('Segnali');
    expect(v.rows.map((r) => r.name)).toEqual([
      'Sveglia interrotta',
      'Riposo attivato',
      'Check serale',
      'Sonnellino rapido',
      'Prima apertura al mattino',
      'Stima di riserva',
      'Recupero sonnellino',
    ]);
    expect(v.rows.every((r) => r.statusWord === 'Attivo')).toBe(true);
    expect(v.rows[0]).toMatchObject({ lastText: 'oggi 07:20', description: 'Comando automatico · invia "wake", coincide con l\'alzata' });
    expect(v.rows[1]?.lastText).toBe('ieri 23:48');
    expect(v.rows[2]?.lastText).toBe('ieri 23:41');
    // Orari stimati dai giorni simili negli ultimi 14 giorni: solo il 20 ottobre (il 24 viene dai segnali).
    expect(v.rows[5]?.lastText).toBe('Usata 1 volta negli ultimi 14 giorni');
    expect(v.warnings).toEqual([]);
    expect(v.notWaitingFor).toEqual([]);
  });

  it('registro degli ultimi 8 eventi, dal più recente', () => {
    expect(v.log.title).toBe('Ultimi segnali');
    expect(v.log.items).toHaveLength(8);
    expect(v.log.items[0]).toMatchObject({ when: 'oggi 08:52', what: 'Primo uso del telefono → app_open', result: 'Registrato' });
    expect(v.log.items[1]).toMatchObject({ when: 'oggi 07:20', what: 'Sveglia interrotta → wake' });
    const ts = v.log.items.map((i) => Date.parse(i.ts));
    expect([...ts].sort((a, b) => b - a)).toEqual(ts);
  });

  it('serializzabile', () => {
    expectSerializable(v);
  });
});

describe('buildSignalsView: vuoto, pause e avvisi', () => {
  it('nessun evento: "Da configurare", "Mai ricevuto", testo dedicato', () => {
    const v = buildSignalsView({ today: TODAY, events: [] });
    expect(v.empty).toBe(true);
    expect(v.emptyText).toBe('Nessun segnale ancora. Quando un Comando invia il primo evento, compare qui.');
    expect(v.rows.slice(0, 5).every((r) => r.statusWord === 'Da configurare' && r.lastText === 'Mai ricevuto')).toBe(true);
    expect(v.rows[5]?.lastText).toBe('Non usata negli ultimi 14 giorni');
    expect(v.rows[6]?.lastText).toBe('—');
    expect(v.log).toEqual({ title: 'Ultimi segnali', items: [], emptyText: 'Ancora nessun evento registrato.' });
    expect(v.warnings).toEqual([]);
    expectSerializable(v);
  });

  it('sveglia ferma da 5 giorni: "In pausa" e un solo avviso gentile', () => {
    const events: SignalEvent[] = [
      { type: 'wake', ts: wakeIso('2026-10-19', '07:10'), source: 'comandi' },
      { type: 'app_open', ts: wakeIso('2026-10-24', '08:40'), source: 'app' },
      { type: 'app_open', ts: wakeIso('2026-10-23', '08:30'), source: 'stima' },
    ];
    const v = buildSignalsView({ today: TODAY, events });
    expect(v.rows[0]).toMatchObject({ status: 'inattivo', statusWord: 'In pausa', statusTone: 'neutral', lastText: 'lun 07:10' });
    expect(v.warnings).toEqual([
      { type: 'wake', text: 'La sveglia interrotta non arriva da 5 giorni: userò la prima apertura al mattino come limite.' },
    ]);
    expect(v.notWaitingFor).toEqual(['wake']);
    expect(v.log.items.find((i) => i.when === 'ieri 08:30')?.result).toBe('Stima usata');
    expectSerializable(v);

    const again = buildSignalsView({ today: TODAY, events, alreadyWarned: ['wake'] });
    expect(again.warnings).toEqual([]);
  });

  it('eventi futuri o non validi ignorati', () => {
    const v = buildSignalsView({
      today: TODAY,
      events: [
        { type: 'wake', ts: 'non-valido', source: 'comandi' },
        { type: 'wake', ts: wakeIso('2026-10-26', '07:00'), source: 'comandi' },
      ],
    });
    expect(v.empty).toBe(true);
    expect(v.log.items).toEqual([]);
    expectSerializable(v);
  });
});
