'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';

import {
  actionNap,
  actionRateNight,
  actionRecordQuestion,
  actionSaveEveningCheck,
  actionSetExceptions,
  type ActionResult,
} from '@/app/actions';
import { EnergyCard, type NapState } from '@/components/EnergyCard';
import { ExceptionChips } from '@/components/ExceptionChips';
import { ListRow } from '@/components/ListRow';
import { QuickQuestion, SKIP_LABEL, normalizeAnswers, progressLabel } from '@/components/QuickQuestion';
import { StatTile } from '@/components/StatTile';
import type { ComparisonRowView, NightView, QuickQuestionView } from '@/server/views';

import styles from './NightSections.module.css';

/**
 * Pagina Notte, parte B: domande rapide, giornata particolare, sonnellino, "il solito" e quattro numeri.
 * Spec: docs/design/system/Schermate.md §Notte. Il guscio fornisce `main#contenuto`: qui niente <main>.
 * Telefono (< 60rem): domande in cima, poi voci `ListRow` che aprono una sezione alla volta con "Indietro".
 * PC (>= 60rem): tutte le sezioni in griglia. Lo scambio telefono/PC è solo CSS (nessun matchMedia).
 * Nessun pulsante pieno qui: l'unico gesto principale della schermata è `Conferma` della scheda Stanotte.
 */

export interface NightSectionsProps {
  view: NightView;
  /** Giorno locale di oggi ('YYYY-MM-DD'): è la data con cui si registrano le domande. */
  todayDate: string;
  /**
   * Avvisa quando su telefono si apre (true) o si chiude (false) una sezione a tutto schermo:
   * la pagina nasconde la scheda Stanotte finché una sezione è aperta. Facoltativa.
   */
  onOpenChange?: (open: boolean) => void;
}

export type SectionKey = 'exceptions' | 'nap' | 'comparison' | 'stats';

/** Unisce le classi scartando quelle assenti (i moduli CSS possono non avere la voce, es. nei test). */
function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export const MAX_VISIBLE_QUESTIONS = 3;
export const BACK_LABEL = 'Indietro';
export const QUESTIONS_LABEL = 'Domande rapide';
export const STATS_TITLE = 'In numeri';
export const GENERIC_ERROR = 'Non sono riuscito a salvare. Riprova tra poco.';
export const EMPTY_FALLBACK = 'Per stanotte non c’è ancora nessun dato. Puoi lasciarla così.';

// --- Logica pura ------------------------------------------------------------------------------

/** Chiave di una domanda: tipo e notte (stessa identità usata dal log delle domande). */
export function questionKey(q: Pick<QuickQuestionView, 'kind' | 'nightDate'>): string {
  return `${q.kind}:${q.nightDate ?? ''}`;
}

/** Le domande del giorno senza doppioni, al massimo tre. */
export function capQuestions(questions: readonly QuickQuestionView[]): QuickQuestionView[] {
  const seen = new Set<string>();
  const out: QuickQuestionView[] = [];
  for (const q of questions) {
    const key = questionKey(q);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === MAX_VISIBLE_QUESTIONS) break;
  }
  return out;
}

/** Slug delle eccezioni attive nella view. */
export function activeSlugs(view: NightView): string[] {
  return view.exceptions.chips.filter((c) => c.active).map((c) => c.slug);
}

