// Copia i file del design system da docs/design/ nell'app, così restano allineati alla sorgente.
// Non modificare a mano i file copiati: cambia la sorgente e rilancia `npm run sync:design`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(appDir, '..', 'docs', 'design');

/** Coppie [sorgente in docs/design, destinazione in app]. Usate anche dal test di allineamento. */
export const DESIGN_FILES = [
  ['tokens.css', 'src/styles/tokens.css'],
  ['system/components/bundle.css', 'src/styles/bundle.css'],
  ['logo/apple-touch-icon.png', 'public/apple-touch-icon.png'],
  ['logo/favicon-32.png', 'public/favicon-32.png'],
  ['logo/icon-192.png', 'public/icon-192.png'],
  ['logo/icon-512.png', 'public/icon-512.png'],
  ['logo/apple-touch-icon-dark.png', 'public/apple-touch-icon-dark.png'],
  ['logo/favicon-32-dark.png', 'public/favicon-32-dark.png'],
  ['logo/icon-192-dark.png', 'public/icon-192-dark.png'],
  ['logo/icon-512-dark.png', 'public/icon-512-dark.png'],
  ['logo/mark.svg', 'public/mark.svg'],
];

export function designPaths([from, to]) {
  return { source: join(docsDir, from), target: join(appDir, to) };
}

function main() {
  for (const pair of DESIGN_FILES) {
    const { source, target } = designPaths(pair);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    console.log(`${relative(appDir, source)} -> ${relative(appDir, target)}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
