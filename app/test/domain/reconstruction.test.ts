import { describe, expect, it } from 'vitest';
import { reconstructNight } from '../../src/domain/reconstruction';
import { durationMinutes } from '../../src/domain/time';
import type { EveningCheck, SignalEvent, SignalType } from '../../src/domain/types';

const ev = (type: SignalType, ts: string, source: SignalEvent['source'] = 'comandi'): SignalEvent => ({
  type,
  ts,
  source,
});

// 2026-10-20 (martedì): Europe/Rome in CEST = UTC+2.
const NIGHT = '2026-10-20';
const evening: EveningCheck = {
  date: '2026-10-19',
  tiredness: { value: 4, provenance: 'automatico' },
  mood: { value: 3, provenance: 'automatico' },
  factors: [],
  napMinutesToday: { value: 0, provenance: 'automatico' },
};

describe('reconstructNight', () => {
  it('giornata perfetta: Full Immersion + sveglia → automatico, stimata', () => {
    const r = reconstructNight(
      [
        ev('evening_check', '2026-10-19T20:50:00Z', 'app'), // 22:50 locali
        ev('bedtime_candidate', '2026-10-19T21:05:00Z'), // 23:05
        ev('wake', '2026-10-20T05:00:00Z'), // 07:00
        ev('app_open', '2026-10-20T06:15:00Z', 'app'),
      ],
      NIGHT,
      evening,
    );
    expect(r.bedAt).toEqual({ value: '2026-10-19T21:05:00Z', provenance: 'automatico' });
    expect(r.wakeAt).toEqual({ value: '2026-10-20T05:00:00Z', provenance: 'automatico' });
    expect(r.status).toBe('stimata');
  });

  it('nessun segnale → entrambi mancanti, notte mancante', () => {
    const r = reconstructNight([], NIGHT, null);
    expect(r.bedAt).toEqual({ value: null, provenance: 'mancante' });
    expect(r.wakeAt).toEqual({ value: null, provenance: 'mancante' });
    expect(r.status).toBe('mancante');
  });

  it('solo check serale → letto stimato dal ts del check, risveglio mancante', () => {
    const r = reconstructNight([ev('evening_check', '2026-10-19T21:20:00Z', 'app')], NIGHT, evening);
    expect(r.bedAt).toEqual({ value: '2026-10-19T21:20:00Z', provenance: 'stimato' });
    expect(r.wakeAt).toEqual({ value: null, provenance: 'mancante' });
    expect(r.status).toBe('stimata');
  });

  it("più check serali → l'ultimo", () => {
    const r = reconstructNight(
      [ev('evening_check', '2026-10-19T21:40:00Z', 'app'), ev('evening_check', '2026-10-19T19:00:00Z', 'app')],
      NIGHT,
      evening,
    );
    expect(r.bedAt.value).toBe('2026-10-19T21:40:00Z');
  });

  it('solo app_open → risveglio stimato (mai automatico), primo della mattina', () => {
    const r = reconstructNight(
      [ev('app_open', '2026-10-20T07:30:00Z', 'app'), ev('app_open', '2026-10-20T06:10:00Z', 'app')],
      NIGHT,
      null,
    );
    expect(r.wakeAt).toEqual({ value: '2026-10-20T06:10:00Z', provenance: 'stimato' });
    expect(r.bedAt.provenance).toBe('mancante');
    expect(r.status).toBe('stimata');
  });

  it('la sveglia vince su app_open', () => {
    const r = reconstructNight(
      [ev('app_open', '2026-10-20T04:30:00Z', 'app'), ev('wake', '2026-10-20T05:00:00Z')],
      NIGHT,
      null,
    );
    expect(r.wakeAt).toEqual({ value: '2026-10-20T05:00:00Z', provenance: 'automatico' });
  });

  it('Full Immersion vince sul check serale', () => {
    const r = reconstructNight(
      [ev('bedtime_candidate', '2026-10-19T21:00:00Z'), ev('evening_check', '2026-10-19T21:30:00Z', 'app')],
      NIGHT,
      evening,
    );
    expect(r.bedAt).toEqual({ value: '2026-10-19T21:00:00Z', provenance: 'automatico' });
  });

  it("duplicati: più bedtime_candidate → l'ultimo prima del wake; più wake → il primo", () => {
    const r = reconstructNight(
      [
        ev('wake', '2026-10-20T05:30:00Z'), // 07:30 (snooze)
        ev('bedtime_candidate', '2026-10-19T20:30:00Z'),
        ev('bedtime_candidate', '2026-10-19T21:15:00Z'),
        ev('bedtime_candidate', '2026-10-19T21:15:00Z'), // duplicato esatto
        ev('wake', '2026-10-20T05:00:00Z'), // 07:00
        ev('wake', '2026-10-20T05:00:00Z'), // duplicato esatto
        ev('bedtime_candidate', '2026-10-20T03:30:00Z'), // 05:30, ancora prima del wake: è l'ultimo valido
      ],
      NIGHT,
      null,
    );
    expect(r.wakeAt.value).toBe('2026-10-20T05:00:00Z');
    expect(r.bedAt.value).toBe('2026-10-20T03:30:00Z');
  });

  it('bedtime_candidate dopo il wake viene ignorato se ce n’è uno prima', () => {
    const r = reconstructNight(
      [
        ev('bedtime_candidate', '2026-10-19T21:00:00Z'), // 23:00
        ev('wake', '2026-10-20T02:00:00Z'), // 04:00
        ev('bedtime_candidate', '2026-10-20T03:00:00Z'), // 05:00, dopo il wake
      ],
      NIGHT,
      null,
    );
    expect(r.bedAt.value).toBe('2026-10-19T21:00:00Z');
  });

  it('a cavallo della mezzanotte: letto alle 00:40 del giorno del risveglio', () => {
    const r = reconstructNight(
      [ev('bedtime_candidate', '2026-10-19T22:40:00Z'), ev('wake', '2026-10-20T06:00:00Z')],
      NIGHT,
      null,
    );
    expect(r.bedAt).toEqual({ value: '2026-10-19T22:40:00Z', provenance: 'automatico' });
    expect(r.wakeAt.value).toBe('2026-10-20T06:00:00Z');
    expect(durationMinutes(r.bedAt.value as string, r.wakeAt.value as string)).toBe(440);
  });

  it('ora legale 2026-10-25: 23:00 → 07:00 locali dura 9 h', () => {
    const r = reconstructNight(
      [
        ev('bedtime_candidate', '2026-10-24T21:00:00Z'), // 23:00 CEST
        ev('wake', '2026-10-25T06:00:00Z'), // 07:00 CET
      ],
      '2026-10-25',
      null,
    );
    expect(r.bedAt.provenance).toBe('automatico');
    expect(r.wakeAt.provenance).toBe('automatico');
    expect(durationMinutes(r.bedAt.value as string, r.wakeAt.value as string)).toBe(540);
  });

  it('ora legale 2026-10-25: le finestre seguono l’ora locale (CET dopo il cambio)', () => {
    const r = reconstructNight(
      [
        ev('wake', '2026-10-25T01:30:00Z'), // 02:30 CET → prima delle 03:00, fuori
        ev('wake', '2026-10-25T02:00:00Z'), // 03:00 CET → dentro
        ev('bedtime_candidate', '2026-10-24T15:59:00Z'), // 17:59 CEST → fuori
        ev('bedtime_candidate', '2026-10-24T16:00:00Z'), // 18:00 CEST → dentro
      ],
      '2026-10-25',
      null,
    );
    expect(r.wakeAt.value).toBe('2026-10-25T02:00:00Z');
    expect(r.bedAt.value).toBe('2026-10-24T16:00:00Z');
  });

  it('eventi fuori finestra ignorati', () => {
    const r = reconstructNight(
      [
        ev('bedtime_candidate', '2026-10-19T15:59:00Z'), // 17:59 sera prima
        ev('bedtime_candidate', '2026-10-20T04:01:00Z'), // 06:01 mattina
        ev('bedtime_candidate', '2026-10-18T21:00:00Z'), // notte precedente
        ev('evening_check', '2026-10-19T10:00:00Z', 'app'), // mattina della sera prima
        ev('wake', '2026-10-20T00:59:00Z'), // 02:59
        ev('wake', '2026-10-20T12:01:00Z'), // 14:01
        ev('app_open', '2026-10-20T12:30:00Z', 'app'), // 14:30
        ev('wake', '2026-10-21T05:00:00Z'), // giorno dopo
        ev('nap_start', '2026-10-20T05:00:00Z'),
      ],
      NIGHT,
      null,
    );
    expect(r.bedAt.provenance).toBe('mancante');
    expect(r.wakeAt.provenance).toBe('mancante');
    expect(r.status).toBe('mancante');
  });

  it('bordi inclusivi delle finestre: 18:00, 06:00, 03:00, 14:00', () => {
    expect(
      reconstructNight([ev('bedtime_candidate', '2026-10-19T16:00:00Z')], NIGHT, null).bedAt.value,
    ).toBe('2026-10-19T16:00:00Z');
    expect(
      reconstructNight([ev('bedtime_candidate', '2026-10-20T04:00:00Z')], NIGHT, null).bedAt.value,
    ).toBe('2026-10-20T04:00:00Z');
    expect(reconstructNight([ev('wake', '2026-10-20T01:00:00Z')], NIGHT, null).wakeAt.value).toBe(
      '2026-10-20T01:00:00Z',
    );
    expect(reconstructNight([ev('wake', '2026-10-20T12:00:00Z')], NIGHT, null).wakeAt.value).toBe(
      '2026-10-20T12:00:00Z',
    );
  });

  it('incoerenza wake <= letto → letto scartato, nessun ripiego sul check serale', () => {
    const r = reconstructNight(
      [
        ev('evening_check', '2026-10-19T21:00:00Z', 'app'),
        ev('wake', '2026-10-20T01:30:00Z'), // 03:30
        ev('bedtime_candidate', '2026-10-20T03:00:00Z'), // 05:00, unico candidato, dopo il wake
      ],
      NIGHT,
      null,
    );
    expect(r.bedAt).toEqual({ value: null, provenance: 'mancante' });
    expect(r.wakeAt).toEqual({ value: '2026-10-20T01:30:00Z', provenance: 'automatico' });
    expect(r.status).toBe('stimata');
  });

  it('wake == letto → letto scartato', () => {
    const r = reconstructNight(
      [ev('bedtime_candidate', '2026-10-20T03:00:00Z'), ev('wake', '2026-10-20T03:00:00Z')],
      NIGHT,
      null,
    );
    expect(r.bedAt.value).toBeNull();
    expect(r.wakeAt.value).toBe('2026-10-20T03:00:00Z');
  });

  it('durata > 16 h → letto scartato come non plausibile; 16 h esatte ok', () => {
    const tooLong = reconstructNight(
      [ev('bedtime_candidate', '2026-10-19T16:00:00Z'), ev('wake', '2026-10-20T08:01:00Z')], // 18:00 → 10:01
      NIGHT,
      null,
    );
    expect(tooLong.bedAt).toEqual({ value: null, provenance: 'mancante' });
    expect(tooLong.wakeAt.provenance).toBe('automatico');

    const limit = reconstructNight(
      [ev('bedtime_candidate', '2026-10-19T16:00:00Z'), ev('wake', '2026-10-20T08:00:00Z')],
      NIGHT,
      null,
    );
    expect(limit.bedAt.value).toBe('2026-10-19T16:00:00Z');
  });

  it('mai confermata, timestamp non validi ignorati, input non mutato', () => {
    const input = [ev('wake', 'non-una-data'), ev('bedtime_candidate', '2026-10-19T21:00:00Z')];
    const copy = structuredClone(input);
    const r = reconstructNight(input, NIGHT, evening);
    expect(r.status).toBe('stimata');
    expect(r.wakeAt.provenance).toBe('mancante');
    expect(input).toEqual(copy);
  });
});
