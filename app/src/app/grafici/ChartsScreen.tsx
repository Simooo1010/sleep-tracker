'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Coverage, thresholdSentence } from '@/components/Coverage';
import { CorrelationTable } from '@/components/CorrelationTable';
import { DurationChart } from '@/components/DurationChart';
import { EnergyCard } from '@/components/EnergyCard';
import { Heatmap } from '@/components/Heatmap';
import { ListRow, type ListRowAccent } from '@/components/ListRow';
import { StatTile } from '@/components/StatTile';
import type { ChartsView, MonthlyTrendView, NapsView, StatTileView } from '@/server/views';

import styles from './ChartsScreen.module.css';
import { forecastParts, heatmapCoverage, toCorrelationRows, toDurationChartProps, toHeatmapDays } from './mapping';

/**
 * Pagina Grafici (sola lettura): insight, durata e debito, giorni della settimana, fattori, trend,
 * previsione di domani, sonnellini. Telefono: elenco di voci (`ListRow`), una sezione per volta con
 * "Indietro" in alto. PC (da 60rem): tutte le sezioni insieme in griglia.
 * Gli insight testuali arrivano dal server come `insights` (un client component non importa i server component).
 */

export type SectionId = 'insights' | 'duration' | 'weekdays' | 'factors' | 'trend' | 'forecast' | 'naps';

export interface ChartsScreenProps {
  view: ChartsView;
  /** Sezione Insight già pronta dal server (di solito `<Suspense><InsightsSection/></Suspense>`). */
  insights: ReactNode;
}

interface SectionSpec {
  id: SectionId;
  /** Titolo della voce dell'elenco e della sezione. */
  title: string;
  summary: string | null;
  accent: ListRowAccent;
  wide?: boolean;
  content: ReactNode;
}

/** Scheda calma per una sezione sotto soglia: la frase dice quanti dati mancano. */
function HiddenCard({ title, text }: { title: string; text: string }) {
  return (
    <section className="card stack" data-state="sotto-soglia">
      <h3 className="eyebrow">{title}</h3>
      <p className={`body-sm muted ${styles.text}`}>{text}</p>
    </section>
  );
}

function DurationSection({ view }: { view: ChartsView }) {
  const d = view.duration;
  if (d.hidden) {
    return (
      <HiddenCard
        title="Durata e debito, ultime 14 notti"
        text={thresholdSentence(1, d.coverage.used)}
      />
    );
  }
  return (
    <div className={styles.block}>
      <DurationChart {...toDurationChartProps(d)} />
      {d.clockChangeNote ? (
        <p className="body-sm muted" data-clock-change="true">
          {d.clockChangeNote}
        </p>
      ) : null}
      <Coverage used={d.coverage.used} total={d.coverage.window} marks={d.coverage.marks} />
    </div>
  );
}

function WeekdaysSection({ view }: { view: ChartsView }) {
  const h = view.heatmap;
  if (h.hidden) return <HiddenCard title={h.title} text={thresholdSentence(1, 0)} />;
  const cov = heatmapCoverage(h);
  return (
    <div className={styles.block}>
      <Heatmap days={toHeatmapDays(h)} title={h.title} />
      <Coverage used={cov.used} total={cov.total} marks={cov.marks} />
    </div>
  );
}

function FactorsSection({ view }: { view: ChartsView }) {
  const c = view.correlations;
  if (c.hidden) {
    return <HiddenCard title="Cosa si lega a qualità, energia e umore" text={c.hiddenText ?? thresholdSentence(14, c.coverage.used)} />;
  }
  return (
    <div className={styles.block}>
      <CorrelationTable rows={toCorrelationRows(c)} nights={c.coverage.used} />
      <Coverage used={c.coverage.used} total={c.coverage.window} />
    </div>
  );
}

