import type { FImg, Img } from '../core/types';
import { hexToRgb, sortByLuma, type RGB } from '../core/color';

type Spot = (x: number, y: number) => number;

/** Spot functions over a cell, x,y in [-0.5,0.5]. Lower value = inked first. */
export const SPOTS: Record<string, Spot> = {
  round: (x, y) => (x * x + y * y) * 2,
  ellipse: (x, y) => (x * x * 0.7 + y * y * 1.6) * 1.3,
  diamond: (x, y) => Math.abs(x) + Math.abs(y),
  square: (x, y) => Math.max(Math.abs(x), Math.abs(y)) * 2,
  line: (_x, y) => Math.abs(y) * 2,
  cross: (x, y) => Math.min(Math.abs(x), Math.abs(y)) * 2,
};

const cdfCache = new Map<string, Float32Array>();

/** Maps a coverage (0..1, 256 steps) to the spot threshold that inks exactly that area. */
export function spotCdf(shape: string): Float32Array {
  const hit = cdfCache.get(shape);
  if (hit) return hit;
  const spot = SPOTS[shape] || SPOTS.round;
  const N = 96;
  const vals = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) vals[y * N + x] = spot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5);
  vals.sort();
  const cdf = new Float32Array(257);
  for (let k = 0; k <= 256; k++) cdf[k] = vals[Math.min(vals.length - 1, Math.floor((k / 256) * (vals.length - 1)))];
  cdfCache.set(shape, cdf);
  return cdf;
}

interface Screen {
  angle: number;
  ox: number;
  oy: number;
  tone: (r: number, g: number, b: number) => number; // coverage 0..1
}

/**
 * Renders an AM halftone at output resolution.
 * `sample` covers the full frame at any resolution and is sampled bilinearly at dot centres.
 */
