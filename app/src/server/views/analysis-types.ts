/**
 * Contratto condiviso della pagina /analisi. Solo tipi: nessuna logica.
 * Il view model (server/views/analysis.ts) li produce, i componenti li consumano.
 * Regole: numeri sempre calcolati dal dominio; stringhe già in italiano e formattate;
 * ogni sezione sotto soglia espone `hidden` + `hiddenText` (mai numeri inventati).
 */
import type { CoverageView, Tone } from './common';

export type AnalysisPeriod = 7 | 14 | 30;
export const ANALYSIS_PERIODS: readonly AnalysisPeriod[] = [7, 14, 30];
export const DEFAULT_ANALYSIS_PERIOD: AnalysisPeriod = 14;

/** Stato che sceglie l'illustrazione SVG (e la frase accessibile). */
export type SceneKey = 'recupero' | 'regolare' | 'debito' | 'deriva' | 'pochi-dati';

export interface SceneView {
  key: SceneKey;
  /** Descrizione testuale dell'illustrazione (aria-label / figcaption). */
  label: string;
}

export interface ScorePart {
  id: 'durata' | 'regolarita' | 'debito';
  label: string;
  /** 0–100, null se sotto soglia. */
  pct: number | null;
  /** Frase breve con il numero reale (es. "7 h 12 min di media"). */
  note: string;
}

export interface ScoreView {
  /** 0–100 intero; null se i dati non bastano. */
  value: number | null;
  /** Parola che accompagna il numero (mai solo colore): "Buona", "Da sistemare"... */
  word: string;
  tone: Tone;
  hidden: boolean;
  hiddenText: string;
  parts: ScorePart[];
}

export interface NightPoint {
  nightDate: string;
  /** Etichetta breve, es. "lun 19". */
  label: string;
  durationMin: number | null;
  /** Minuti dalle 18:00 (asse del letto), null se mancante. */
  bedAxisMin: number | null;
  /** Minuti dalla mezzanotte, null se mancante. */
  wakeMin: number | null;
  status: 'confermata' | 'stimata' | 'mancante';
  /** Fuori dalla tolleranza ±30 min dalla baseline. */
  outlier: boolean;
  exception: boolean;
  /** Descrizione accessibile completa della notte. */
  summary: string;
}

export interface NightsView {
  hidden: boolean;
  hiddenText: string;
  points: NightPoint[];
  targetMin: number;
  avgMin: number | null;
  avgLabel: string;
  /** Una riga che spiega cosa si vede ("3 notti su 14 fuori orario"). */
  caption: string;
  coverage: CoverageView;
}

export interface CauseView {
  id: string;
  title: string;
  /** Spiegazione calma, senza linguaggio causale ("indizio", "tende a"). */
  body: string;
  /** I numeri che la sostengono, già formattati. */
  evidence: string;
  tone: Tone;
}

export interface ActionView {
  id: string;
  title: string;
  why: string;
  /** Effetto atteso, in forma prudente. */
  expected: string;
  /** 1 = piccolo, 2 = medio, 3 = alto. Testo equivalente in `impactLabel`. */
  impact: 1 | 2 | 3;
  impactLabel: string;
}

export interface ForecastView {
  hidden: boolean;
  hiddenText: string;
  /** 1–5 con un decimale, null se nascosta. */
  score: number | null;
  label: string;
  explanation: string;
}

export interface AnalysisView {
  period: AnalysisPeriod;
  /** Nessuna notte nel periodo: mostra solo lo stato vuoto. */
  empty: boolean;
  emptyText: string;
  headline: string;
  summary: string;
  scene: SceneView;
  score: ScoreView;
  nights: NightsView;
  causes: { hidden: boolean; hiddenText: string; items: CauseView[] };
  actions: ActionView[];
  forecast: ForecastView;
  coverage: CoverageView;
}

/** Props dei componenti (components/analysis/*): ognuno riceve un pezzo della view. */
export interface AnalysisSceneProps {
  scene: SceneView;
}
export interface ScoreRingProps {
  score: ScoreView;
}
export interface NightsTrendProps {
  nights: NightsView;
}
export interface CauseCardProps {
  cause: CauseView;
}
export interface ActionCardProps {
  action: ActionView;
  /** Numero d'ordine mostrato (1, 2, 3). */
  index: number;
}
