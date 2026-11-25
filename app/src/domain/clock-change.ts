/**
 * Cambio d'ora legale (Europe/Rome): quanto la notte `nightDate` è più lunga o più corta di quanto
 * dicano gli orari sull'orologio.
 *
 * Funzione pura. La notte va dalle 18:00 del giorno prima alle 12:00 di `nightDate` (18 ore a muro).
 * Le durate dell'app sono sempre reali (istante di sveglia − istante di letto): nella notte del ritorno
 * all'ora solare (ultima domenica di ottobre) 23:30 → 07:30 sono 9 ore, non 8; in quella del passaggio
 * all'ora legale (ultima domenica di marzo) sono 7 ore.
 */
import { localToIso } from './estimate';
import { addDays } from './time';

const WALL_NIGHT_MIN = 18 * 60;

/** +60 = l'ora è tornata indietro (notte più lunga), −60 = è andata avanti (più corta), 0 = nessun cambio. */
export function clockChangeShiftMin(nightDate: string): number {
  const start = Date.parse(localToIso(addDays(nightDate, -1), 18 * 60));
  const end = Date.parse(localToIso(nightDate, 12 * 60));
  return Math.round((end - start) / 60000) - WALL_NIGHT_MIN;
}

export type ClockChangeWhen = 'stanotte' | 'quella' | 'stasera';

function hours(min: number): string {
  const h = Math.abs(min) / 60;
  return h === 1 ? '1 ora' : `${h} ore`;
}

/** Frase calma che spiega il cambio d'ora; null se la notte non lo contiene. */
export function clockChangeText(shiftMin: number, when: ClockChangeWhen): string | null {
  if (shiftMin === 0) return null;
  const back = shiftMin > 0;
  const move = back ? 'tornano indietro' : 'vanno avanti';
  const effect = back
    ? `la notte dura ${hours(shiftMin)} in più di quanto dicono gli orari`
    : `la notte dura ${hours(shiftMin)} in meno di quanto dicono gli orari`;
  if (when === 'stasera') {
    return `Stanotte cambia l'ora: le lancette ${move} di ${hours(shiftMin)}, quindi ${effect}. L'app lo tiene in conto da sola.`;
  }
  if (when === 'stanotte') {
    return `Cambio d'ora applicato: le lancette ${back ? 'sono tornate indietro' : 'sono andate avanti'} di ${hours(shiftMin)}, quindi ${effect}. La durata mostrata è quella reale.`;
  }
  return `In quella notte è cambiata l'ora (${back ? '+' : '−'}${hours(shiftMin)}). Cambio applicato: la durata mostrata è quella reale.`;
}

/** Notti con cambio d'ora fra due date incluse ('YYYY-MM-DD'), in ordine, con lo scostamento in minuti. */
export function clockChangesBetween(from: string, to: string): Array<{ date: string; shiftMin: number }> {
  const out: Array<{ date: string; shiftMin: number }> = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const shiftMin = clockChangeShiftMin(d);
    if (shiftMin !== 0) out.push({ date: d, shiftMin });
  }
  return out;
}
