import type { Night } from './types';

export const TZ = 'Europe/Rome';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface LocalParts {
  /** 'YYYY-MM-DD' in Europe/Rome */
  date: string;
  /** minuti dalla mezzanotte locale (0–1439) */
  minutes: number;
  /** 0 = lunedì … 6 = domenica */
  weekday: number;
}

export function localParts(iso: string): LocalParts {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`ISO non valido: ${iso}`);
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday as string),
  };
}

/** Orario di letto su asse continuo: minuti dalle 18:00 locali della sera (23:30→330, 00:40→400, 02:00→480). */
export function bedAxisMinutes(iso: string): number {
  const m = localParts(iso).minutes;
  return m >= 18 * 60 ? m - 18 * 60 : m + 6 * 60;
}

/** Orario di risveglio: minuti dalla mezzanotte locale. */
export function wakeAxisMinutes(iso: string): number {
  return localParts(iso).minutes;
}

/** Durata in minuti (arrotondata) tra due istanti ISO. */
export function durationMinutes(bedIso: string, wakeIso: string): number {
  return Math.round((new Date(wakeIso).getTime() - new Date(bedIso).getTime()) / 60000);
}

/** Data locale del risveglio = identificativo della notte. */
export function nightDateOf(wakeIso: string): string {
  return localParts(wakeIso).date;
}

/**
 * Notte "weekend" = notti di venerdì e sabato (si va a letto di venerdì/sabato sera),
 * cioè nightDate (giorno del risveglio) di sabato o domenica.
 */
export function isWeekendNight(nightDate: string): boolean {
  const wd = localParts(`${nightDate}T12:00:00Z`).weekday;
  return wd === 5 || wd === 6;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
}

/** Notti utilizzabili: bed e wake presenti. */
export function hasTimes(n: Night): n is Night & { bedAt: { value: string }; wakeAt: { value: string } } {
  return n.bedAt.value !== null && n.wakeAt.value !== null;
}

/** Aggiunge giorni a 'YYYY-MM-DD' (calendario, senza fuso). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
