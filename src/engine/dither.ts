import type { FImg } from '../core/types';
import { PaletteMatcher, sortByLuma, type RGB, type Metric } from '../core/color';
import { bayer, blueNoise, clusterDot, hash2, ign, tri, type ThresholdMap } from '../core/noise';

type Tap = [dx: number, dy: number, w: number];
interface Kernel { div: number; taps: Tap[] }

export const KERNELS: Record<string, Kernel> = {
  fs: { div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  ffs: { div: 8, taps: [[1, 0, 3], [0, 1, 3], [1, 1, 2]] },
  jjn: { div: 48, taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
  stucki: { div: 42, taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  burkes: { div: 32, taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
  sierra3: { div: 32, taps: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]] },
  sierra2: { div: 16, taps: [[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]] },
  sierralite: { div: 4, taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
  atkinson: { div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  stevenson: { div: 200, taps: [[2, 0, 32], [-3, 1, 12], [-1, 1, 26], [1, 1, 30], [3, 1, 16], [-2, 2, 12], [0, 2, 26], [2, 2, 12], [-3, 3, 5], [-1, 3, 12], [1, 3, 12], [3, 3, 5]] },
  shiaufan: { div: 8, taps: [[1, 0, 4], [-2, 1, 1], [-1, 1, 1], [0, 1, 2]] },
  shiaufan2: { div: 16, taps: [[1, 0, 8], [-3, 1, 1], [-2, 1, 1], [-1, 1, 2], [0, 1, 4]] },
  fan: { div: 16, taps: [[1, 0, 7], [-2, 1, 1], [-1, 1, 3], [0, 1, 5]] },
  row: { div: 1, taps: [[1, 0, 1]] },
  column: { div: 1, taps: [[0, 1, 1]] },
};

export interface DitherContext {
  palette: RGB[];
  time: number;
  frame: number;
}

/** Quantizer: reads `inp` (ch values 0..1), writes quantized values to `q` and records a code for pixel i. */
type Quant = (i: number, x: number, y: number, inp: Float32Array, q: Float32Array) => void;

/**
 * Dithers a grid image. Returns RGBA 8-bit at the same resolution.
 */
export function ditherGrid(img: FImg, s: Record<string, any>, ctx: DitherContext): Uint8ClampedArray {
  const { w, h, d } = img;
  const n = w * h;
  const out = new Uint8ClampedArray(n * 4);
  const pal: RGB[] = ctx.palette.length ? ctx.palette : [[0, 0, 0], [255, 255, 255]];
  const ramp = sortByLuma(pal);
  const mode: string = s.colorMode || 'palette';
  const alg: string = s.algorithm || 'ed:fs';
  const strength = s.strength ?? 1;
  const bias = s.threshold ?? 0;
  const noiseAmt = s.noise ?? 0;
  const scalar = mode === 'ramp' || mode === 'source';
  const ch = scalar ? 1 : 3;

  // Working buffer
  const buf = new Float32Array(n * ch);
  if (scalar) {
    for (let i = 0; i < n; i++) buf[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  } else {
    for (let i = 0; i < n; i++) { buf[i * 3] = d[i * 4]; buf[i * 3 + 1] = d[i * 4 + 1]; buf[i * 3 + 2] = d[i * 4 + 2]; }
  }

  const codes = new Int16Array(n); // palette/ramp index, or -1 when colour written directly
  const L = mode === 'ramp' ? ramp.length : mode === 'source' ? 2 : Math.max(2, s.levels | 0);
  const Lm = L - 1;
  const matcher = mode === 'palette' ? new PaletteMatcher(pal, (s.metric || 'redmean') as Metric) : null;
  const noiseAt = (x: number, y: number) => (noiseAmt > 0 ? (hash2(x, y, 911) - 0.5) * noiseAmt : 0);

  if (alg.startsWith('ed:')) {
    const name = alg.slice(3);
    let quant: Quant;
    if (scalar) {
      quant = (i, x, y, inp, q) => {
        let k = Math.round((inp[0] + bias + noiseAt(x, y)) * Lm);
        k = k < 0 ? 0 : k > Lm ? Lm : k;
        codes[i] = k;
        q[0] = k / Lm;
      };
    } else if (matcher) {
      quant = (i, x, y, inp, q) => {
        const nz = bias + noiseAt(x, y);
        const k = matcher.nearest((inp[0] + nz) * 255, (inp[1] + nz) * 255, (inp[2] + nz) * 255);
        codes[i] = k;
        const c = pal[k];
        q[0] = c[0] / 255; q[1] = c[1] / 255; q[2] = c[2] / 255;
      };
    } else {
      quant = (i, x, y, inp, q) => {
        const nz = bias + noiseAt(x, y);
        for (let c = 0; c < 3; c++) {
          let k = Math.round((inp[c] + nz) * Lm);
          k = k < 0 ? 0 : k > Lm ? Lm : k;
          q[c] = k / Lm;
        }
        codes[i] = -1;
      };
    }
    if (name === 'riemersma') riemersma(buf, w, h, ch, strength, quant);
    else {
      let kernel = KERNELS[name];
      if (name === 'glitch') {
        const k = Math.max(2, Math.round(s.period || 6));
        kernel = { div: 12, taps: [[1, 0, 4], [k, 0, 3], [1 - k, 1, 2], [0, 1, 3]] };
      }
      // Quantized values are written back into buf (used directly by RGB levels mode).
      errorDiffuse(buf, w, h, ch, kernel || KERNELS.fs, s.serpentine !== false, strength, s.errorClamp ?? 2, quant);
    }
  } else {
    const T = thresholdMap(alg, w, h, s, scalar ? buf : null, img, ctx.time);
    const spread = paletteSpread(pal);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = (T[i] - 0.5) * strength;
        const nz = bias + noiseAt(x, y);
        if (scalar) {
          let k = Math.floor((buf[i] + nz) * Lm + 0.5 + t);
          k = k < 0 ? 0 : k > Lm ? Lm : k;
          codes[i] = k;
        } else if (matcher) {
          const off = (t * spread + nz) * 255;
          codes[i] = matcher.nearest(buf[i * 3] * 255 + off, buf[i * 3 + 1] * 255 + off, buf[i * 3 + 2] * 255 + off);
        } else {
          for (let c = 0; c < 3; c++) {
            let k = Math.floor((buf[i * 3 + c] + nz) * Lm + 0.5 + t);
            k = k < 0 ? 0 : k > Lm ? Lm : k;
            buf[i * 3 + c] = k / Lm;
          }
          codes[i] = -1;
        }
      }
  }

  // Resolve colours
  const transparent: string = s.transparent || 'none';
  const tColor = transparent === 'darkest' ? ramp[0] : transparent === 'lightest' ? ramp[ramp.length - 1] : null;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r: number, g: number, b: number;
    if (mode === 'ramp') {
      const c = ramp[codes[i]]; r = c[0]; g = c[1]; b = c[2];
    } else if (mode === 'source') {
      if (codes[i] > 0) { r = d[o] * 255; g = d[o + 1] * 255; b = d[o + 2] * 255; }
      else { const c = ramp[0]; r = c[0]; g = c[1]; b = c[2]; }
    } else if (matcher) {
      const c = pal[codes[i]]; r = c[0]; g = c[1]; b = c[2];
    } else {
      r = buf[i * 3] * 255; g = buf[i * 3 + 1] * 255; b = buf[i * 3 + 2] * 255;
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
    let a = d[o + 3] < 0.5 ? 0 : 255;
    if (tColor && Math.round(r) === tColor[0] && Math.round(g) === tColor[1] && Math.round(b) === tColor[2]) a = 0;
    out[o + 3] = a;
  }
  return out;
}

/** Threshold offset amplitude for ordered palette dithering: mean nearest-neighbour distance per channel. */
function paletteSpread(pal: RGB[]): number {
  if (pal.length < 2) return 1;
  let sum = 0;
  for (let i = 0; i < pal.length; i++) {
    let best = Infinity;
    for (let j = 0; j < pal.length; j++) {
      if (i === j) continue;
      const d = (pal[i][0] - pal[j][0]) ** 2 + (pal[i][1] - pal[j][1]) ** 2 + (pal[i][2] - pal[j][2]) ** 2;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return Math.max(0.05, Math.min(1, sum / pal.length / (255 * Math.sqrt(3))));
}

function errorDiffuse(buf: Float32Array, w: number, h: number, ch: number, kernel: Kernel, serpentine: boolean, strength: number, clampE: number, quant: Quant): void {
  const inp = new Float32Array(3);
  const q = new Float32Array(3);
  const taps = kernel.taps;
  const nt = taps.length;
  const div = kernel.div;
  for (let y = 0; y < h; y++) {
    const rev = serpentine && (y & 1) === 1;
    for (let xi = 0; xi < w; xi++) {
      const x = rev ? w - 1 - xi : xi;
      const i = y * w + x;
      for (let c = 0; c < ch; c++) inp[c] = buf[i * ch + c];
      quant(i, x, y, inp, q);
      for (let c = 0; c < ch; c++) {
        let err = (inp[c] - q[c]) * strength;
        err = err > clampE ? clampE : err < -clampE ? -clampE : err;
        buf[i * ch + c] = q[c];
        if (err === 0) continue;
        for (let t = 0; t < nt; t++) {
          const tp = taps[t];
          const xx = x + (rev ? -tp[0] : tp[0]);
          const yy = y + tp[1];
          if (xx < 0 || xx >= w || yy >= h) continue;
          buf[(yy * w + xx) * ch + c] += (err * tp[2]) / div;
        }
      }
    }
  }
}

function hilbertD2XY(n: number, d: number, out: Int32Array): void {
  let rx: number, ry: number, t = d;
  let x = 0, y = 0;
  for (let s = 1; s < n; s *= 2) {
    rx = 1 & (t / 2);
    ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      const tmp = x; x = y; y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  out[0] = x; out[1] = y;
}

/** Riemersma dithering: error diffusion along a Hilbert curve with an exponentially decaying queue. */
function riemersma(buf: Float32Array, w: number, h: number, ch: number, strength: number, quant: Quant): void {
  // Weights as in Riemersma's reference: geometric ramp 1..16, newest entry heaviest, divided by 16.
  const Q = 16;
  const MAX = 16;
  const weights = new Float32Array(Q);
  const m = Math.exp(Math.log(MAX) / (Q - 1));
  for (let i = 0, v = 1; i < Q; i++, v *= m) weights[i] = (v + 0.5) / MAX;
  const errs = new Float32Array(Q * ch);
  let head = 0;
  let n = 1;
  while (n < Math.max(w, h)) n *= 2;
  const p = new Int32Array(2);
  const inp = new Float32Array(3);
  const q = new Float32Array(3);
  const total = n * n;
  for (let d = 0; d < total; d++) {
    hilbertD2XY(n, d, p);
    const x = p[0], y = p[1];
    if (x >= w || y >= h) continue;
    const i = y * w + x;
    // Queue is ordered oldest (head) to newest (head-1).
    for (let c = 0; c < ch; c++) {
      let acc = 0;
      for (let k = 0; k < Q; k++) acc += errs[((head + k) % Q) * ch + c] * weights[k];
      inp[c] = buf[i * ch + c] + acc * strength;
    }
    quant(i, x, y, inp, q);
    // Error of the original value (not the compensated one) keeps the queue stable.
    for (let c = 0; c < ch; c++) {
      errs[head * ch + c] = buf[i * ch + c] - q[c];
      buf[i * ch + c] = q[c];
    }
    head = (head + 1) % Q;
  }
}

function mapFor(alg: string): ThresholdMap | null {
  switch (alg) {
    case 'ord:bayer2': return bayer(2);
    case 'ord:bayer4': return bayer(4);
    case 'ord:bayer8': return bayer(8);
    case 'ord:bayer16': return bayer(16);
    case 'ord:cluster4': return clusterDot(4);
    case 'ord:cluster8': return clusterDot(8);
    case 'ord:bluenoise': return blueNoise(64);
    default: return null;
  }
}

/** Builds a per-pixel threshold map in [0,1) for ordered and pattern algorithms. */
export function thresholdMap(alg: string, w: number, h: number, s: Record<string, any>, lumBuf: Float32Array | null, img: FImg, time: number): Float32Array {
  const T = new Float32Array(w * h);
  if (alg === 'thr:threshold') { T.fill(0.5); return T; }
  const a = ((s.angle || 0) * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const speed = s.speed || 0;

  if (alg.startsWith('ord:')) {
    const map = mapFor(alg);
    const ms = Math.max(1, s.matrixScale | 0);
    const drift = time * speed * (map ? map.size : 8) * ms;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = Math.floor((x * ca + y * sa + drift) / ms);
        const v = Math.floor((-x * sa + y * ca) / ms);
        let t: number;
        if (map) {
          const sz = map.size;
          t = map.data[(((v % sz) + sz) % sz) * sz + (((u % sz) + sz) % sz)];
        } else if (alg === 'ord:ign') t = ign(u, v);
        else t = hash2(u, v, 3);
        T[y * w + x] = t;
      }
    return T;
  }

  const p = Math.max(1, s.period || 6);
  const mod = s.modulation ?? 1;
  const ph = (s.phase || 0) + time * speed;
  const cx = w / 2, cy = h / 2;
  const b4 = bayer(4);
  const lum = (i: number) => (lumBuf ? lumBuf[i] : 0.2126 * img.d[i * 4] + 0.7152 * img.d[i * 4 + 1] + 0.0722 * img.d[i * 4 + 2]);
  const fr = Math.floor(ph * 8);

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const xc = x - cx, yc = y - cy;
      const u = xc * ca + yc * sa;
      const v = -xc * sa + yc * ca;
      let t = 0.5;
      switch (alg) {
        case 'pat:lines':
          t = tri(v / p + ph);
          break;
        case 'pat:crosshatch': {
          const inkA = 1 - tri(v / p + ph);
          const inkB = 0.5 * (1 - tri(u / p + ph));
          t = 1 - Math.max(inkA, inkB);
          break;
        }
        case 'pat:dots':
          t = 0.5 - (Math.cos((2 * Math.PI * u) / p) + Math.cos((2 * Math.PI * v) / p)) / 4;
          break;
        case 'pat:waves': {
          const vv = v + mod * p * 0.6 * Math.sin((2 * Math.PI * u) / (p * 6) + ph * 2 * Math.PI);
          t = tri(vv / p);
          break;
        }
        case 'pat:modulation': {
          const vv = v + mod * p * 2 * lum(i);
          t = tri(vv / p + ph);
          break;
        }
        case 'pat:rings':
          t = tri(Math.hypot(xc, yc) / p - ph);
          break;
        case 'pat:spiral': {
          const th = Math.atan2(yc, xc) / (2 * Math.PI);
          t = tri(Math.hypot(xc, yc) / p + th * Math.max(1, Math.round(mod * 3)) - ph);
          break;
        }
        case 'pat:checker': {
          const c = (Math.floor(u / p + ph) + Math.floor(v / p)) & 1;
          const bb = b4.data[((y & 3) << 2) | (x & 3)];
          t = c ? 0.5 + bb * 0.5 : bb * 0.5;
          break;
        }
        case 'pat:diamond': {
          const fu = u / p + ph, fv = v / p;
          t = Math.abs(fu - Math.floor(fu) - 0.5) + Math.abs(fv - Math.floor(fv) - 0.5);
          break;
        }
        case 'pat:jitter': {
          const row = Math.floor(v / p);
          const seg = Math.floor((u + (hash2(row, 0, fr) - 0.5) * p * 6) / (p * 3));
          t = tri(v / p + (hash2(seg, row, fr) - 0.5) * 0.35 * mod);
          break;
        }
        case 'pat:glitchbitmap': {
          const band = Math.floor(y / Math.max(1, p / 2));
          const shift = Math.floor((hash2(band, 1, fr) - 0.5) * mod * p * 8);
          const xs = x + shift;
          const bb = b4.data[((y & 3) << 2) | (((xs % 4) + 4) % 4)];
          const blk = hash2(Math.floor(xs / (p * 2)), band, fr);
          const z = bb + blk * 0.35 * mod;
          t = z - Math.floor(z);
          break;
        }
      }
      T[i] = t;
    }
  return T;
}