export function MonthlyTrend({ trend }: { trend: MonthlyTrendView }) {
  if (trend.hidden) {
    return <HiddenCard title={trend.title} text="Il trend compare dopo le prime notti registrate." />;
  }
  const summary = `${trend.title}, ultimi ${trend.bars.length} mesi: ${trend.bars
    .map((b) => `${b.label} ${b.valueText === '—' ? 'senza dati' : `${b.valueText} in media su ${b.nights} ${b.nights === 1 ? 'notte' : 'notti'}`}`)
    .join(', ')}.`;
  return (
    <section className="card stack">
      <h3 className="eyebrow">{trend.title}</h3>
      <div role="img" aria-label={summary}>
        <div className={styles.trendBars}>
          {trend.bars.map((b) => (
            <div key={b.month} className={styles.trendCol}>
              <span className={styles.trendValue}>{b.valueText}</span>
              {b.valueText === '—' ? (
                <div className={styles.trendMissing} />
              ) : (
                <div className={`vbar ${styles.trendBar}`} style={{ height: `${b.heightPct}%` }} />
              )}
            </div>
          ))}
        </div>
        <div className={styles.trendLabels}>
          {trend.bars.map((b) => (
            <span key={b.month} className={`${styles.trendLabel} ${b.current ? styles.trendLabelNow : ''}`}>
              {b.label}
              {b.current ? ' (in corso)' : ''}
              <br />
              {b.nights} {b.nights === 1 ? 'notte' : 'notti'}
            </span>
          ))}
        </div>
      </div>
      <p className={`caption muted ${styles.text}`}>
        Durata media per mese. Il mese in corso conta solo le notti registrate finora.
      </p>
    </section>
  );
}

function ForecastSection({ view }: { view: ChartsView }) {
  const f = view.forecast;
  if (f.hidden) {
    return (
      <section className="card card-yellow card-soft stack" aria-label="Previsione di energia" data-state="sotto-soglia">
        <div className="row">
          <Badge variant="forecast" />
          <span className="caption">{f.kicker}</span>
        </div>
        <p className={`body-sm ${styles.text}`}>{f.hiddenText ?? 'Per ora non c’è una stima di energia per domani.'}</p>
      </section>
    );
  }
  const { explanation, nights } = forecastParts(f);
  return (
    <EnergyCard
      variant="forecast"
      score={f.score}
      explanation={explanation}
      nights={nights}
      minNights={1}
      when={f.kicker}
      coverage={{ used: f.coverage.used, total: f.coverage.window }}
    />
  );
}

function NapTile({ tile }: { tile: StatTileView }) {
  const c = tile.coverage;
  if (tile.hidden) {
    return (
      <div className={`tile tile-${tile.tone}`} role="group" aria-label={tile.label} data-state="sotto-soglia">
        <div className="k">{tile.label}</div>
        <div className="n">{tile.hiddenText ?? 'Dati insufficienti.'}</div>
      </div>
    );
  }
  return (
    <div className={styles.tileWrap}>
      <StatTile label={tile.label} value={tile.value} note={tile.note} tone={tile.tone} />
      <p className={`caption ${styles.tileNote}`}>{c.text}</p>
    </div>
  );
}

