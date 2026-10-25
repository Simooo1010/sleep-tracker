import { describe, expect, it } from 'vitest';

import { getNow, todayInRome } from '../src/lib/clock';

describe('clock', () => {
  it('usa APP_FIXED_NOW solo fuori produzione', () => {
    const env = { APP_FIXED_NOW: '2026-10-24T07:00:00Z', NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv;
    expect(getNow(env).toISOString()).toBe('2026-10-24T07:00:00.000Z');
    const prod = { APP_FIXED_NOW: '2026-10-24T07:00:00Z', NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv;
    expect(getNow(prod).toISOString()).not.toBe('2026-10-24T07:00:00.000Z');
  });
  it('ignora un valore non valido', () => {
    const env = { APP_FIXED_NOW: 'boh', NODE_ENV: 'test' } as unknown as NodeJS.ProcessEnv;
    expect(Number.isNaN(getNow(env).getTime())).toBe(false);
  });
  it('data locale di Roma a cavallo di mezzanotte', () => {
    expect(todayInRome(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25');
    expect(todayInRome(new Date('2026-10-24T21:30:00Z'))).toBe('2026-10-24');
  });
});
