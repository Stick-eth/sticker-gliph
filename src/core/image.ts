import type { FImg, Img } from './types';

interface Taps {
  idx: Int32Array;
  wt: Float32Array;
  start: Int32Array; // per destination sample, offset into idx/wt
  count: Int32Array;
}

/** Precomputes area-average (downscale) or bilinear (upscale) taps for one axis. */
function taps(src: number, dst: number): Taps {
  const scale = src / dst;
  const idx: number[] = [];
  const wt: number[] = [];
  const start = new Int32Array(dst);
  const count = new Int32Array(dst);
  for (let d = 0; d < dst; d++) {
    start[d] = idx.length;
    if (scale >= 1) {
      const x0 = d * scale, x1 = (d + 1) * scale;
      let sum = 0;
      for (let s = Math.floor(x0); s < Math.ceil(x1); s++) {
        const w = Math.min(s + 1, x1) - Math.max(s, x0);
        if (w <= 0) continue;
        idx.push(Math.min(src - 1, s));
        wt.push(w);
        sum += w;
      }
      for (let k = start[d]; k < idx.length; k++) wt[k] /= sum;
    } else {
      const x = Math.max(0, Math.min(src - 1, (d + 0.5) * scale - 0.5));
      const i = Math.floor(x);
      const f = x - i;
      idx.push(i); wt.push(1 - f);
      idx.push(Math.min(src - 1, i + 1)); wt.push(f);
    }
    count[d] = idx.length - start[d];
  }
  return { idx: Int32Array.from(idx), wt: Float32Array.from(wt), start, count };
}

/**
 * Resamples an 8-bit RGBA image to dw x dh with premultiplied alpha.
 * Area average when shrinking, bilinear when enlarging. Output is straight alpha 0..1.
 */
export function resampleRGBA(src: Img, dw: number, dh: number): FImg {
  const { w: sw, h: sh, data } = src;
  dw = Math.max(1, Math.round(dw));
  dh = Math.max(1, Math.round(dh));
  const tx = taps(sw, dw);
  const ty = taps(sh, dh);
  const mid = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const row = y * sw;
    const orow = y * dw;
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const s0 = tx.start[x], n = tx.count[x];
      for (let k = s0; k < s0 + n; k++) {
        const o = (row + tx.idx[k]) * 4;
        const al = data[o + 3] * tx.wt[k];
        r += data[o] * al; g += data[o + 1] * al; b += data[o + 2] * al; a += al;
      }
      const o = (orow + x) * 4;
      mid[o] = r; mid[o + 1] = g; mid[o + 2] = b; mid[o + 3] = a;
    }
  }
  const out = new Float32Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const s0 = ty.start[y], n = ty.count[y];
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = s0; k < s0 + n; k++) {
        const o = (ty.idx[k] * dw + x) * 4;
        const w = ty.wt[k];
        r += mid[o] * w; g += mid[o + 1] * w; b += mid[o + 2] * w; a += mid[o + 3] * w;
      }
      const o = (y * dw + x) * 4;
      if (a > 1e-6) {
        const inv = 1 / (a * 255);
        out[o] = r * inv; out[o + 1] = g * inv; out[o + 2] = b * inv;
      }
      out[o + 3] = a / 255;
    }
  }
  return { w: dw, h: dh, d: out };
}

