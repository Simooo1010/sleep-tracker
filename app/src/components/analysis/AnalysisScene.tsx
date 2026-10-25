import type { ReactElement } from 'react';

import type { AnalysisSceneProps, SceneKey } from '../../server/views/analysis-types';
import { cx } from '../chartGeometry';
import styles from './AnalysisScene.module.css';

/**
 * AnalysisScene: illustrazione vettoriale del periodo, scelta dalla SceneKey.
 * Tutto SVG inline (nitido a ogni DPR), colori solo da tokens.css via classi del modulo.
 * Movimento leggero solo con transform/opacity; con prefers-reduced-motion resta ferma.
 */

/** Descrizione di riserva se il view model non fornisce un'etichetta utilizzabile. */
export const SCENE_FALLBACK_LABEL: Record<SceneKey, string> = {
  recupero: "Un'alba che sorge sotto una luna calante: il sonno si sta recuperando.",
  regolare: 'Luna piena e stelle ordinate: notti regolari.',
  debito: 'Luna bassa tra nuvole pesanti e stelle sbiadite: sonno in debito.',
  deriva: "Luna e stelle che scivolano di lato accanto a un orologio: l'orario si sta spostando.",
  'pochi-dati': 'Cielo tenue con punti vuoti: i dati sono ancora pochi.',
};

const SCENE_KEYS: readonly SceneKey[] = ['recupero', 'regolare', 'debito', 'deriva', 'pochi-dati'];

function sceneKeyOf(k: unknown): SceneKey {
  return SCENE_KEYS.includes(k as SceneKey) ? (k as SceneKey) : 'pochi-dati';
}

function labelOf(label: unknown, key: SceneKey): string {
  if (typeof label !== 'string') return SCENE_FALLBACK_LABEL[key];
  const t = label.trim();
  return t === '' || /NaN|undefined|Infinity/.test(t) ? SCENE_FALLBACK_LABEL[key] : t;
}

/** Stella a quattro punte centrata in (x, y), raggio r. */
function star(x: number, y: number, r: number): string {
  const k = r * 0.28;
  return `M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`;
}

function Stars({ points, className }: { points: ReadonlyArray<readonly [number, number, number]>; className?: string }) {
  return (
    <g className={className}>
      {points.map(([x, y, r], i) => (
        <path key={i} d={star(x, y, r)} className={cx(styles.star, styles[`tw${(i % 3) + 1}`])} />
      ))}
    </g>
  );
}

function Recupero() {
  return (
    <>
      <rect className={styles.skyDawn} x="0" y="0" width="320" height="180" />
      <Stars points={[[40, 34, 4], [92, 22, 3], [250, 30, 3.5], [282, 64, 3]]} />
      {/* Luna calante in alto a sinistra: un cerchio scavato da un secondo cerchio. */}
      <path className={styles.moon} d="M70 46a24 24 0 1 0 0 48a30 30 0 0 1 0-48z" />
      <g className={styles.sunRise}>
        <circle className={styles.sun} cx="190" cy="150" r="34" />
        <g className={styles.rays}>
          <path d="M190 102v-12M150 116l-8-8M230 116l8-8" />
        </g>
      </g>
      <path className={styles.hill} d="M0 150c60-20 120-24 180-14s100 6 140-6v50H0z" />
    </>
  );
}

function Regolare() {
  const grid: Array<readonly [number, number, number]> = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) grid.push([30 + col * 34, 34 + row * 38, 3.5]);
  }
  return (
    <>
      <rect className={styles.sky} x="0" y="0" width="320" height="180" />
      <Stars points={grid} />
      <circle className={styles.moonFull} cx="250" cy="80" r="40" />
      <circle className={styles.crater} cx="238" cy="68" r="7" />
      <circle className={styles.crater} cx="262" cy="96" r="5" />
      <path className={styles.hill} d="M0 158c80-10 160-10 320 0v22H0z" />
    </>
  );
}

function Debito() {
  return (
    <>
      <rect className={styles.skyDim} x="0" y="0" width="320" height="180" />
      <Stars className={styles.faded} points={[[36, 30, 3], [118, 18, 2.5], [210, 26, 3], [288, 40, 2.5]]} />
      <circle className={styles.moonLow} cx="96" cy="138" r="26" />
      <g className={styles.cloudSlow}>
        <path className={styles.cloud} d="M40 120a20 20 0 0 1 36-12a24 24 0 0 1 44 8a16 16 0 0 1 4 32H44a18 18 0 0 1-4-28z" />
      </g>
      <g className={styles.cloudSlower}>
        <path className={styles.cloudHeavy} d="M170 90a24 24 0 0 1 42-14a28 28 0 0 1 52 10a18 18 0 0 1 4 36H176a20 20 0 0 1-6-32z" />
      </g>
      <path className={styles.hill} d="M0 160c80-8 160-8 320 0v20H0z" />
    </>
  );
}

function Deriva() {
  return (
    <>
      <rect className={styles.sky} x="0" y="0" width="320" height="180" />
      <g className={styles.drift}>
        <Stars points={[[150, 40, 3.5], [196, 28, 3], [236, 54, 3.5], [276, 34, 3], [214, 92, 2.5]]} />
        <path className={styles.moon} d="M262 70a26 26 0 1 0 0 52a32 32 0 0 1 0-52z" />
        <path className={styles.trail} d="M140 112h-60M150 128h-80M140 144h-50" />
      </g>
      {/* Orologio: quadrante e lancette, solo tratto. */}
      <g className={styles.clock}>
        <circle cx="62" cy="62" r="30" />
        <path d="M62 44v18l12 8" />
      </g>
      <path className={styles.hill} d="M0 162c80-6 160-6 320 0v18H0z" />
    </>
  );
}

function PochiDati() {
  const empty: Array<readonly [number, number]> = [
    [44, 46],
    [100, 30],
    [160, 52],
    [220, 32],
    [276, 50],
    [72, 96],
    [132, 108],
    [192, 94],
    [252, 106],
  ];
  return (
    <>
      <rect className={styles.skyFaint} x="0" y="0" width="320" height="180" />
      <g className={styles.fadeIn}>
        {empty.map(([x, y], i) => (
          <circle key={i} className={styles.emptyDot} cx={x} cy={y} r="6" />
        ))}
      </g>
      <path className={styles.hillFaint} d="M0 160c80-8 160-8 320 0v20H0z" />
    </>
  );
}

const SCENES: Record<SceneKey, () => ReactElement> = {
  recupero: Recupero,
  regolare: Regolare,
  debito: Debito,
  deriva: Deriva,
  'pochi-dati': PochiDati,
};

export function AnalysisScene({ scene }: AnalysisSceneProps) {
  const key = sceneKeyOf(scene?.key);
  const label = labelOf(scene?.label, key);
  const Scene = SCENES[key];
  return (
    <div className={styles.root} data-scene={key}>
      <svg
        className={styles.svg}
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="geometricPrecision"
        role="img"
        aria-label={label}
        focusable="false"
      >
        <title>{label}</title>
        <Scene />
      </svg>
    </div>
  );
}

export default AnalysisScene;
