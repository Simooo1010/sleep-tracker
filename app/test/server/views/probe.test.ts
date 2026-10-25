import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as V from '../../../src/server/views';
import { datasetWithTonight, TODAY } from './fixtures';
it('probe', () => {
  const ds = datasetWithTonight();
  const out = {
    night: V.buildNightView({ today: TODAY, nights: ds.nights, events: ds.events, naps: ds.naps, eveningChecks: ds.checks }),
    reg: V.buildRegularityView({ today: TODAY, nights: ds.nights }),
    charts: V.buildChartsView({ today: TODAY, nights: ds.nights, naps: ds.naps, eveningChecks: ds.checks }),
    history: V.buildHistoryView({ today: TODAY, nights: ds.nights, naps: ds.naps }),
    evening: V.buildEveningView({ today: TODAY, check: ds.checks[ds.checks.length-1], naps: ds.naps, alarmMin: 435 }),
    signals: V.buildSignalsView({ today: TODAY, events: ds.events, nights: ds.nights, eveningChecks: ds.checks }),
  };
  writeFileSync(process.env.OUT!, JSON.stringify(out, null, 1));
});
