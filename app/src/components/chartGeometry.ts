/**
 * Geometria e formattazione condivise dai grafici NightBars, DriftChart e DurationChart.
 * Funzioni pure, senza dipendenze dal dominio.
 *
 * Convenzioni degli orari (le stesse del dominio, ma qui non importato):
 * - letto: minuti dalle 18:00 locali della sera (23:30 → 330, 00:40 → 400);
 * - sveglia: minuti dalla mezzanotte locale (07:20 → 440).
 * Asse dei grafici orari: 21:00 → 11:00, 840 minuti (docs/design/system/Dati-e-calcoli.md).
 */

export type Provenienza = 'automatico' | 'confermato' | 'stimato' | 'mancante';

/** Inizio dell'asse orario (21:00) in minuti dalla mezzanotte. */
export const AXIS_START_CLOCK = 21 * 60;
/** Lunghezza dell'asse orario: 21:00 → 11:00. */
export const AXIS_SPAN_MIN = 840;
/** Origine dell'asse del letto (18:00) in minuti dalla mezzanotte. */
export const BED_ORIGIN_CLOCK = 18 * 60;
/** Tolleranza di regolarità attorno alla mediana. */
export const DEFAULT_TOLERANCE_MIN = 30;

const DAY_MIN = 24 * 60;
/** Segno meno tipografico (U+2212). */
export const MINUS = '−';

/** Ore segnate sull'asse orario, con la posizione in minuti sull'asse. */
export const AXIS_TICKS: ReadonlyArray<{ label: string; axisMin: number }> = [
  { label: '21', axisMin: 0 },
  { label: '00', axisMin: 180 },
  { label: '03', axisMin: 360 },
  { label: '06', axisMin: 540 },
  { label: '09', axisMin: 720 },
];

export function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Arrotonda a 2 decimali per percentuali stabili nel markup. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100 + 0;
}

/** Orario di letto (minuti dalle 18:00) → minuti sull'asse 21:00 → 11:00 (può uscire dall'asse). */
export function bedToAxis(bedMin: number): number {
  return bedMin - (AXIS_START_CLOCK - BED_ORIGIN_CLOCK);
}

/** Orario di sveglia (minuti dalla mezzanotte) → minuti sull'asse 21:00 → 11:00 (può uscire dall'asse). */
export function wakeToAxis(wakeMin: number): number {
  return wakeMin + (DAY_MIN - AXIS_START_CLOCK);
}

/** Minuti sull'asse → percentuale 0–100, con clamp fuori asse. Valore non finito → null. */
export function axisPct(axisMin: number): number | null {
  if (!isNum(axisMin)) return null;
  return round2(clamp((axisMin / AXIS_SPAN_MIN) * 100, 0, 100));
}

export interface Span {
  /** Inizio in percentuale dell'asse (0–100). */
  left: number;
  /** Larghezza in percentuale dell'asse (0–100). */
  width: number;
  /** L'inizio reale cade fuori dall'asse ed è stato tagliato. */
  clippedStart: boolean;
  /** La fine reale cade fuori dall'asse ed è stata tagliata. */
  clippedEnd: boolean;
}

/**
 * Barra di una notte sull'asse. La sveglia è sempre dopo il letto: se sull'asse cadrebbe
 * prima (o uguale), si sposta al giorno dopo. Dati non finiti → null (notte non disegnabile).
 */
export function nightSpan(bedMin: number | null, wakeMin: number | null): Span | null {
  if (!isNum(bedMin) || !isNum(wakeMin)) return null;
  const start = bedToAxis(bedMin);
  let end = wakeToAxis(wakeMin);
  while (end <= start) end += DAY_MIN;
  const s = clamp(start, 0, AXIS_SPAN_MIN);
  const e = clamp(end, 0, AXIS_SPAN_MIN);
  const left = round2((s / AXIS_SPAN_MIN) * 100);
  const right = round2((e / AXIS_SPAN_MIN) * 100);
  return {
    left,
    width: round2(Math.max(0, right - left)),
    clippedStart: start < 0 || start > AXIS_SPAN_MIN,
    clippedEnd: end > AXIS_SPAN_MIN || end < 0,
  };
}

/** Fascia di tolleranza (centro ± tolleranza) in percentuale dell'asse, tagliata ai bordi. */
export function bandSpan(centerAxisMin: number | null, toleranceMin: number = DEFAULT_TOLERANCE_MIN): Span | null {
  if (!isNum(centerAxisMin) || !isNum(toleranceMin)) return null;
  const tol = Math.abs(toleranceMin);
  const start = centerAxisMin - tol;
  const end = centerAxisMin + tol;
  const s = clamp(start, 0, AXIS_SPAN_MIN);
  const e = clamp(end, 0, AXIS_SPAN_MIN);
  const left = round2((s / AXIS_SPAN_MIN) * 100);
  return {
    left,
    width: round2(Math.max(0, (e / AXIS_SPAN_MIN) * 100 - left)),
    clippedStart: start < 0,
    clippedEnd: end > AXIS_SPAN_MIN,
  };
}

/** Scarto con segno: '+12', '−8' (U+2212), '0'. Non finito → null. */
export function formatSigned(min: number | null | undefined): string | null {
  if (!isNum(min)) return null;
  const v = Math.round(min);
  if (v === 0) return '0';
  return v > 0 ? `+${v}` : `${MINUS}${Math.abs(v)}`;
}

/** Minuti dalla mezzanotte (anche fuori 0–1439) → 'HH:MM'. Non finito → null. */
export function formatClock(clockMin: number | null | undefined): string | null {
  if (!isNum(clockMin)) return null;
  const m = (((Math.round(clockMin) % DAY_MIN) + DAY_MIN) % DAY_MIN);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Orario di letto (minuti dalle 18:00) → 'HH:MM'. */
export function formatBedClock(bedMin: number | null | undefined): string | null {
  return isNum(bedMin) ? formatClock(bedMin + BED_ORIGIN_CLOCK) : null;
}

/** Durata compatta: '7h 32m', '1h 05m', '45m'. Valori negativi → 0. Non finito → null. */
export function formatDuration(min: number | null | undefined): string | null {
  if (!isNum(min)) return null;
  const v = Math.max(0, Math.round(min));
  const h = Math.floor(v / 60);
  const m = v % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Parola della provenienza al femminile (riferita alla notte). */
export const PROVENIENZA_NOTTE: Record<Provenienza, string> = {
  automatico: 'Automatica',
  confermato: 'Confermata',
  stimato: 'Stimata',
  mancante: 'Mancante',
};

/** Unisce classi, saltando i valori vuoti. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
