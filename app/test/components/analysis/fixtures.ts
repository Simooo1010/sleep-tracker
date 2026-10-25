import type { CoverageView } from '../../../src/server/views/common';
import type {
  ActionView,
  CauseView,
  NightPoint,
  NightsView,
  ScoreView,
} from '../../../src/server/views/analysis-types';

export const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

export const coverage = (used: number, window: number): CoverageView => ({
  used,
  window,
  text: `Calcolata su ${used} su ${window} notti`,
  shortText: `${used} su ${window} notti`,
  marks: [
    ...Array.from({ length: used }, () => 'confermata' as const),
    ...Array.from({ length: window - used }, () => 'mancante' as const),
  ],
});

export function score(over: Partial<ScoreView> = {}): ScoreView {
  return {
    value: 72,
    word: 'Buona',
    tone: 'sage',
    hidden: false,
    hiddenText: '',
    parts: [
      { id: 'durata', label: 'Durata', pct: 80, note: '7 h 12 min di media' },
      { id: 'regolarita', label: 'Regolarità', pct: 65, note: '± 24 min attorno alla mediana' },
      { id: 'debito', label: 'Debito', pct: null, note: 'Servono almeno 7 notti' },
    ],
    ...over,
  };
}

export function point(i: number, over: Partial<NightPoint> = {}): NightPoint {
  const day = String((i % 28) + 1).padStart(2, '0');
  return {
    nightDate: `2026-10-${day}`,
    label: `g ${day}`,
    durationMin: 400 + (i % 5) * 15,
    bedAxisMin: 330,
    wakeMin: 440,
    status: 'confermata',
    outlier: false,
    exception: false,
    summary: `Notte ${day}: ${400 + (i % 5) * 15} minuti, confermata`,
    ...over,
  };
}

export function nights(n: number, over: Partial<NightsView> = {}): NightsView {
  return {
    hidden: false,
    hiddenText: '',
    points: Array.from({ length: n }, (_, i) => point(i)),
    targetMin: 450,
    avgMin: 430,
    avgLabel: 'Media 7h 10m',
    caption: `3 notti su ${n} fuori orario`,
    coverage: coverage(n, n),
    ...over,
  };
}

export const cause: CauseView = {
  id: 'schermi',
  title: 'Gli schermi a letto spostano la notte',
  body: 'Nelle sere con schermi a letto tendi ad addormentarti più tardi.',
  evidence: '+38 min in media su 6 sere',
  tone: 'peach',
};

export const action: ActionView = {
  id: 'orario',
  title: 'Vai a letto alle 23:30',
  why: 'Il tuo orario sta scivolando di 40 min.',
  expected: 'Potrebbe ridurre il debito di circa 20 min a notte.',
  impact: 2,
  impactLabel: 'Impatto medio',
};