export function renderHalftone(sample: FImg, W: number, H: number, s: Record<string, any>, palette: RGB[], scale: number): Img {
  const out = new Uint8ClampedArray(W * H * 4);
  const cell = Math.max(1.5, (s.cellSize || 8) * scale);
  const shape = s.shape || 'round';
  const spot = SPOTS[shape] || SPOTS.round;
  const cdf = spotCdf(shape);
  const gain = s.dotGain ?? 1;
  const aa = Math.max(1e-3, ((s.softness ?? 1) * 1.2) / cell);
  const base = ((s.angle ?? 45) * Math.PI) / 180;
  const mis = (s.misregister || 0) * scale;
  const mode = s.colorMode || 'cmyk';
  const gcr = s.gcr ?? 0.7;

  const sorted = sortByLuma(palette.length ? palette : [[0, 0, 0], [255, 255, 255]]);
  const paper = mode === 'mono' && s.usePalette ? sorted[sorted.length - 1] : hexToRgb(s.paperColor || '#f1ead8');
  const ink = mode === 'mono' && s.usePalette ? sorted[0] : hexToRgb(s.inkColor || '#1c1a18');

  const deg = Math.PI / 180;
  let screens: Screen[];
  let inks: RGB[];
  if (mode === 'mono') {
    screens = [{ angle: base, ox: 0, oy: 0, tone: (r, g, b) => 1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) }];
    inks = [ink];
  } else if (mode === 'rgb') {
    screens = [
      { angle: base + 15 * deg - 45 * deg, ox: mis, oy: 0, tone: (r) => r },
      { angle: base + 75 * deg - 45 * deg, ox: 0, oy: mis, tone: (_r, g) => g },
      { angle: base - 45 * deg, ox: -mis, oy: -mis * 0.5, tone: (_r, _g, b) => b },
    ];
    inks = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
  } else {
    const kOf = (r: number, g: number, b: number) => gcr * (1 - Math.max(r, g, b));
    const chan = (v: number, r: number, g: number, b: number) => {
      const k = kOf(r, g, b);
      return k >= 0.999 ? 0 : (1 - v - k) / (1 - k);
    };
    screens = [
      { angle: base + 15 * deg - 45 * deg, ox: mis, oy: 0, tone: (r, g, b) => chan(r, r, g, b) },
      { angle: base + 75 * deg - 45 * deg, ox: 0, oy: mis, tone: (r, g, b) => chan(g, r, g, b) },
      { angle: base + 0 * deg - 45 * deg, ox: -mis, oy: -mis * 0.5, tone: (r, g, b) => chan(b, r, g, b) },
      { angle: base, ox: 0, oy: 0, tone: (r, g, b) => kOf(r, g, b) },
    ];
    inks = [[0, 174, 239], [236, 0, 140], [255, 242, 0], [35, 31, 32]];
  }

  const sw = sample.w, sh = sample.h, sd = sample.d;
  const sx = sw / W, sy = sh / H;
  const px = new Float32Array(4);
  const bilinear = (x: number, y: number) => {
    const fx = Math.max(0, Math.min(sw - 1, x * sx - 0.5));
    const fy = Math.max(0, Math.min(sh - 1, y * sy - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
    const ax = fx - x0, ay = fy - y0;
    for (let c = 0; c < 4; c++) {
      const a = sd[(y0 * sw + x0) * 4 + c], b = sd[(y0 * sw + x1) * 4 + c];
      const d = sd[(y1 * sw + x0) * 4 + c], e = sd[(y1 * sw + x1) * 4 + c];
      px[c] = (a + (b - a) * ax) * (1 - ay) + (d + (e - d) * ax) * ay;
    }
  };

  // Accumulate: additive for RGB, multiplicative for inks on paper.
  const acc = new Float32Array(W * H * 3);
  if (mode === 'rgb') acc.fill(0);
  else for (let i = 0; i < W * H; i++) { acc[i * 3] = paper[0] / 255; acc[i * 3 + 1] = paper[1] / 255; acc[i * 3 + 2] = paper[2] / 255; }

  for (let si = 0; si < screens.length; si++) {
    const sc = screens[si];
    const ca = Math.cos(sc.angle), sa = Math.sin(sc.angle);
    const inkC = inks[si];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const X = x + 0.5 - sc.ox, Y = y + 0.5 - sc.oy;
        const u = (X * ca + Y * sa) / cell;
        const v = (-X * sa + Y * ca) / cell;
        const cu = Math.floor(u) + 0.5, cv = Math.floor(v) + 0.5;
        const lu = u - cu, lv = v - cv;
        // Cell centre back in image space
        const cx = (cu * ca - cv * sa) * cell + sc.ox;
        const cy = (cu * sa + cv * ca) * cell + sc.oy;
        bilinear(cx, cy);
        let cov = sc.tone(px[0], px[1], px[2]) * gain;
        const i = y * W + x;
        let inked: number;
        if (cov <= 0.002) inked = 0;
        else if (cov >= 0.998) inked = 1;
        else {
          const thr = cdf[Math.round(cov * 256)];
          const sv = spot(lu, lv);
          inked = (thr - sv) / aa + 0.5;
          inked = inked < 0 ? 0 : inked > 1 ? 1 : inked;
        }
        if (mode === 'rgb') {
          acc[i * 3] += (inkC[0] / 255) * inked;
          acc[i * 3 + 1] += (inkC[1] / 255) * inked;
          acc[i * 3 + 2] += (inkC[2] / 255) * inked;
        } else {
          acc[i * 3] *= 1 - inked + (inkC[0] / 255) * inked;
          acc[i * 3 + 1] *= 1 - inked + (inkC[1] / 255) * inked;
          acc[i * 3 + 2] *= 1 - inked + (inkC[2] / 255) * inked;
        }
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = acc[i * 3] * 255;
    out[i * 4 + 1] = acc[i * 3 + 1] * 255;
    out[i * 4 + 2] = acc[i * 3 + 2] * 255;
    out[i * 4 + 3] = 255;
  }
  return { w: W, h: H, data: out };
}
