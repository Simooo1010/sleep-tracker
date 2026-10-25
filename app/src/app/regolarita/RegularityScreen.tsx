'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Coverage } from '@/components/Coverage';
import { DriftChart, type DriftChartProps } from '@/components/DriftChart';
import { ListRow } from '@/components/ListRow';
import { NightBars, type NightBarsNight } from '@/components/NightBars';
import { StatTile } from '@/components/StatTile';
import { TOLERANCE_MIN } from '@/domain/types';
import type { CoverageView, StatTileView } from '@/server/views/common';
import { DASH, formatLongDate, formatShortDate } from '@/server/views/format';
import type { DriftView, RegularityRowView, RegularityView, WeekWeekendView } from '@/server/views/regularity';

import styles from './RegularityScreen.module.css';

/**
 * Pagina Regolarità. Tutto il testo e i numeri arrivano dal view model (`RegularityView`): qui si mappano
 * soltanto le props dei componenti. Telefono: un numero ("9 su 14") con il badge di deriva e una voce per
 * grafico, che si apre a tutto schermo con "Indietro". PC (da 60rem): le viste larghe insieme.
 * Telefono e PC sono due alberi nello stesso markup, alternati dal CSS (nessun salto in idratazione).
 */

export type RegularitySection = 'notti' | 'indicatori' | 'deriva' | 'weekend';

export interface RegularityScreenProps {
  view: RegularityView;
  /** Sezione aperta all'inizio (telefono). Default: nessuna, cioè l'elenco. */
  initialSection?: RegularitySection | null;
}

// ---------------------------------------------------------------------------------------------
// Mappatura view model → props dei componenti (funzioni pure, testate)
// ---------------------------------------------------------------------------------------------

/** Scarto con segno del view model ('+8 min', '−12 min', '0 min', '+8', '—') → minuti. Non leggibile → null. */
export function parseSignedMin(text: string): number | null {
  const m = /^([+−-]?)(\d+)(?:\s*min)?$/.exec(text.trim());
  if (!m) return null;
  const v = Number(m[2]);
  return m[1] === '−' || m[1] === '-' ? (v === 0 ? 0 : -v) : v;
}

