/**
 * Tipi e helper condivisi dai view model delle schermate.
 * Ogni view model è serializzabile: solo numeri, stringhe, boolean, array, oggetti semplici e null.
 */
import { clockChangesBetween } from '../../domain/clock-change';
import { addDays, bedAxisMinutes, wakeAxisMinutes } from '../../domain/time';
import type { Coverage, Night, NightStatus, Stat } from '../../domain/types';
import { DASH, formatCoverage, formatCoverageShort, formatDayMonth, type CoverageUnit } from './format';

/** Accento del dato (StatTile, chip, barre). */
export type Tone = 'blue' | 'sage' | 'peach' | 'yellow';

/** Segno della fila di copertura: pieno (confermata o automatica), tratteggiato (stimata), punteggiato (mancante). */
export type CoverageMark = NightStatus;

export interface CoverageView {
  used: number;
  window: number;
  /** 'Calcolata su 12 su 14 notti'. */
  text: string;
  /** '12 su 14 notti'. */
  shortText: string;
  /** Segni dalla notte più vecchia alla più recente (vuoto se non pertinente). */
  marks: CoverageMark[];
}

export interface StatTileView {
  key: string;
  /** Etichetta (il componente la mostra in maiuscolo). */
  label: string;
  /** Valore già formattato ('7h 18m', '± 24 min'); '—' quando nascosto. */
  value: string;
  note: string;
  tone: Tone;
  hidden: boolean;
  /** 'Servono almeno N notti. Per ora ne hai M.' quando nascosto, altrimenti null. */
  hiddenText: string | null;
  coverage: CoverageView;
}

/** Barra posizionata in percentuale su un asse. */
export interface BarView {
  leftPct: number;
  widthPct: number;
}

/** Asse del confronto tra notti: 21:00 → 11:00 (840 min). */
export const AXIS_SPAN_MIN = 840;
/** Le 21:00 sull'asse del letto (minuti dalle 18:00). */
export const AXIS_START_BED_AXIS = 180;
/** Altezza di riferimento delle barre di durata (9 h). */
export const DURATION_SCALE_MIN = 540;

export const round2 = (x: number): number => {
  const r = Math.round(x * 100) / 100;
  return r === 0 ? 0 : r;
};
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Percentuale (0–100, 2 decimali) di una posizione in minuti dalle 21:00 sull'asse di 840 min. */
export function axisPct(minFrom21: number): number {
  return round2(clamp((minFrom21 / AXIS_SPAN_MIN) * 100, 0, 100));
}

/** Posizione sull'asse 21→11 di un orario di letto (minuti dalle 18:00). */
export function bedAxisToAxis(bedAxisMin: number): number {
  return bedAxisMin - AXIS_START_BED_AXIS;
}

/** Posizione sull'asse 21→11 di un orario di risveglio (minuti dalla mezzanotte). */
export function wakeMinToAxis(wakeMin: number): number {
  return wakeMin + 6 * 60 - AXIS_START_BED_AXIS;
}

/**
 * Barra della notte sull'asse 21:00 → 11:00, letta sull'orologio locale (coerente con le fasce
 * di tolleranza anche nelle notti del cambio d'ora). null se manca un orario o se è incoerente.
 */
export function nightBar(n: Night): BarView | null {
  if (n.bedAt.value === null || n.wakeAt.value === null) return null;
  const start = bedAxisToAxis(bedAxisMinutes(n.bedAt.value));
  const end = wakeMinToAxis(wakeAxisMinutes(n.wakeAt.value));
  if (end <= start) return null;
  const left = axisPct(start);
  const right = axisPct(end);
  return { leftPct: left, widthPct: round2(Math.max(0, right - left)) };
}

function rank(n: Night): number {
  return n.status === 'confermata' ? 0 : 1;
}

/** Una notte per data: preferisce 'confermata', a parità vince l'ultima nell'array. */
export function nightsByDate(nights: Night[]): Map<string, Night> {
  const m = new Map<string, Night>();
  for (const n of nights) {
    const prev = m.get(n.nightDate);
    if (!prev || rank(n) <= rank(prev)) m.set(n.nightDate, n);
  }
  return m;
}

/** Stato mostrato per una data: senza record la notte è 'mancante'. */
export function statusOf(n: Night | undefined | null): NightStatus {
  return n ? n.status : 'mancante';
}

/** Segni di copertura per le `window` notti che terminano ad `asOf` (inclusa), dalla più vecchia. */
export function coverageMarks(byDate: Map<string, Night>, asOf: string, window: number): CoverageMark[] {
  const out: CoverageMark[] = [];
  for (let i = window - 1; i >= 0; i--) out.push(statusOf(byDate.get(addDays(asOf, -i))));
  return out;
}

export function coverageView(c: Coverage, marks: CoverageMark[] = [], unit: CoverageUnit = 'notti'): CoverageView {
  const used = Number.isFinite(c.used) ? c.used : 0;
  const window = Number.isFinite(c.window) ? c.window : 0;
  return {
    used,
    window,
    text: formatCoverage({ used, window }, unit),
    shortText: formatCoverageShort({ used, window }, unit),
    marks,
  };
}

/** Testo per una statistica nascosta (dal dominio), null se visibile. */
export function hiddenTextOf(stat: Stat<unknown>): string | null {
  if (stat.value !== null) return null;
  return stat.hiddenReason ?? 'Dati insufficienti.';
}

export interface TileSpec {
  key: string;
  label: string;
  tone: Tone;
  note: string;
  /** Valore formattato, oppure null se la statistica è nascosta. */
  value: string | null;
  hiddenText: string | null;
  coverage: CoverageView;
}

export function tile(spec: TileSpec): StatTileView {
  const hidden = spec.value === null;
  return {
    key: spec.key,
    label: spec.label,
    value: hidden ? DASH : (spec.value as string),
    note: spec.note,
    tone: spec.tone,
    hidden,
    hiddenText: hidden ? (spec.hiddenText ?? 'Dati insufficienti.') : null,
    coverage: spec.coverage,
  };
}

/**
 * Frase sui cambi d'ora fra le date date (grafici su più notti), oppure null se non ce ne sono.
 * Le barre mostrano gli orari dell'orologio, le durate sono reali.
 */
export function clockChangeRangeNote(from: string, to: string): string | null {
  const changes = clockChangesBetween(from, to);
  if (changes.length === 0) return null;
  const parts = changes.map((c) => {
    const h = Math.abs(c.shiftMin) / 60;
    const hours = h === 1 ? '1 ora' : `${h} ore`;
    return `Il ${formatDayMonth(c.date)} l'ora è ${c.shiftMin > 0 ? 'tornata indietro' : 'andata avanti'} di ${hours}`;
  });
  return `${parts.join('. ')}. Cambio applicato: gli orari sono quelli dell'orologio, le durate sono reali.`;
}
