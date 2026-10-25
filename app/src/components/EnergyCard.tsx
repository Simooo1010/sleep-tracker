'use client';

import { useId } from 'react';

import { FORECAST_MIN_NIGHTS } from '../domain/forecast';
import { Coverage, type CoverageMark } from './Coverage';
import styles from './EnergyCard.module.css';

/**
 * EnergyCard: schede gialle per energia e sonno diurno (salvia nel tema scuro, `yellow-*` è un alias).
 * Variante `nap`: sonnellino con comando rapido (Inizia, Termina, Registrato con Annulla).
 * Variante `forecast`: previsione di energia per domani, sempre come stima ("Stima su N notti").
 * Spec: docs/design/system/components/EnergyCard/README.md.
 * 'use client' perché la variante `nap` riceve i gestori dei pulsanti.
 */

export interface PreviousNap {
  /** Giorno del sonnellino precedente, già scritto ("Ieri"). */
  dayLabel: string;
  /** Orari in 24 ore ("14:05"). */
  start: string;
  end: string;
  minutes: number;
  /** Sonno delle 24 ore già formattato ("8h 04m"). */
  total24h?: string;
}

export type NapState =
  | { status: 'idle'; previous?: PreviousNap }
  | { status: 'run'; start: string }
  | { status: 'done'; start: string; end: string; minutes: number };

export interface EnergyCardNapProps {
  variant: 'nap';
  nap: NapState;
  onStart?: () => void;
  onStop?: () => void;
  onUndo?: () => void;
  /** Livello del titolo "Sonnellino". Default 3. */
  headingLevel?: 2 | 3 | 4;
}

export interface EnergyCardForecastProps {
  variant: 'forecast';
  /** Voto previsto 1–5 (anche decimale, viene arrotondato). null = nessuna stima. */
  score: number | null;
  /** Spiegazione con i numeri, senza "Stima su N notti" (lo aggiunge il componente). */
  explanation?: string;
  /** Notti simili su cui si basa la stima. */
  nights: number;
  /** Soglia minima di notti. Default FORECAST_MIN_NIGHTS del dominio. */
  minNights?: number;
  /** Quando vale la previsione. Default "Domani mattina". */
  when?: string;
  coverage?: { used: number; total: number; estimated?: number; marks?: readonly CoverageMark[] };
}

export type EnergyCardProps = EnergyCardNapProps | EnergyCardForecastProps;

const TIME_RE = /^\d{1,2}:\d{2}$/;

function time(s: string | undefined): string | null {
  return typeof s === 'string' && TIME_RE.test(s.trim()) ? s.trim() : null;
}

function count(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function text(s: string | undefined): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t === '' || /NaN|undefined|Infinity/.test(t) ? null : t;
}

function range(start: string | undefined, end: string | undefined): string | null {
  const a = time(start);
  const b = time(end);
  return a && b ? `${a}–${b}` : null;
}

const HINT = 'Tocca il comando rapido quando ti sdrai.';

/** Frase di stato del sonnellino, sempre senza NaN/undefined. */
export function napSentence(nap: NapState): string {
  switch (nap.status) {
    case 'idle': {
      const p = nap.previous;
      if (!p) return HINT;
      const day = text(p.dayLabel);
      const r = range(p.start, p.end);
      const m = count(p.minutes);
      if (!day || !r) return HINT;
      const total = text(p.total24h);
      const mins = m === null ? '' : ` (${m} min)`;
      const tail = total ? `, con la notte fanno ${total} di sonno nelle 24 ore` : '';
      return `${day}: sonnellino ${r}${mins}${tail}. ${HINT}`;
    }
    case 'run': {
      const s = time(nap.start);
      return s ? `In corso dalle ${s}.` : 'In corso.';
    }
    case 'done': {
      const r = range(nap.start, nap.end);
      const m = count(nap.minutes);
      const parts = [r, m === null ? null : `${m} min`].filter(Boolean);
      return parts.length > 0 ? `Registrato: ${parts.join(', ')}.` : 'Registrato.';
    }
  }
}