function parseClock(text: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(text.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 'HH:MM' di un orario di letto → minuti dalle 18:00. '—' → null. */
export function bedMinFromClock(text: string): number | null {
  const c = parseClock(text);
  return c === null ? null : (((c - 18 * 60) % 1440) + 1440) % 1440;
}

const AXIS_MIN = 840;
/** Le 21:00 sull'asse del letto (minuti dalle 18:00) e le 21:00 in minuti dalla mezzanotte. */
const BED_AXIS_START = 180;

const PROVENANCE = { confermata: 'confermato', stimata: 'stimato', mancante: 'mancante' } as const;

function rowName(r: RegularityRowView): string {
  const date = formatLongDate(r.nightDate);
  const name = r.isToday ? `stanotte, ${date}` : date;
  return r.isException ? `${name} (eccezione, esclusa dal riferimento)` : name;
}

/** Notti per NightBars. Le barre arrivano in percentuale dell'asse 21→11: si riconvertono in minuti interi. */
export function toNightBarsNights(rows: RegularityRowView[]): NightBarsNight[] {
  return rows.map((r) => {
    const base = { label: r.dayLabel, fullLabel: rowName(r) };
    if (r.bar === null || r.status === 'mancante') {
      return { ...base, bedMin: null, wakeMin: null, provenance: 'mancante', bedDevMin: null, wakeDevMin: null, regular: null };
    }
    const startAxis = Math.round((r.bar.leftPct / 100) * AXIS_MIN);
    const endAxis = Math.round(((r.bar.leftPct + r.bar.widthPct) / 100) * AXIS_MIN);
    return {
      ...base,
      bedMin: startAxis + BED_AXIS_START,
      wakeMin: endAxis - BED_AXIS_START,
      provenance: PROVENANCE[r.status],
      bedDevMin: parseSignedMin(r.bedDevText),
      wakeDevMin: parseSignedMin(r.wakeDevText),
      // Un'eccezione resta visibile ma non ha un verdetto proprio: lo ricava NightBars dagli scarti.
      regular: r.tolerance === 'ok' ? true : r.tolerance === 'fuori' ? false : null,
    };
  });
}

/** Deriva per DriftChart. Nascosta → sei settimane mancanti e `shiftMin = null` (il grafico lo scrive a parole). */
export function toDriftProps(d: DriftView): DriftChartProps {
  if (d.hidden) {
    return { weeklyBedMin: Array.from({ length: 6 }, () => null), shiftMin: null, spanWeeks: null, exceeds: false };
  }
  const m = /^([+−-]?\d+) min in (\d+) settiman/.exec(d.badge ?? '');
  return {
    weeklyBedMin: d.bars.map((b) => bedMinFromClock(b.valueText)),
    shiftMin: m ? parseSignedMin(m[1] as string) : null,
    spanWeeks: m ? Number(m[2]) : null,
    exceeds: d.exceeds,
  };
}

/** Props di Coverage/StatTile. I segni si usano solo se concordano con i conteggi del view model. */
export function coverageProps(c: CoverageView): { used: number; total: number; marks?: CoverageView['marks'] } {
  const present = c.marks.filter((m) => m !== 'mancante').length;
  if (c.marks.length === c.window && present === c.used) return { used: c.used, total: c.window, marks: c.marks };
  return { used: c.used, total: c.window };
}

// ---------------------------------------------------------------------------------------------
// Blocchi
// ---------------------------------------------------------------------------------------------

function CoverageLine({ coverage }: { coverage: CoverageView }) {
  return <Coverage {...coverageProps(coverage)} />;
}

function NightsBlock({ view, title }: { view: RegularityView; title?: string }) {
  const { baseline, bands } = view;
  if (baseline.hidden || bands === null) {
    return (
      <section className={`card ${styles.block}`}>
        <p className="eyebrow">{title ?? 'Confronto tra notti'}</p>
        <p className="body">{baseline.hiddenText ?? 'Dati insufficienti.'}</p>
        <CoverageLine coverage={baseline.coverage} />
      </section>
    );
  }
  const exceptions = view.rows.filter((r) => r.isException && r.bar !== null);
  const names = exceptions.map((r) => formatShortDate(r.nightDate));
  return (
    <div className={styles.block}>
      <NightBars
        nights={toNightBarsNights(view.rows)}
        medianBedMin={bedMinFromClock(bands.bedMedianText)}
        medianWakeMin={parseClock(bands.wakeMedianText)}
        toleranceMin={TOLERANCE_MIN}
        title={title}
      />
      {exceptions.length > 0 && (
        <p className={`body-sm ${styles.note}`}>
          <Badge variant="rules">Eccezione</Badge>{' '}
          {exceptions.length === 1
            ? `${names[0]} è visibile nel grafico ma esclusa dal riferimento.`
            : `${names.join(', ')} sono visibili nel grafico ma escluse dal riferimento.`}
        </p>
      )}
      <p className={`caption muted ${styles.note}`}>
        Riferimento: letto {baseline.bedText}, sveglia {baseline.wakeText}. Mediana delle ultime 14 notti, senza i giorni-eccezione.
      </p>
      <CoverageLine coverage={baseline.coverage} />
    </div>
  );
}

function TilesBlock({ tiles }: { tiles: StatTileView[] }) {
  return (
    <div className={styles.tiles}>
      {tiles.map((t) => (
        <StatTile
          key={t.key}
          label={t.label}
          value={t.hidden ? null : t.value}
          note={t.hidden ? (t.hiddenText ?? undefined) : t.note}
          tone={t.tone}
          coverage={coverageProps(t.coverage)}
        />
      ))}
    </div>
  );
}

function DriftBlock({ drift }: { drift: DriftView }) {
  return (
    <div className={styles.block}>
      <DriftChart {...toDriftProps(drift)} />
      {drift.hidden && <p className={`body ${styles.note}`}>{drift.hiddenText ?? 'Dati insufficienti.'}</p>}
      <CoverageLine coverage={drift.coverage} />
    </div>
  );
}

function WeekendBlock({ ww, showTitle }: { ww: WeekWeekendView; showTitle: boolean }) {
  return (
    <section className={`card ${styles.block} ${styles.weekend}`}>
      {showTitle && <p className="eyebrow">{ww.title}</p>}
      {ww.hidden ? (
        <p className="body">{ww.hiddenText ?? 'Dati insufficienti.'}</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>Feriali e weekend: letto, sveglia e punto medio del sonno</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className={styles.srOnly}>Orario</span>
                  </th>
                  <th scope="col">Feriali</th>
                  <th scope="col">Weekend</th>
                  <th scope="col">Differenza</th>
                </tr>
              </thead>
              <tbody>
                {ww.rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.label}</th>
                    <td>{r.weekdayText}</td>
                    <td>{r.weekendText}</td>
                    <td>{r.deltaText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ww.sjlText && <p className="body-strong">{ww.sjlText}</p>}
        </>
      )}
      <p className="caption muted">{ww.note}</p>
      <CoverageLine coverage={ww.coverage} />
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Telefono
// ---------------------------------------------------------------------------------------------

const SECTION_TITLES: Record<RegularitySection, string> = {
  notti: 'Confronto tra notti',
  indicatori: 'Cinque indicatori',
  deriva: 'Deriva del letto',
  weekend: 'Feriali e weekend',
};

function PhoneHome({ view, onOpen }: { view: RegularityView; onOpen: (s: RegularitySection) => void }) {
  const h = view.headline;
  const tolerance = `Entro la tolleranza di ± ${TOLERANCE_MIN} min.`;
  const outside = `Oltre la tolleranza di ± ${TOLERANCE_MIN} min.`;
  return (
    <>
      <section className={`card ${styles.headline}`} aria-label="Notti nella tolleranza">
        <p className="eyebrow">Nella tolleranza</p>
        <p className="display-lg">{h.hidden ? DASH : h.big}</p>
        {h.hidden ? (
          <>
            <Badge variant="missing" />
            <p className="body">{h.hiddenText ?? 'Dati insufficienti.'}</p>
          </>
        ) : (
          <p className="body">{h.sub}</p>
        )}
        {h.excludedText && <p className="caption muted">{h.excludedText}</p>}
        {h.driftChip && (
          <>
            <Badge variant={view.drift.exceeds ? 'out' : 'ok'}>{h.driftChip}</Badge>
            <p className="caption muted">{view.drift.exceeds ? outside : tolerance}</p>
          </>
        )}
        <CoverageLine coverage={h.coverage} />
      </section>

      <ul className={styles.list} aria-label="Grafici della regolarità">
        <li>
          <ListRow
            title={SECTION_TITLES.notti}
            summary={view.baseline.hidden ? view.baseline.hiddenText : `Letto ${view.baseline.bedText} · sveglia ${view.baseline.wakeText}`}
            accent="blue"
            onOpen={() => onOpen('notti')}
          />
        </li>
        <li>
          <ListRow
            title={SECTION_TITLES.indicatori}
            summary="Scarti, tolleranza, punto medio, social jet lag"
            accent="sage"
            onOpen={() => onOpen('indicatori')}
          />
        </li>
        <li>
          <ListRow
            title={SECTION_TITLES.deriva}
            summary={view.drift.hidden ? view.drift.hiddenText : view.drift.badge}
            accent="peach"
            onOpen={() => onOpen('deriva')}
          />
        </li>
        <li>
          <ListRow
            title={SECTION_TITLES.weekend}
            summary={view.weekWeekend.hidden ? view.weekWeekend.hiddenText : view.weekWeekend.sjlText}
            accent="blue"
            onOpen={() => onOpen('weekend')}
          />
        </li>
      </ul>
    </>
  );
}

function PhoneSection({
  view,
  section,
  onBack,
  headingRef,
}: {
  view: RegularityView;
  section: RegularitySection;
  onBack: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <>
      <Button variant="secondary" className={styles.back} onClick={onBack}>
        Indietro
      </Button>
      <h2 ref={headingRef} tabIndex={-1} className={`heading-md ${styles.sectionTitle}`}>
        {SECTION_TITLES[section]}
      </h2>
      {section === 'notti' && <NightsBlock view={view} title="Ultime 14 notti e stanotte" />}
      {section === 'indicatori' && <TilesBlock tiles={view.tiles} />}
      {section === 'deriva' && <DriftBlock drift={view.drift} />}
      {section === 'weekend' && <WeekendBlock ww={view.weekWeekend} showTitle={false} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Pagina
// ---------------------------------------------------------------------------------------------

export function RegularityScreen({ view, initialSection = null }: RegularityScreenProps) {
  const [open, setOpen] = useState<RegularitySection | null>(initialSection);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLHeadingElement>(null);
  const touched = useRef(false);

  // Dopo un'apertura o una chiusura il focus va al titolo (un lettore di schermo annuncia dove si è) e si torna in alto.
  useEffect(() => {
    if (!touched.current) return;
    (open ? sectionRef.current : titleRef.current)?.focus({ preventScroll: true });
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
  }, [open]);

  const go = (s: RegularitySection | null) => {
    touched.current = true;
    setOpen(s);
  };

  return (
    <div className={styles.root}>
      <h1 ref={titleRef} tabIndex={-1} className={`heading-md ${styles.title}`}>
        {view.title}
      </h1>

      {view.empty ? (
        <section className={`card ${styles.block}`} aria-label="Nessuna notte">
          <p className="body-lg">{view.emptyText}</p>
          <CoverageLine coverage={view.headline.coverage} />
        </section>
      ) : (
        <>
          <div className={styles.phone} data-layout="phone">
            {open === null ? (
              <PhoneHome view={view} onOpen={go} />
            ) : (
              <PhoneSection view={view} section={open} onBack={() => go(null)} headingRef={sectionRef} />
            )}
          </div>

          <div className={styles.desktop} data-layout="desktop">
            <NightsBlock view={view} />
            <TilesBlock tiles={view.tiles} />
            <div className={styles.pair}>
              <DriftBlock drift={view.drift} />
              <WeekendBlock ww={view.weekWeekend} showTitle />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default RegularityScreen;
