/** View model delle schermate: funzioni pure dal dominio a oggetti serializzabili per la UI. */
export * from './format';
export * from './common';
export * from './night';
export * from './regularity';
export * from './charts';
export * from './history';
export * from './evening';
export * from './signals';
export * from './analysis';
export * from './analysis-types';
// `ForecastView` e `ScoreView` esistono sia in charts/night sia nel contratto di /analisi:
// dal barrel restano quelli già usati (Grafici, Notte); quelli dell'analisi hanno un alias
// (oppure si importano da './analysis-types').
export type { ForecastView } from './charts';
export type { ScoreView } from './night';
export type { ForecastView as AnalysisForecastView, ScoreView as AnalysisScoreView } from './analysis-types';
