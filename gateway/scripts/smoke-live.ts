#!/usr/bin/env node
// Smoke test LIVE contro i provider reali. NON eseguire in CI.
//   GROQ_API_KEY=... OPENROUTER_API_KEY=... npm run smoke:live
// Per ogni provider attivo con la env var presente: una richiesta di insight
// strutturati con statistiche finte. Stampa solo metadati (mai chiavi o contenuti).
import { createGateway } from '../src/gateway.ts';
import { noopLogger } from '../src/log.ts';
import type { InsightStatsInput } from '../src/insights/schema.ts';

const sampleStats: InsightStatsInput = {
  windowDays: 14,
  nights: { inWindow: 14, withData: 12, confirmed: 9, estimated: 3 },
  duration: { nights: 12, medianMinutes: 402, mean7Minutes: 395 },
  debt: { nights: 12, minutes: 210 },
  regularity: {
    nights: 12,
    toleranceMinutes: 30,
    bedtimeMedian: '23:50',
    wakeMedian: '07:05',
    bedtimeWithinShare: 0.58,
    wakeWithinShare: 0.83,
  },
  weekdayWeekend: {
    weekdayNights: 8,
    weekendNights: 4,
    weekdayMidpoint: '03:20',
    weekendMidpoint: '04:35',
    socialJetLagMinutes: 75,
  },
};

async function main() {
  const base = createGateway({ logger: noopLogger });
  const providers = base.config.providers;
  const skipped = base.config.all.filter((p) => !(p.enabled && p.configured));
  for (const s of skipped) console.log(`- ${s.id}: saltato (${s.reason})`);
  if (providers.length === 0) {
    console.log('Nessun provider configurato nell\'ambiente: smoke test live PENDENTE.');
    process.exit(0);
  }
  let failures = 0;
  for (const p of providers) {
    // One gateway per provider, pinned, so each one is tested in isolation.
    const gw = createGateway({ logger: noopLogger, env: { ...process.env, GATEWAY_PROVIDERS_JSON: JSON.stringify({ mode: 'replace', providers: [{ ...stripKey(p) }] }) } });
    const t0 = Date.now();
    const res = await gw.insights(sampleStats);
    const ms = Date.now() - t0;
    const attempt = res.x_gateway.attempts.at(-1);
    if (res.source === 'ai') {
      console.log(`✔ ${p.id} (${p.model}) → ${res.model}, ${res.insights.length} insight validi, ${ms} ms, modo ${p.structuredOutput}`);
    } else {
      failures++;
      console.log(`✘ ${p.id} (${p.model}) → fallback regole: ${attempt?.errorKind ?? attempt?.reason ?? 'sconosciuto'}${attempt?.httpStatus ? ` HTTP ${attempt.httpStatus}` : ''}`);
    }
  }
  process.exit(failures ? 1 : 0);
}

function stripKey<T extends { apiKey?: string }>(p: T): Omit<T, 'apiKey'> {
  const { apiKey: _apiKey, ...rest } = p;
  return rest;
}

void main();
