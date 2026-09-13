export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = (hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** Rec.709 luma, works on any consistent range. */
export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbToOklab(r: number, g: number, b: number): RGB {
  const lr = LIN[r | 0], lg = LIN[g | 0], lb = LIN[b | 0];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export type Metric = 'rgb' | 'redmean' | 'oklab';

/** Nearest palette colour lookup with a lazily filled 18-bit cache. */
export class PaletteMatcher {
  readonly colors: RGB[];
  private lab: RGB[];
  private cache = new Int16Array(1 << 18).fill(-1);

  constructor(colors: RGB[], readonly metric: Metric = 'redmean') {
    this.colors = colors.length ? colors : [[0, 0, 0], [255, 255, 255]];
    this.lab = this.colors.map((c) => rgbToOklab(c[0], c[1], c[2]));
  }

  nearest(r: number, g: number, b: number): number {
    r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
    g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
    b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const hit = this.cache[key];
    if (hit >= 0) return hit;
    const idx = this.search(r, g, b);
    this.cache[key] = idx;
    return idx;
  }

  private search(r: number, g: number, b: number): number {
    const cols = this.colors;
    let best = 0;
    let bestD = Infinity;
    if (this.metric === 'oklab') {
      const [L, A, B] = rgbToOklab(r, g, b);
      for (let i = 0; i < cols.length; i++) {
        const q = this.lab[i];
        const d = (L - q[0]) ** 2 + (A - q[1]) ** 2 + (B - q[2]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else if (this.metric === 'redmean') {
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const rm = (r + c[0]) / 2;
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }
}

/** Palette sorted from darkest to lightest. */
export function sortByLuma(cols: RGB[]): RGB[] {
  return [...cols].sort((a, b) => luma(a[0], a[1], a[2]) - luma(b[0], b[1], b[2]));
}

/** Samples a colour ramp (sorted palette) at t in 0..1 with linear interpolation. */
export function sampleRamp(ramp: RGB[], t: number, out: number[] = [0, 0, 0], smooth = true): number[] {
  const n = ramp.length;
  if (n === 1) { out[0] = ramp[0][0]; out[1] = ramp[0][1]; out[2] = ramp[0][2]; return out; }
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  if (!smooth) {
    const c = ramp[Math.round(x)];
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    return out;
  }
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  const a = ramp[i], b = ramp[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}
