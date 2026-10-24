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