function NapsSection({ naps }: { naps: NapsView }) {
  if (naps.hidden) {
    return <HiddenCard title="Sonnellini" text={naps.emptyText ?? 'Nessun sonnellino negli ultimi 14 giorni.'} />;
  }
  return (
    <div className={styles.block}>
      <div className={styles.tiles}>
        {naps.tiles.map((t) => (
          <NapTile key={t.key} tile={t} />
        ))}
      </div>
      <section className="card stack">
        <h3 className="eyebrow">Ultimi sonnellini</h3>
        {naps.list.length === 0 ? (
          <p className={`body-sm muted ${styles.text}`}>{naps.emptyText}</p>
        ) : (
          <ul className={styles.napList}>
            {naps.list.map((n) => (
              <li key={`${n.date}-${n.rangeText}`} className={styles.napItem}>
                <span className={styles.napDate}>{n.dateLabel}</span>
                <span>{n.rangeText}</span>
                <span>{n.durationText}</span>
                <span className="caption muted">{n.provenanceWord}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Dato chiave di ogni voce dell'elenco (telefono): una riga, mai un numero inventato. */
function buildSections(view: ChartsView, insights: ReactNode): SectionSpec[] {
  const avg7 = view.duration.chips.find((c) => c.key === 'avg7');
  const lastMonth = view.monthly.bars[view.monthly.bars.length - 1];
  const freq = view.naps.tiles.find((t) => t.key === 'frequency');

  return [
    {
      id: 'insights',
      title: 'Insight',
      summary: 'Osservazioni brevi sulle tue notti',
      accent: 'blue',
      wide: true,
      content: insights,
    },
    {
      id: 'duration',
      title: 'Durata e debito',
      summary: avg7 && !avg7.hidden ? avg7.text : view.duration.coverage.shortText,
      accent: 'blue',
      content: <DurationSection view={view} />,
    },
    {
      id: 'weekdays',
      title: 'Giorni della settimana',
      summary: view.heatmap.hidden ? thresholdSentence(1, 0) : view.heatmap.subtitle,
      accent: 'sage',
      content: <WeekdaysSection view={view} />,
    },
    {
      id: 'factors',
      title: 'Fattori',
      summary: view.correlations.hidden
        ? view.correlations.hiddenText
        : `Indizi, non cause · ${view.correlations.coverage.shortText}`,
      accent: 'sage',
      content: <FactorsSection view={view} />,
    },
    {
      id: 'trend',
      title: 'Trend',
      summary:
        view.monthly.hidden || !lastMonth
          ? 'Compare dopo le prime notti'
          : `${lastMonth.label}: ${lastMonth.valueText} in media`,
      accent: 'blue',
      content: <MonthlyTrend trend={view.monthly} />,
    },
    {
      id: 'forecast',
      title: 'Domani',
      summary: view.forecast.hidden
        ? view.forecast.hiddenText
        : `${view.forecast.scoreText}, stima`,
      accent: 'yellow',
      content: <ForecastSection view={view} />,
    },
    {
      id: 'naps',
      title: 'Sonnellini',
      summary:
        view.naps.hidden || !freq || freq.hidden
          ? (view.naps.emptyText ?? 'Nessun sonnellino di recente')
          : `${freq.value} giorni con sonnellino`,
      accent: 'yellow',
      content: <NapsSection naps={view.naps} />,
    },
  ];
}

export function ChartsScreen({ view, insights }: ChartsScreenProps) {
  const [open, setOpen] = useState<SectionId | null>(null);
  const rowRefs = useRef<Partial<Record<SectionId, HTMLLIElement | null>>>({});
  const headingRefs = useRef<Partial<Record<SectionId, HTMLHeadingElement | null>>>({});
  const lastOpened = useRef<SectionId | null>(null);

  // Telefono: aprendo una sezione si torna in cima e il focus va al titolo; chiudendola, alla sua voce.
  useEffect(() => {
    if (open) {
      lastOpened.current = open;
      window.scrollTo?.(0, 0);
      headingRefs.current[open]?.focus({ preventScroll: true });
    } else if (lastOpened.current) {
      rowRefs.current[lastOpened.current]?.querySelector('button')?.focus();
    }
  }, [open]);

  if (view.empty) {
    return (
      <div className={styles.page}>
        <h1 className={`heading-md ${styles.pageTitle}`}>{view.title}</h1>
        <section className="card stack" data-state="vuoto">
          <p className={`body ${styles.text}`}>{view.emptyText}</p>
        </section>
        <section aria-labelledby="grafici-insight-vuoto" className={styles.body}>
          <h2 id="grafici-insight-vuoto" className={styles.srOnly}>
            Insight
          </h2>
          {insights}
        </section>
      </div>
    );
  }

  const sections = buildSections(view, insights);

  return (
    <div className={styles.page}>
      <h1 className={`heading-md ${styles.pageTitle}`}>{view.title}</h1>

      <ul className={styles.list} aria-label="Sezioni dei grafici" data-hidden={open !== null}>
        {sections.map((s) => (
          <li
            key={s.id}
            ref={(el) => {
              rowRefs.current[s.id] = el;
            }}
          >
            <ListRow title={s.title} summary={s.summary} accent={s.accent} onOpen={() => setOpen(s.id)} />
          </li>
        ))}
      </ul>

      <div className={styles.sections}>
        {sections.map((s) => {
          const headingId = `grafici-${s.id}`;
          return (
            <section
              key={s.id}
              id={`sezione-${s.id}`}
              aria-labelledby={headingId}
              className={`${styles.section} ${s.wide ? styles.sectionWide : ''}`}
              data-section={s.id}
              data-active={open === s.id}
            >
              <div className={styles.bar}>
                <Button variant="secondary" onClick={() => setOpen(null)}>
                  Indietro
                </Button>
              </div>
              <h2
                id={headingId}
                tabIndex={-1}
                className={`heading-md ${styles.heading}`}
                ref={(el) => {
                  headingRefs.current[s.id] = el;
                }}
              >
                {s.title}
              </h2>
              <div className={styles.body}>{s.content}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default ChartsScreen;
