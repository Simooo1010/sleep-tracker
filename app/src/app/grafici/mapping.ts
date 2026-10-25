/**
 * Dalla view della pagina Grafici (testi già formattati) alle props dei componenti del sistema.
 * La view porta testi come '7h 32m' o '+0,6': qui si rileggono in numeri, senza inventare dati.
 * Funzioni pure, nessun accesso a React o al server.
 */
import type { CoverageMark } from '@/components/Coverage';
import type { CorrelationRow } from '@/components/CorrelationTable';
import type { DurationChartProps, DurationNight } from '@/components/DurationChart';
import type { HeatmapCell, HeatmapStatus } from '@/components/Heatmap';
import type {
  ChartChipView,
  CorrelationTableView,
  DurationChartView,
  ForecastView,
  HeatmapView,
} from '@/server/views';
import { formatLongDate } from '@/server/views/format';

/** '7h 32m' o '7h32' (anche dentro una frase: 'Media 7 notti 7h 12m') → minuti. Nessuna durata → null. */
export function parseHm(text: string): number | null {
  const m = /(\d+)h\s?(\d{2})/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** '+0,6', '−0,8', '0,0' → numero. '—' o testo non numerico → null. */
export function parseSignedDecimal(text: string): number | null {
  const m = /^([+−-]?)(\d+(?:[.,]\d+)?)$/.exec(text.trim());
  if (!m) return null;
  const n = Number((m[2] ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return m[1] === '−' || m[1] === '-' ? -n : n;
}

function chipMinutes(chips: ChartChipView[], key: string): number | null {
  const chip = chips.find((c) => c.key === key);
  return chip && !chip.hidden ? parseHm(chip.text) : null;
}

/** Barre, medie, debito e obiettivo per `DurationChart`. */
export function toDurationChartProps(view: DurationChartView): DurationChartProps {
  const nights: DurationNight[] = view.bars.map((bar) => ({
    label: bar.dayLabel,
    fullLabel: formatLongDate(bar.nightDate),
    durationMin: bar.status === 'mancante' ? null : parseHm(bar.durationText),
    provenance: bar.status === 'confermata' ? 'confermato' : bar.status === 'stimata' ? 'stimato' : 'mancante',
  }));
  const target = chipMinutes(view.chips, 'target');
  return {
    nights,
    ...(target !== null ? { targetMin: target } : {}),
    avg7Min: chipMinutes(view.chips, 'avg7'),
    avgMonthMin: chipMinutes(view.chips, 'avgMonth'),
    debtMin: chipMinutes(view.chips, 'debt'),
  };
}

/** Sette righe da lunedì a domenica, ogni riga dalla settimana più vecchia alla più recente. */
export function toHeatmapDays(view: HeatmapView): HeatmapCell[][] {
  const rows = [...view.rows].sort((a, b) => a.weekday - b.weekday);
  return rows.map((row) =>
    row.cells.map((cell): HeatmapCell => {
      const minutes = cell.status === 'mancante' || cell.status === null ? null : parseHm(cell.text);
      const status: HeatmapStatus = minutes === null ? 'mancante' : (cell.status ?? 'mancante');
      return { minutes, status };
    }),
  );
}

/** Copertura della heatmap: i segni di tutte le notti, dalla più vecchia alla più recente. */
export function heatmapCoverage(view: HeatmapView): { used: number; total: number; marks: CoverageMark[] } {
  const cells = view.rows
    .flatMap((r) => r.cells)
    .filter((c): c is typeof c & { nightDate: string } => c.nightDate !== null)
    .sort((a, b) => a.nightDate.localeCompare(b.nightDate));
  const marks: CoverageMark[] = cells.map((c) => (c.status === null || parseHm(c.text) === null ? 'mancante' : c.status));
  return { used: marks.filter((m) => m !== 'mancante').length, total: marks.length, marks };
}

/** Righe di `CorrelationTable`: la differenza torna numero dal testo già arrotondato a un decimale. */
export function toCorrelationRows(view: CorrelationTableView): CorrelationRow[] {
  return view.rows.map((row) => {
    const value = (outcome: 'quality' | 'energy' | 'mood'): number | null => {
      const cell = row.cells.find((c) => c.outcome === outcome);
      return cell ? parseSignedDecimal(cell.text) : null;
    };
    const occurrences = Number(/^(\d+)/.exec(row.countText)?.[1] ?? 0);
    return {
      factor: row.label,
      occurrences,
      quality: value('quality'),
      energy: value('energy'),
      mood: value('mood'),
    };
  });
}

/**
 * Spiegazione e numero di notti della previsione per `EnergyCard`. Il componente aggiunge da solo
 * 'Stima su N notti.': la frase già presente nella view si toglie per non ripeterla.
 */
export function forecastParts(view: ForecastView): { explanation: string | undefined; nights: number } {
  const nights = view.coverage.used;
  const explanation = view.explanation?.replace(/\s*Stima su \d+ nott[ei]\.?\s*$/, '').trim();
  return { explanation: explanation ? explanation : undefined, nights };
}