/** Insieme corrente dopo un tocco: aggiunge o toglie lo slug, senza doppioni. */
export function toggleSlug(current: readonly string[], slug: string, next: boolean): string[] {
  const without = current.filter((s) => s !== slug);
  return next ? [...without, slug] : without;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Ora locale '07:20' di un istante. */
export function clockOf(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Stato del sonnellino dopo "Termina": minuti arrotondati, mai negativi. */
export function finishNap(start: string, startMs: number | null, nowMs: number): NapState {
  const minutes = startMs === null ? 0 : Math.max(0, Math.round((nowMs - startMs) / 60000));
  return { status: 'done', start, end: clockOf(nowMs), minutes };
}

function toScore(value: string): 1 | 2 | 3 | 4 | 5 | null {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 ? n : null;
}

function recordInput(q: QuickQuestionView, todayDate: string) {
  return {
    date: todayDate,
    kind: q.kind,
    ...(q.nightDate ? { nightDate: q.nightDate } : {}),
    answeredOrSkipped: true,
  };
}

const failed = (): ActionResult => ({ ok: false, error: GENERIC_ERROR });

/** Minuti di sonnellino di una risposta ('0' = Nessuno, '15', ..., '60'): intero 0–600, altrimenti null. */
export function toNapMinutes(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return n <= 600 ? n : null;
}

/**
 * Risposta a una domanda: voti → `actionRateNight`, sonnellino di oggi → `actionSaveEveningCheck`
 * (i minuti; 'Nessuno' = 0, che non crea sonnellini), altre → solo registro della domanda. Mai un'eccezione.
 */
export async function sendAnswer(
  q: QuickQuestionView,
  value: string,
  todayDate: string,
  nightDate: string,
): Promise<ActionResult> {
  try {
    if (q.kind === 'energy' || q.kind === 'quality') {
      const score = toScore(value);
      if (score === null) return failed();
      const target = q.nightDate ?? nightDate;
      const rated = await actionRateNight(
        q.kind === 'energy' ? { nightDate: target, energy: score } : { nightDate: target, quality: score },
      );
      if (!rated.ok) return rated;
      // Il voto è salvato: la domanda risulta risposta (serve al budget del giorno). Se fallisce non è un errore.
      await actionRecordQuestion(recordInput(q, todayDate)).catch(() => undefined);
      return { ok: true };
    }
    if (q.kind === 'nap_today') {
      const minutes = toNapMinutes(value);
      if (minutes === null) return failed();
      const saved = await actionSaveEveningCheck({ date: todayDate, napMinutesToday: minutes });
      if (!saved.ok) return saved;
      // Come per i voti: i minuti sono salvati, la domanda risulta risposta anche se il registro fallisce.
      await actionRecordQuestion(recordInput(q, todayDate)).catch(() => undefined);
      return { ok: true };
    }
    return await actionRecordQuestion(recordInput(q, todayDate));
  } catch {
    return failed();
  }
}

/** `Salta`: la domanda risulta chiusa per oggi, senza conseguenze. */
export async function sendSkip(q: QuickQuestionView, todayDate: string): Promise<ActionResult> {
  try {
    return await actionRecordQuestion(recordInput(q, todayDate));
  } catch {
    return failed();
  }
}

/** Etichette (slug → testo) dei soli imprevisti scelti ora e creati dall'utente: servono al server per salvarli. */
export function labelsFor(
  slugs: readonly string[],
  custom: Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const slug of slugs) {
    const label = custom[slug];
    if (label !== undefined) out[slug] = label;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function sendExceptions(
  nightDate: string,
  slugs: string[],
  labels?: Record<string, string>,
): Promise<ActionResult> {
  try {
    return await actionSetExceptions(labels ? { nightDate, slugs, labels } : { nightDate, slugs });
  } catch {
    return failed();
  }
}

export async function sendNap(action: 'start' | 'stop'): Promise<ActionResult> {
  try {
    const res = await actionNap({ action });
    return res.ok ? { ok: true } : res;
  } catch {
    return failed();
  }
}

/** Riga di sintesi di ogni sezione (telefono). Mai NaN o undefined, mai un dato obbligatorio. */
export function sectionSummaries(
  view: NightView,
  active: readonly string[],
  nap: NapState,
  extraLabels: Readonly<Record<string, string>> = {},
): Record<SectionKey, string> {
  const labelOf = (slug: string) => view.exceptions.chips.find((c) => c.slug === slug)?.label ?? extraLabels[slug] ?? slug;
  const exceptions =
    active.length === 0
      ? 'Nessuna segnata'
      : active.length === 1
        ? `Segnata: ${labelOf(active[0] as string)}`
        : `${active.length} segnate`;
  const napText =
    nap.status === 'run'
      ? `In corso dalle ${nap.start}`
      : nap.status === 'done'
        ? `Registrato · ${nap.minutes} min`
        : 'Comando rapido';
  const first = view.comparison.rows[0];
  const comparison = view.comparison.hidden || !first ? 'Servono più notti' : `${first.label} ${first.text}`;
  const visibleTile = view.stats.find((s) => !s.hidden);
  const stats = visibleTile ? `${visibleTile.label} ${visibleTile.value}` : 'Servono più notti';
  return { exceptions, nap: napText, comparison, stats };
}

// --- Domanda con più di tre risposte ----------------------------------------------------------

/**
 * `QuickQuestion` mostra al massimo tre risposte. I voti 1–5 e i sonnellini ne hanno cinque:
 * stessa scheda (`card qq`, chip da 48px, `Salta` sempre presente), senza tagliare le risposte.
 */
function WideQuestion({
  question,
  answers,
  current,
  total,
  onAnswer,
  onSkip,
}: {
  question: string;
  answers: QuickQuestionView['answers'];
  current: number;
  total: number;
  onAnswer: (value: string) => void;
  onSkip: () => void;
}) {
  const id = useId();
  const qId = `${id}-q`;
  const progress = progressLabel(current, total);
  return (
    <section aria-labelledby={qId} className="card qq">
      {progress ? <p className={cx('eyebrow', styles.flush)}>{progress}</p> : null}
      <p id={qId} className={cx('q', styles.flush)} aria-live="polite" aria-atomic="true">
        {question}
      </p>
      <div role="group" aria-labelledby={qId} className="a">
        {answers.map((a) => (
          <button key={a.value} type="button" className="chip" onClick={() => onAnswer(a.value)}>
            {a.label}
          </button>
        ))}
        <button type="button" className={cx('chip', styles.skip)} onClick={onSkip}>
          {SKIP_LABEL}
        </button>
      </div>
    </section>
  );
}

// --- Confronto con il solito ------------------------------------------------------------------

const validPct = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n);

function ComparisonRow({ row }: { row: ComparisonRowView }) {
  const hasBar = validPct(row.nowPct) || validPct(row.usualPct);
  return (
    <li className={styles.cmpRow}>
      <span className={styles.cmpLabel}>{row.label}</span>
      <span className={styles.cmpText}>{row.text}</span>
      {hasBar ? (
        <span className={cx('track', styles.track)} aria-hidden="true">
          {validPct(row.nowPct) ? <span className="hbar" style={{ left: 0, width: `${row.nowPct}%` }} /> : null}
          {validPct(row.usualPct) ? <span className={styles.usual} style={{ left: `${row.usualPct}%` }} /> : null}
        </span>
      ) : null}
    </li>
  );
}

// --- Componente -------------------------------------------------------------------------------

const IDLE: NapState = { status: 'idle' };

export function NightSections({ view, todayDate, onOpenChange }: NightSectionsProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const [active, setActive] = useState<string[]>(() => activeSlugs(view));
  /** Imprevisti creati qui con `+ Aggiungi` (slug → etichetta) finché il server non li restituisce nella view. */
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [nap, setNap] = useState<NapState>(IDLE);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [seenNight, setSeenNight] = useState(view.nightDate);

  const napBefore = useRef<NapState>(IDLE);
  const napStartMs = useRef<number | null>(null);
  const backRefs = useRef<Partial<Record<SectionKey, HTMLButtonElement | null>>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);

  const comparisonId = useId();
  const statsId = useId();

  // Un'altra notte (cambio di giorno): si riparte dallo stato del server.
  if (seenNight !== view.nightDate) {
    setSeenNight(view.nightDate);
    setActive(activeSlugs(view));
    setCustom({});
    setAnswered(new Set());
    setNap(IDLE);
    setOpenSection(null);
    setError(null);
  }

  // Apertura di una sezione: il focus va su "Indietro". Chiusura: torna all'elenco.
  useEffect(() => {
    if (openSection) {
      backRefs.current[openSection]?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      listRef.current?.focus();
    }
  }, [openSection]);

  // La pagina sa se una sezione è aperta (per nascondere la scheda Stanotte su telefono).
  const isOpen = openSection !== null;
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const setHidden = (key: string, hidden: boolean) =>
    setAnswered((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(key);
      else next.delete(key);
      return next;
    });

  /** Esegue l'azione in una transizione; se fallisce chiama `rollback` e mostra un errore calmo. */
  const run = (task: () => Promise<ActionResult>, rollback: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await task();
      if (!res.ok) {
        rollback();
        setError(res.error || GENERIC_ERROR);
      }
    });
  };

  const capped = capQuestions(view.questions);
  const visible = capped.filter((q) => !answered.has(questionKey(q)));

  const closeQuestion = (q: QuickQuestionView, task: () => Promise<ActionResult>) => {
    const key = questionKey(q);
    setHidden(key, true);
    run(task, () => setHidden(key, false));
  };

  const toggleException = (slug: string, next: boolean) => {
    const before = active;
    const after = toggleSlug(before, slug, next);
    setActive(after);
    run(() => sendExceptions(view.nightDate, after, labelsFor(after, custom)), () => setActive(before));
  };

  /** Nuovo imprevisto libero: chip subito attivo; se il salvataggio fallisce torna com'era. */
  const createException = (item: { id: string; label: string }) => {
    const before = active;
    const beforeCustom = custom;
    const nextCustom = { ...custom, [item.id]: item.label };
    const after = toggleSlug(before, item.id, true);
    setCustom(nextCustom);
    setActive(after);
    run(
      () => sendExceptions(view.nightDate, after, labelsFor(after, nextCustom)),
      () => {
        setActive(before);
        setCustom(beforeCustom);
      },
    );
  };

  const startNap = () => {
    const before = nap;
    const now = Date.now();
    napBefore.current = before;
    napStartMs.current = now;
    setNap({ status: 'run', start: clockOf(now) });
    run(() => sendNap('start'), () => setNap(before));
  };

  const stopNap = () => {
    if (nap.status !== 'run') return;
    const before = nap;
    napBefore.current = before;
    setNap(finishNap(before.start, napStartMs.current, Date.now()));
    run(() => sendNap('stop'), () => setNap(before));
  };

  // "Annulla" ripristina localmente lo stato precedente al comando.
  const undoNap = () => setNap(napBefore.current);

  const open = (key: SectionKey) => () => setOpenSection(key);
  const close = () => setOpenSection(null);

  const serverChips = view.exceptions.chips;
  const chips = [
    ...serverChips,
    ...Object.entries(custom)
      .filter(([slug]) => !serverChips.some((c) => c.slug === slug))
      .map(([slug, label]) => ({ slug, label, uses: 0 })),
  ];
  const hasExceptions = chips.length > 0;
  const summaries = sectionSummaries(view, active, nap, custom);

  const sectionProps = (key: SectionKey) =>
    ({ 'data-section': key, 'data-open': openSection === key ? 'true' : 'false' }) as const;
  const back = (key: SectionKey) => (
    <button
      type="button"
      className={cx('btn', 'btn-ghost', styles.back)}
      onClick={close}
      ref={(el) => {
        backRefs.current[key] = el;
      }}
    >
      {BACK_LABEL}
    </button>
  );

  return (
    <div className={styles.root} aria-busy={pending || undefined}>
      {error ? (
        <p role="alert" className={cx('body', styles.error)}>
          {error}
        </p>
      ) : null}

      {view.empty ? <p className={cx('body', 'muted', styles.note)}>{view.emptyText ?? EMPTY_FALLBACK}</p> : null}

      {visible.length > 0 ? (
        <div role="group" aria-label={QUESTIONS_LABEL} className={styles.questions}>
          {visible.map((q) => {
            const props = {
              question: q.text,
              current: capped.indexOf(q) + 1,
              total: capped.length,
              onAnswer: (value: string) => closeQuestion(q, () => sendAnswer(q, value, todayDate, view.nightDate)),
              onSkip: () => closeQuestion(q, () => sendSkip(q, todayDate)),
            };
            return normalizeAnswers(q.answers).length === q.answers.length ? (
              <QuickQuestion key={questionKey(q)} {...props} answers={q.answers} />
            ) : (
              <WideQuestion key={questionKey(q)} {...props} answers={q.answers} />
            );
          })}
        </div>
      ) : null}

      <div className={styles.list} ref={listRef} tabIndex={-1} data-hidden={openSection !== null ? 'true' : 'false'}>
        {hasExceptions ? (
          <ListRow title="Giornata particolare" summary={summaries.exceptions} accent="peach" onOpen={open('exceptions')} />
        ) : null}
        <ListRow title="Sonnellino" summary={summaries.nap} accent="yellow" onOpen={open('nap')} />
        <ListRow title={view.comparison.title} summary={summaries.comparison} accent="blue" onOpen={open('comparison')} />
        <ListRow title={STATS_TITLE} summary={summaries.stats} accent="sage" onOpen={open('stats')} />
      </div>

      <div className={styles.sections}>
        {hasExceptions ? (
          <div className={styles.section} {...sectionProps('exceptions')}>
            {back('exceptions')}
            <div className={cx('card', styles.card)}>
              <ExceptionChips
                exceptions={chips.map((c) => ({ id: c.slug, label: c.label, uses: c.uses }))}
                active={active}
                onToggle={toggleException}
                onCreate={createException}
              />
            </div>
          </div>
        ) : null}

        <div className={cx(styles.section, styles.nap)} {...sectionProps('nap')}>
          {back('nap')}
          <EnergyCard variant="nap" headingLevel={2} nap={nap} onStart={startNap} onStop={stopNap} onUndo={undoNap} />
        </div>

        <div className={styles.section} {...sectionProps('comparison')}>
          {back('comparison')}
          <section aria-labelledby={comparisonId} className={cx('card', styles.card)}>
            <h2 id={comparisonId} className={cx('title', styles.heading)}>
              {view.comparison.title}
            </h2>
            {view.comparison.hidden || view.comparison.rows.length === 0 ? (
              <p className="body muted">{view.comparison.hiddenText ?? 'Servono più notti per mostrare il tuo solito.'}</p>
            ) : (
              <>
                <ul className={styles.cmpList}>
                  {view.comparison.rows.map((row) => (
                    <ComparisonRow key={row.key} row={row} />
                  ))}
                </ul>
                <p className="caption muted">Barra piena: stanotte. Tratto: il tuo solito.</p>
              </>
            )}
          </section>
        </div>

        <div className={cx(styles.section, styles.stats)} {...sectionProps('stats')}>
          {back('stats')}
          <section aria-labelledby={statsId} className={styles.card}>
            <h2 id={statsId} className={cx('title', styles.heading)}>
              {STATS_TITLE}
            </h2>
            <div className={styles.tiles}>
              {view.stats.map((s) => (
                <div key={s.key} className={styles.tileCell}>
                  <StatTile
                    label={s.label}
                    value={s.hidden ? null : s.value}
                    note={s.note}
                    tone={s.tone}
                    coverage={{ used: s.coverage.used, total: s.coverage.window, marks: s.coverage.marks }}
                  />
                  {s.hidden && s.hiddenText ? <p className="caption muted">{s.hiddenText}</p> : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default NightSections;
