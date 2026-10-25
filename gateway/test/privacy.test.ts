import { describe, expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { noopLogger } from '../src/log.ts';
import { assertNoIdentifyingKeys, guardMessages, redactText } from '../src/privacy.ts';
import { completion, fakeFetch, goodStats, testEnv, testProviders } from './helpers.ts';

describe('privacy guard', () => {
  it('redacts emails, phone numbers, full dates/timestamps and UUIDs', () => {
    const r = redactText(
      'Sono mario.rossi@example.com, tel +39 347 1234567 o 3471234567; notte del 2026-10-23T23:41:00Z e 23/10/2026, id 123e4567-e89b-12d3-a456-426614174000',
    );
    expect(r.text).not.toMatch(/example\.com|1234567|2026|123e4567/);
    expect(r.text).toContain('[email]');
    expect(r.text).toContain('[telefono]');
    expect(r.text).toContain('[data]');
    expect(r.text).toContain('[id]');
    expect(r.count).toBe(6);
  });

  it('keeps aggregate numbers and times of day untouched', () => {
    const text = 'mediana letto 23:40, sveglia 07:05, durate 7.5 8.0 6.5 7.0, quota 0.85, debito 240 min, r=-0.42 n=18';
    expect(redactText(text)).toEqual({ text, count: 0 });
  });

  it('chat: identifiers never reach the provider', async () => {
    const f = fakeFetch({ 'https://p1.test/v1': () => completion('ok') });
    const g = createGateway({ env: testEnv, providers: testProviders(), fetch: f.fetch, logger: noopLogger });
    const res = await g.chat({ messages: [{ role: 'user', content: 'scrivimi a utente@mail.it, notte 2026-10-20 23:10' }] });
    const sent = JSON.stringify(f.calls[0]!.body);
    expect(sent).not.toContain('utente@mail.it');
    expect(sent).not.toContain('2026-10-20');
    expect(res.x_gateway.redactions).toBe(2);
  });

  it('chat: free text over threshold is rejected (413)', () => {
    expect(() => guardMessages([{ role: 'user', content: 'a'.repeat(9000) }])).toThrow(/8000/);
    expect(() =>
      guardMessages(Array.from({ length: 3 }, () => ({ role: 'user' as const, content: 'b'.repeat(7000) }))),
    ).toThrowError(expect.objectContaining({ status: 413 }));
  });

  it('insights: identifying keys are rejected at any depth', () => {
    expect(() => assertNoIdentifyingKeys({ email: 'x@y.it' })).toThrowError(expect.objectContaining({ code: 'privacy_violation' }));
    expect(() => assertNoIdentifyingKeys({ duration: { nome: 'Mario' } })).toThrow(/duration\.nome/);
    expect(() => assertNoIdentifyingKeys({ list: [{ timestamps: [1, 2] }] })).toThrow(/timestamps/);
    expect(() => assertNoIdentifyingKeys(goodStats)).not.toThrow();
  });

  it('insights endpoint: rejects identifiers, unknown fields, raw timestamps and free text', async () => {
    const g = createGateway({ env: {}, logger: noopLogger });
    await expect(g.insights({ ...goodStats, userId: 'abc' })).rejects.toMatchObject({ status: 400, code: 'privacy_violation' });
    await expect(g.insights({ ...goodStats, extra: 1 })).rejects.toMatchObject({ status: 400, code: 'invalid_stats' });
    await expect(
      g.insights({ ...goodStats, regularity: { ...goodStats.regularity, bedtimeMedian: '2026-10-23T23:40:00Z' } }),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_stats' });
    await expect(
      g.insights({ ...goodStats, correlations: [{ factor: 'ho litigato con mia sorella Anna ieri sera', target: 'mood', r: -0.5, n: 20 }] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('dayContext (testo libero dell\'utente)', () => {
  const ctx = [{ daysAgo: 2, factors: ['cena-fuori', 'alcol'], text: 'Cena fuori con amici, rientrato tardi' }];

  it('accetta dayContext valido e continua a vietare note/free_text', async () => {
    expect(() => assertNoIdentifyingKeys({ ...goodStats, dayContext: ctx })).not.toThrow();
    for (const key of ['note', 'notes', 'free_text', 'diary']) {
      expect(() => assertNoIdentifyingKeys({ ...goodStats, [key]: 'x' })).toThrowError(expect.objectContaining({ code: 'privacy_violation' }));
      expect(() => assertNoIdentifyingKeys({ ...goodStats, dayContext: [{ ...ctx[0], [key]: 'x' }] })).toThrow(/privacy|dayContext\[0\]/);
    }
    const g = createGateway({ env: {}, logger: noopLogger });
    const res = await g.insights({ ...goodStats, dayContext: ctx });
    expect(res.source).toBe('rules');
  });

  it('respinge con 400 oltre i limiti e forme non ammesse', async () => {
    const g = createGateway({ env: {}, logger: noopLogger });
    const bad: unknown[] = [
      [{ ...ctx[0], text: 'a'.repeat(141) }],
      Array.from({ length: 11 }, () => ctx[0]),
      [{ ...ctx[0], daysAgo: 61 }],
      [{ ...ctx[0], daysAgo: -1 }],
      [{ ...ctx[0], daysAgo: 1.5 }],
      [{ ...ctx[0], factors: Array.from({ length: 9 }, (_, i) => `f${i}`) }],
      [{ ...ctx[0], factors: ['x'.repeat(41)] }],
      [{ ...ctx[0], factors: ['ho litigato con Anna'] }],
      [{ ...ctx[0], date: '2026-10-20' }],
      [{ daysAgo: 1, factors: [] }],
    ];
    for (const dayContext of bad) {
      await expect(g.insights({ ...goodStats, dayContext })).rejects.toMatchObject({ status: 400, code: 'invalid_stats' });
    }
  });

  it('i messaggi di errore non riportano il testo dell\'utente', async () => {
    const g = createGateway({ env: {}, logger: noopLogger });
    const secret = 'SEGRETO-' + 'z'.repeat(150);
    const err = await g.insights({ ...goodStats, dayContext: [{ ...ctx[0], text: secret }] }).catch((e: Error) => e);
    expect((err as Error).message).not.toContain('SEGRETO');
  });

  it('redige email, telefoni, date ISO e UUID prima di inviare al provider', async () => {
    const f = fakeFetch({ 'https://p1.test/v1': () => completion('{}'), 'https://p2.test/v1': () => completion('{}'), 'https://p3.test/v1': () => completion('{}') });
    const g = createGateway({ env: testEnv, providers: testProviders(), fetch: f.fetch, logger: noopLogger });
    await g.insights({
      ...goodStats,
      dayContext: [
        {
          daysAgo: 3,
          factors: ['viaggio'],
          text: 'scrivi a mario@example.com o chiama +39 347 1234567, il 2026-10-20 id 123e4567-e89b-12d3-a456-426614174000',
        },
      ],
    });
    const sent = JSON.stringify(f.calls[0]!.body.messages);
    expect(sent).not.toMatch(/mario@example|1234567|2026-10-20|123e4567/);
    expect(sent).toContain('[email]');
    expect(sent).toContain('[telefono]');
    expect(sent).toContain('[data]');
    expect(sent).toContain('[id]');
  });
});
