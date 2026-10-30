import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from './manifest';

const publicDir = join(process.cwd(), 'public');

/** Ancho y alto de un PNG, leídos del chunk IHDR. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(join(publicDir, file));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('manifest', () => {
  const m = manifest();

  it('cumple lo necesario para ser instalable', () => {
    expect(m.name).toBe('Macritos');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.lang).toBe('es-AR');
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('tiene íconos de 192 y 512, y uno maskable', () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  });

  it('cada ícono existe y mide lo que declara', () => {
    for (const icon of m.icons ?? []) {
      const [w, h] = (icon.sizes ?? '').split('x').map(Number);
      expect(pngSize((icon.src ?? '').replace(/^\//, '')), icon.src).toEqual({
        width: w,
        height: h,
      });
    }
  });

  it('el ícono de Apple mide 180x180', () => {
    expect(pngSize('icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
  });
});