/** In-place box blur on an interleaved float buffer, `passes` iterations approximate a gaussian. */
export function boxBlurF(buf: Float32Array, w: number, h: number, ch: number, radius: number, passes = 3, chans = ch): void {
  const r = Math.round(radius);
  if (r < 1) return;
  const n = w * h;
  const plane = new Float32Array(n);
  const tmp = new Float32Array(n);
  const colAcc = new Float32Array(w);
  const addX = new Int32Array(w), subX = new Int32Array(w);
  for (let x = 0; x < w; x++) { addX[x] = Math.min(w - 1, x + r + 1); subX[x] = Math.max(0, x - r); }
  const inv = 1 / (2 * r + 1);
  for (let c = 0; c < chans; c++) {
    for (let i = 0; i < n; i++) plane[i] = buf[i * ch + c];
    for (let p = 0; p < passes; p++) {
      // Horizontal: plane -> tmp
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = plane[row] * (r + 1);
        for (let k = 1; k <= r; k++) acc += plane[row + Math.min(k, w - 1)];
        for (let x = 0; x < w; x++) {
          tmp[row + x] = acc * inv;
          acc += plane[row + addX[x]] - plane[row + subX[x]];
        }
      }
      // Vertical with running column sums, row-major for cache locality: tmp -> plane
      for (let x = 0; x < w; x++) {
        let acc = tmp[x] * (r + 1);
        for (let k = 1; k <= r; k++) acc += tmp[Math.min(k, h - 1) * w + x];
        colAcc[x] = acc;
      }
      for (let y = 0; y < h; y++) {
        const row = y * w;
        const addRow = Math.min(h - 1, y + r + 1) * w;
        const subRow = Math.max(0, y - r) * w;
        for (let x = 0; x < w; x++) {
          plane[row + x] = colAcc[x] * inv;
          colAcc[x] += tmp[addRow + x] - tmp[subRow + x];
        }
      }
    }
    for (let i = 0; i < n; i++) buf[i * ch + c] = plane[i];
  }
}

/**
 * Large-radius gaussian approximation: shrinks, blurs, then enlarges bilinearly.
 * Returns a new buffer of size w*h*ch.
 */
export function wideBlurF(buf: Float32Array, w: number, h: number, ch: number, radius: number): Float32Array {
  const f = Math.max(1, Math.floor(radius / 4));
  if (f === 1) {
    const out = buf.slice();
    boxBlurF(out, w, h, ch, radius / 1.7);
    return out;
  }
  const sw = Math.max(1, Math.ceil(w / f)), sh = Math.max(1, Math.ceil(h / f));
  const small = new Float32Array(sw * sh * ch);
  const cnt = new Float32Array(sw * sh);
  for (let y = 0; y < h; y++) {
    const yy = Math.min(sh - 1, (y / f) | 0);
    for (let x = 0; x < w; x++) {
      const xx = Math.min(sw - 1, (x / f) | 0);
      const si = yy * sw + xx;
      cnt[si]++;
      for (let c = 0; c < ch; c++) small[si * ch + c] += buf[(y * w + x) * ch + c];
    }
  }
  for (let i = 0; i < sw * sh; i++) if (cnt[i]) for (let c = 0; c < ch; c++) small[i * ch + c] /= cnt[i];
  boxBlurF(small, sw, sh, ch, radius / f / 1.7);
  const out = new Float32Array(w * h * ch);
  const X0 = new Int32Array(w), X1 = new Int32Array(w), FX = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const sx = Math.max(0, Math.min(sw - 1, (x + 0.5) / f - 0.5));
    X0[x] = Math.floor(sx) * ch; X1[x] = Math.min(sw - 1, Math.floor(sx) + 1) * ch; FX[x] = sx - Math.floor(sx);
  }
  // Horizontal interpolation into a row buffer, then vertical blend of two cached rows.
  const rowA = new Float32Array(w * ch), rowB = new Float32Array(w * ch);
  let cachedA = -1, cachedB = -1;
  const fillRow = (dst: Float32Array, sy: number) => {
    const base = sy * sw * ch;
    for (let x = 0; x < w; x++) {
      const i0 = base + X0[x], i1 = base + X1[x], fx = FX[x];
      for (let c = 0; c < ch; c++) dst[x * ch + c] = small[i0 + c] + (small[i1 + c] - small[i0 + c]) * fx;
    }
  };
  for (let y = 0; y < h; y++) {
    const sy = Math.max(0, Math.min(sh - 1, (y + 0.5) / f - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0;
    if (cachedA !== y0) {
      if (cachedB === y0) { rowA.set(rowB); } else fillRow(rowA, y0);
      cachedA = y0;
    }
    if (cachedB !== y1) { fillRow(rowB, y1); cachedB = y1; }
    const o = y * w * ch;
    for (let i = 0; i < w * ch; i++) out[o + i] = rowA[i] + (rowB[i] - rowA[i]) * fy;
  }
  return out;
}

export function imgToFloat(img: Img): Float32Array {
  const f = new Float32Array(img.data.length);
  for (let i = 0; i < f.length; i++) f[i] = img.data[i];
  return f;
}

export function newImg(w: number, h: number): Img {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

export function cloneImg(img: Img): Img {
  return { w: img.w, h: img.h, data: img.data.slice() };
}
