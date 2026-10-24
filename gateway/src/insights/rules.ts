// Last fallback level: deterministic Italian insights from aggregate statistics.
// Never fails, never needs a network call. Same output schema as the AI.
import type { AiInsights, InsightItem, InsightStats } from './schema.ts';
import { THRESHOLDS, applyThresholds, confidenceFor, coverageOf, type SectionKey } from './thresholds.ts';

const DEFAULT_TARGET = 420; // 7 h: lower bound of the adult recommended range

export function formatDuration(totalMinutes: number): string {
  const m = Math.round(Math.abs(totalMinutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

function signed(minutes: number): string {
  const sign = minutes > 0 ? '+' : minutes < 0 ? '−' : '±';
  return `${sign}${formatDuration(minutes)}`;
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

const factorTargetLabel: Record<string, string> = {
  quality: 'la qualità percepita',
  energy: "l'energia al mattino",
  mood: "l'umore serale",
  duration: 'la durata del sonno',
};

const sectionLabel: Record<SectionKey, string> = {
  duration: 'durata',
  debt: 'debito di sonno',
  regularity: 'regolarità',
  drift: 'deriva degli orari',
  weekdayWeekend: 'feriali vs weekend',
  naps: 'sonnellini',
  correlations: 'correlazioni',
};

export function generateRuleInsights(stats: InsightStats): AiInsights & { hidden: SectionKey[] } {
  const { eligible: s, hidden } = applyThresholds(stats);
  const cov = coverageOf(stats);
  const items: InsightItem[] = [];
  const target = s.targetSleepMinutes ?? DEFAULT_TARGET;

  // Coverage (always evaluated).
  const lowCoverage = cov.nightsInWindow > 0 && cov.share < THRESHOLDS.lowCoverageShare;
  if (lowCoverage || cov.nightsWithData < THRESHOLDS.durationNights) {
    const missing = hidden.length ? ` Compariranno altri insight (${hidden.map((h) => sectionLabel[h]).join(', ')}) con più notti registrate.` : '';
    items.push({
      category: 'coverage',
      severity: 'info',
      title: `Dati su ${cov.nightsWithData}/${cov.nightsInWindow} notti`,
      body: `La copertura degli ultimi ${cov.windowDays} giorni è ${pct(cov.share)}: le statistiche sono indicative.${missing}`,
      confidence: 'high',
    });
  }

  if (s.duration) {
    const d = s.duration;
    const below = d.medianMinutes < target - 15;
    items.push({
      category: 'duration',
      severity: below ? 'attention' : 'positive',
      title: below ? `Dormi in media ${formatDuration(d.medianMinutes)}` : `Durata nella norma: ${formatDuration(d.medianMinutes)}`,
      body: below
        ? `La durata mediana (${d.nights} notti) è sotto il tuo riferimento di ${formatDuration(target)} di circa ${formatDuration(target - d.medianMinutes)}.`
        : `La durata mediana (${d.nights} notti) raggiunge il riferimento di ${formatDuration(target)}.`,
      confidence: confidenceFor(d.nights),
    });
  }

  if (s.debt) {
    const debt = s.debt.minutes;
    if (debt >= 120) {
      items.push({
        category: 'debt',
        severity: 'attention',
        title: `Debito di sonno: ${formatDuration(debt)}`,
        body: `Negli ultimi ${s.debt.nights} giorni con dati hai accumulato circa ${formatDuration(debt)} in meno rispetto al riferimento. Recuperare gradualmente (es. andare a letto un po' prima) è più efficace di una sola notte lunga.`,
        confidence: confidenceFor(s.debt.nights),
      });
    } else if (debt <= 30) {
      items.push({
        category: 'debt',
        severity: 'positive',
        title: 'Nessun debito di sonno rilevante',
        body: `Negli ultimi ${s.debt.nights} giorni con dati il sonno è in linea con il riferimento.`,
        confidence: confidenceFor(s.debt.nights),
      });
    }
  }

  if (s.regularity) {
    const r = s.regularity;
    const worst = Math.min(r.bedtimeWithinShare, r.wakeWithinShare);
    const sev: InsightItem['severity'] = worst >= 0.8 ? 'positive' : worst < 0.5 ? 'attention' : 'info';
    const title =
      sev === 'positive' ? 'Orari regolari' : sev === 'attention' ? 'Orari poco regolari' : 'Regolarità migliorabile';
    items.push({
      category: 'regularity',
      severity: sev,
      title,
      body: `Rispetto alla mediana degli ultimi ${r.nights} giorni (letto ${r.bedtimeMedian}, sveglia ${r.wakeMedian}) sei rimasto entro ±${r.toleranceMinutes} min nel ${pct(r.bedtimeWithinShare)} delle sere e nel ${pct(r.wakeWithinShare)} dei risvegli.`,
      confidence: confidenceFor(r.nights),
    });
  }

  if (s.drift) {
    const d = s.drift;
    const main = Math.abs(d.bedtimeShiftMinutes) >= Math.abs(d.wakeShiftMinutes) ? 'bed' : 'wake';
    const shift = main === 'bed' ? d.bedtimeShiftMinutes : d.wakeShiftMinutes;
    const weeks = Math.max(1, Math.round(d.overDays / 7));
    if (Math.abs(shift) >= 30) {
      items.push({
        category: 'drift',
        severity: 'attention',
        title: main === 'bed' ? "L'orario di letto si sta spostando" : "L'orario di risveglio si sta spostando",
        body: `${main === 'bed' ? "L'orario mediano di letto" : "L'orario mediano di risveglio"} è cambiato di ${signed(shift)} in ${weeks} settiman${weeks === 1 ? 'a' : 'e'}.`,
        confidence: confidenceFor(d.nights),
      });
    } else if (Math.abs(d.bedtimeShiftMinutes) < 15 && Math.abs(d.wakeShiftMinutes) < 15) {
      items.push({
        category: 'drift',
        severity: 'positive',
        title: 'Orari stabili nel tempo',
        body: `Negli ultimi ${d.overDays} giorni gli orari mediani di letto e risveglio sono rimasti stabili (entro 15 min).`,
        confidence: confidenceFor(d.nights),
      });
    }
  }

  if (s.weekdayWeekend) {
    const w = s.weekdayWeekend;
    const lag = w.socialJetLagMinutes;
    items.push({
      category: 'weekday_weekend',
      severity: lag >= 60 ? 'attention' : lag >= 30 ? 'info' : 'positive',
      title: lag >= 30 ? `Weekend sfasato di ${formatDuration(lag)}` : 'Feriali e weekend allineati',
      body: `Il punto medio del sonno è alle ${w.weekdayMidpoint} nei feriali e alle ${w.weekendMidpoint} nel weekend (${w.weekdayNights} notti feriali, ${w.weekendNights} nel weekend). Il weekend conta come gli altri giorni per la regolarità.`,
      confidence: confidenceFor(w.weekdayNights + w.weekendNights),
    });
  }

  if (s.naps) {
    const n = s.naps;
    items.push({
      category: 'naps',
      severity: 'info',
      title: `${n.count} sonnellini in ${n.days} giorni`,
      body: `Sonnellini registrati: ${n.count}${n.medianMinutes !== undefined ? `, durata mediana ${formatDuration(n.medianMinutes)}` : ''}. Sono inclusi nel sonno totale delle 24 ore.`,
      confidence: confidenceFor(n.days),
    });
  }

  if (s.correlations) {
    const top = [...s.correlations].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
    if (top) {
      const dir = top.r > 0 ? 'più alta' : 'più bassa';
      items.push({
        category: 'correlation',
        severity: 'info',
        title: `Indizio: «${top.factor}» e ${factorTargetLabel[top.target] ?? top.target}`,
        body: `Nei giorni con «${top.factor}» ${factorTargetLabel[top.target] ?? top.target} tende a essere ${dir} (r = ${top.r.toFixed(2)}, ${top.n} notti). È una correlazione, non una prova di causa.`,
        confidence: confidenceFor(top.n),
      });
    }
  }

  if (items.length === 0) {
    items.push({
      category: 'coverage',
      severity: 'info',
      title: 'Servono ancora un po\' di dati',
      body: `Con ${cov.nightsWithData} notti registrate non ci sono ancora abbastanza dati per suggerimenti affidabili.`,
      confidence: 'high',
    });
  }

  const order = { attention: 0, info: 1, positive: 2 } as const;
  const coverageItem = items.find((i) => i.category === 'coverage');
  const rest = items.filter((i) => i !== coverageItem).sort((a, b) => order[a.severity] - order[b.severity]);
  const insights = (coverageItem ? [coverageItem, ...rest] : rest).slice(0, 6);

  const firstAttention = rest.find((i) => i.severity === 'attention');
  const firstPositive = rest.find((i) => i.severity === 'positive');
  const summaryParts = [
    firstAttention ? `Da tenere d'occhio: ${firstAttention.title.toLowerCase()}.` : null,
    firstPositive ? `Bene: ${firstPositive.title.toLowerCase()}.` : null,
  ].filter(Boolean);
  const summary =
    summaryParts.join(' ') || `Statistiche su ${cov.nightsWithData} notti negli ultimi ${cov.windowDays} giorni.`;

  return { summary, insights, hidden };
}