function NapCard({ nap, onStart, onStop, onUndo, headingLevel = 3 }: EnergyCardNapProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <section
      className={`card card-yellow card-soft stack ${styles.root}`}
      aria-labelledby={headingId}
      data-variant="nap"
      data-state={nap.status}
    >
      <Heading id={headingId} className={`eyebrow ${styles.heading}`}>
        Sonnellino
      </Heading>
      <p className={styles.text} aria-live="polite">
        {napSentence(nap)}
      </p>
      <div className={styles.actions}>
        {nap.status === 'idle' ? (
          <button type="button" className="btn btn-primary" onClick={onStart}>
            Inizia sonnellino
          </button>
        ) : null}
        {nap.status === 'run' ? (
          <button type="button" className="btn btn-primary" onClick={onStop}>
            Termina
          </button>
        ) : null}
        {nap.status === 'done' ? (
          <>
            <button type="button" className="btn btn-primary" disabled>
              Registrato
            </button>
            <button type="button" className="btn btn-ghost" onClick={onUndo}>
              Annulla
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** Fasi lunari 1–5 (luna nuova, crescente, mezza, gibbosa, piena), come nella preview del design system. */
const MOON_PATHS: Record<1 | 2 | 3 | 4 | 5, string | null> = {
  1: null,
  2: 'M12 2A10 10 0 0 1 12 22A5 10 0 0 0 12 2Z',
  3: 'M12 2A10 10 0 0 1 12 22Z',
  4: 'M12 2A10 10 0 0 1 12 22A5 10 0 0 1 12 2Z',
  5: 'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20',
};

const LEVELS = [1, 2, 3, 4, 5] as const;

/** Voto intero 1–5 o null. */
export function forecastScore(score: number | null): 1 | 2 | 3 | 4 | 5 | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const r = Math.round(score);
  return r >= 1 && r <= 5 ? (r as 1 | 2 | 3 | 4 | 5) : null;
}

function ForecastCard({ score, explanation, nights, minNights, when, coverage }: EnergyCardForecastProps) {
  const n = count(nights) ?? 0;
  const min = count(minNights) ?? FORECAST_MIN_NIGHTS;
  const below = n < min;
  const s = below ? null : forecastScore(score);
  const state = below ? 'sotto-soglia' : s === null ? 'mancante' : 'stimata';
  const whenText = text(when) ?? 'Domani mattina';
  const expl = text(explanation);
  const notti = n === 1 ? 'notte' : 'notti';

  return (
    <section
      className={`card card-yellow card-soft stack ${styles.root}`}
      aria-label="Previsione di energia"
      data-variant="forecast"
      data-state={state}
    >
      <div className="row">
        <span className="badge badge-forecast">Previsione</span>
        <span className={styles.meta}>{whenText}</span>
      </div>
      {below ? (
        <p className={styles.text}>{`Servono almeno ${min} ${min === 1 ? 'notte' : 'notti'}. Per ora ne hai ${n}.`}</p>
      ) : s === null ? (
        <>
          <div className="row">
            <span className="badge badge-missing">Mancante</span>
          </div>
          <p className={styles.text}>{"Per ora non c'è una stima di energia per domani."}</p>
        </>
      ) : (
        <>
          <p className={`big big-md ${styles.big}`}>{`Energia ${s} su 5`}</p>
          <div className={`moons ${styles.moons}`} aria-hidden="true">
            {LEVELS.map((lvl) => {
              const d = MOON_PATHS[lvl];
              const on = lvl === s;
              return (
                <span
                  key={lvl}
                  className={`moon ${styles.moon} ${on ? 'is-on-forecast' : styles.off}`}
                  data-level={lvl}
                >
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="12" r="10" />
                    {d ? <path className="lit" d={d} /> : null}
                  </svg>
                </span>
              );
            })}
          </div>
          <p className={styles.text}>{expl ? `${expl} Stima su ${n} ${notti}.` : `Stima su ${n} ${notti}.`}</p>
        </>
      )}
      {coverage && !below ? (
        <Coverage
          used={coverage.used}
          total={coverage.total}
          estimated={coverage.estimated}
          marks={coverage.marks}
        />
      ) : null}
    </section>
  );
}

export function EnergyCard(props: EnergyCardProps) {
  return props.variant === 'nap' ? <NapCard {...props} /> : <ForecastCard {...props} />;
}
