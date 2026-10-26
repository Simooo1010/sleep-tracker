import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import { ActionCard, AnalysisScene, CauseCard, NightsTrend, ScoreRing } from '@/components/analysis';
import { Badge } from '@/components/Badge';
import { Coverage } from '@/components/Coverage';
import type { CoverageView } from '@/server/views/common';
import { ANALYSIS_PERIODS, type AnalysisPeriod, type AnalysisView, type ForecastView } from '@/server/views/analysis-types';

import styles from './AnalysisScreen.module.css';

/**
 * Pagina Analisi (sola lettura). Ordine: scena e frase di sintesi, punteggio (l'unico numero grande),
 * periodo, andamento delle notti, perché, cosa cambiare, previsione, racconto AI, copertura.
 * Telefono: un blocco sotto l'altro, ben distanziati, niente contenuto nascosto via JS.
 * PC (da 60rem): griglia a più colonne dentro `content-max`; su 4K più colonne, non schede più larghe.
 * Il testo AI arriva dal server come `narrative` (di solito `<Suspense><AiNarrative/></Suspense>`).
 */

export interface AnalysisScreenProps {
  view: AnalysisView;
  /** Racconto AI già pronto dal server. */
  narrative: ReactNode;
}

/** Ritardo d'entrata del blocco n (stagger): l'animazione la gestisce il CSS. */
const enter = (n: number): CSSProperties => ({ '--enter-i': n }) as CSSProperties;

export function periodLabel(p: AnalysisPeriod): string {
  return `${p} notti`;
}

/** Punteggio della previsione (1–5, un decimale) scritto all'italiana; null se non è un numero. */
export function forecastScoreText(score: number | null): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const v = Math.min(5, Math.max(1, score));
  return `${v.toFixed(1).replace('.', ',')} su 5`;
}

function PeriodSelector({ current }: { current: AnalysisPeriod }) {
  return (
    <div className={styles.periods} role="group" aria-label="Periodo dell’analisi">
      {ANALYSIS_PERIODS.map((p) => {
        const active = p === current;
        return (
          <Link
            key={p}
            href={`?periodo=${p}`}
            prefetch
            scroll={false}
            className={styles.period}
            aria-current={active ? 'page' : undefined}
          >
            {periodLabel(p)}
          </Link>
        );
      })}
    </div>
  );
}

function Hidden({ text }: { text: string }) {
  return (
    <p className={`body-sm muted ${styles.text}`} data-state="sotto-soglia">
      {text}
    </p>
  );
}

function ForecastCard({ forecast }: { forecast: ForecastView }) {
  const scoreText = forecast.hidden ? null : forecastScoreText(forecast.score);
  // Se l'etichetta scrive già il numero ("bassa (2,6 su 5)"), non lo si ripete.
  const labelHasScore = scoreText !== null && forecast.label.includes(scoreText.replace(' su 5', ''));
  return (
    <div className={`card card-yellow card-soft stack ${styles.forecast}`} data-state={scoreText ? 'visibile' : 'sotto-soglia'}>
      <div className="row">
        <Badge variant="forecast" />
      </div>
      {scoreText ? (
        <>
          {labelHasScore ? null : <p className={`title ${styles.text}`}>{scoreText}</p>}
          {forecast.label ? <p className={`body-strong ${styles.text}`}>{forecast.label}</p> : null}
          {forecast.explanation ? <p className={`body-sm ${styles.text}`}>{forecast.explanation}</p> : null}
        </>
      ) : (
        <p className={`body-sm ${styles.text}`}>{forecast.hiddenText || 'Per ora non c’è una stima per domani.'}</p>
      )}
    </div>
  );
}

function CoverageBlock({ coverage }: { coverage: CoverageView }) {
  const present = coverage.marks.filter((m) => m !== 'mancante').length;
  const marksOk = coverage.marks.length === coverage.window && present === coverage.used;
  return (
    <div className={styles.block}>
      <Coverage used={coverage.used} total={coverage.window} marks={marksOk ? coverage.marks : undefined} />
      <p className={`caption muted ${styles.text}`}>
        Segno pieno: notte confermata o automatica. Tratteggiato: stimata. Punteggiato: mancante.
      </p>
      <p className={`caption muted ${styles.text}`}>
        I numeri sono calcolati sulle tue notti. Il racconto usa solo statistiche aggregate, mai dati che ti identificano.
      </p>
    </div>
  );
}

interface SectionProps {
  id: string;
  title: string;
  index: number;
  wide?: boolean;
  children: ReactNode;
}

function Section({ id, title, index, wide, children }: SectionProps) {
  const headingId = `analisi-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={`${styles.section} ${styles.enter} ${wide ? styles.wide : ''}`}
      style={enter(index)}
      data-section={id}
    >
      <h2 id={headingId} className={`title ${styles.heading}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function AnalysisScreen({ view, narrative }: AnalysisScreenProps) {
  if (view.empty) {
    return (
      <div className={styles.page}>
        <h1 className={`heading-md ${styles.pageTitle}`}>Analisi</h1>
        <div className={`${styles.enter}`} style={enter(0)}>
          <PeriodSelector current={view.period} />
        </div>
        <section className={`card stack ${styles.enter}`} style={enter(1)} data-state="vuoto">
          <p className={`body ${styles.text}`} role="status">
            {view.emptyText}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={`heading-md ${styles.pageTitle}`}>Analisi</h1>

      <div className={styles.grid}>
        <div className={`${styles.hero} ${styles.wide} ${styles.enter}`} style={enter(0)}>
          <div className={styles.scene}>
            <AnalysisScene scene={view.scene} />
          </div>
          <div className={styles.intro}>
            <p className={`heading-md ${styles.text}`}>{view.headline}</p>
            <p className={`body-lg muted ${styles.text}`}>{view.summary}</p>
          </div>
          <div className={styles.score}>
            <ScoreRing score={view.score} />
          </div>
        </div>

        <div className={`${styles.wide} ${styles.enter}`} style={enter(1)}>
          <PeriodSelector current={view.period} />
        </div>

        <Section id="notti" title="Le tue notti" index={2} wide>
          <NightsTrend nights={view.nights} />
        </Section>

        <Section id="perche" title="Perché" index={3}>
          {view.causes.hidden || view.causes.items.length === 0 ? (
            <Hidden text={view.causes.hiddenText || 'Per ora non ci sono indizi chiari.'} />
          ) : (
            <ul className={styles.list}>
              {view.causes.items.map((c) => (
                <li key={c.id}>
                  <CauseCard cause={c} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="cosa-cambiare" title="Cosa cambiare" index={4}>
          {view.actions.length === 0 ? (
            <Hidden text="Per ora non c’è niente da cambiare: continua così." />
          ) : (
            <ol className={styles.list}>
              {view.actions.map((a, i) => (
                <li key={a.id}>
                  <ActionCard action={a} index={i + 1} />
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section id="domani" title="Domani" index={5}>
          <ForecastCard forecast={view.forecast} />
        </Section>

        <Section id="racconto" title="Il racconto" index={6}>
          <div className={styles.block}>{narrative}</div>
        </Section>

        <Section id="copertura" title="Su quali dati" index={7}>
          <CoverageBlock coverage={view.coverage} />
        </Section>
      </div>
    </div>
  );
}

export default AnalysisScreen;
