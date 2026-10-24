import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = join(import.meta.dirname, '..', 'public');

type ManifestIcon = { src: string; sizes: string; type: string };
type Manifest = { name: string; display: string; background_color: string; icons: ManifestIcon[] };

const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8')) as Manifest;

describe('manifest.webmanifest', () => {
  it('dichiara nome, display standalone e sfondo bianco', () => {
    expect(manifest.name).toBe('Sleep Tracker');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#ffffff');
  });

  it('dichiara le icone 192 e 512', () => {
    expect(manifest.icons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
  });

  it.each(manifest.icons.map((i) => [i.src, i] as const))('icona %s esiste su disco con le dimensioni dichiarate', (src, icon) => {
    const file = join(publicDir, src);
    expect(existsSync(file)).toBe(true);
    const png = readFileSync(file);
    // Intestazione IHDR del PNG: larghezza e altezza big-endian ai byte 16 e 20.
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  });

  it.each(['apple-touch-icon.png', 'favicon-32.png'])('%s esiste in public/', (name) => {
    expect(existsSync(join(publicDir, name))).toBe(true);
  });
});
