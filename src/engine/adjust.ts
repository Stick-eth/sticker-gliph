import type { FImg } from '../core/types';
import { boxBlurF } from '../core/image';
import { blueNoise, hash2, noise1 } from '../core/noise';

/** Applies tonal adjustments and animated noise in place on a grid-resolution float image. */
export function applyAdjust(img: FImg, a: Record<string, any>, temporal: Record<string, any>, time: number, frame: number): void {
  const { w, h, d } = img;
  const n = w * h;

  if (a.blur > 0) boxBlurF(d, w, h, 4, a.blur, 3, 3);
  if (a.sharpen > 0) {
    const blurred = d.slice();
    boxBlurF(blurred, w, h, 4, 1.5, 2, 3);
    const k = a.sharpen;
    for (let i = 0; i < n * 4; i += 4) {
      d[i] += (d[i] - blurred[i]) * k;
      d[i + 1] += (d[i + 1] - blurred[i + 1]) * k;
      d[i + 2] += (d[i + 2] - blurred[i + 2]) * k;
    }
  }

  const expo = Math.pow(2, a.exposure || 0);
  const bp = a.blackPoint ?? 0;
  const wp = Math.max(bp + 0.001, a.whitePoint ?? 1);
  const bri = a.brightness || 0;
  const con = a.contrast || 0;
  const cf = con >= 0 ? 1 + con * 3 : 1 + con;
  const gamma = a.gamma || 1;
  const invG = 1 / gamma;
  const sat = a.saturation ?? 1;
  const hue = ((a.hue || 0) * Math.PI) / 180;
  const cosH = Math.cos(hue), sinH = Math.sin(hue);
  // Hue rotation matrix around the luminance axis.
  const m = hue !== 0 ? hueMatrix(cosH, sinH) : null;
  const invert = !!a.invert;
  const identity = expo === 1 && bp === 0 && wp === 1 && bri === 0 && con === 0 && gamma === 1 && sat === 1 && !m && !invert;

  if (!identity) {
    for (let i = 0; i < n * 4; i += 4) {
      let r = d[i] * expo, g = d[i + 1] * expo, b = d[i + 2] * expo;
      if (m) {
        const nr = m[0] * r + m[1] * g + m[2] * b;
        const ng = m[3] * r + m[4] * g + m[5] * b;
        const nb = m[6] * r + m[7] * g + m[8] * b;
        r = nr; g = ng; b = nb;
      }
      if (sat !== 1) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
      }
      r = (r - bp) / (wp - bp); g = (g - bp) / (wp - bp); b = (b - bp) / (wp - bp);
      r = (r - 0.5) * cf + 0.5 + bri;
      g = (g - 0.5) * cf + 0.5 + bri;
      b = (b - 0.5) * cf + 0.5 + bri;
      if (gamma !== 1) {
        r = r > 0 ? Math.pow(r, invG) : 0;
        g = g > 0 ? Math.pow(g, invG) : 0;
        b = b > 0 ? Math.pow(b, invG) : 0;
      }
      if (invert) { r = 1 - r; g = 1 - g; b = 1 - b; }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }

  if (temporal && temporal.pattern && temporal.pattern !== 'none' && temporal.amount > 0) {
    applyTemporal(img, temporal, time, frame);
  }

  for (let i = 0; i < n * 4; i += 4) {
    d[i] = d[i] < 0 ? 0 : d[i] > 1 ? 1 : d[i];
    d[i + 1] = d[i + 1] < 0 ? 0 : d[i + 1] > 1 ? 1 : d[i + 1];
    d[i + 2] = d[i + 2] < 0 ? 0 : d[i + 2] > 1 ? 1 : d[i + 2];
  }
}

function hueMatrix(c: number, s: number): number[] {
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

/** Nine animated noise patterns inspired by retro screens, added to the image before quantization. */
function applyTemporal(img: FImg, t: Record<string, any>, time: number, frame: number): void {
  const { w, h, d } = img;
  const amt = t.amount;
  const speed = t.speed ?? 1;
  const sc = Math.max(1, t.scale ?? 4);
  const seed = (t.seed ?? 1) | 0;
  const tt = time * speed;
  const fr = Math.floor(tt * 24);
  const bn = t.pattern === 'blue' ? blueNoise(64) : null;

  for (let y = 0; y < h; y++) {
    let rowOff = 0;
    let rowMul = 1;
    switch (t.pattern) {
      case 'scanroll': {
        const p = ((y / sc - tt * 4) % 2 + 2) % 2;
        rowOff = (p < 1 ? 1 : -1) * 0.5;
        break;
      }
      case 'interlace':
        rowOff = ((y + fr) & 1 ? 1 : -1) * 0.5;
        break;
      case 'vhs': {
        const bandY = ((tt * 0.35) % 1) * h;
        const dist = Math.abs(y - bandY) / (sc * 4);
        rowOff = (noise1(y / sc + tt * 7, seed) - 0.5) * 1.2 * Math.exp(-dist * dist) + (hash2(y, fr, seed) - 0.5) * 0.25;
        break;
      }
      case 'band': {
        const bandY = ((tt * 0.2) % 1) * (h + sc * 8) - sc * 4;
        const dist = (y - bandY) / (sc * 4);
        rowOff = Math.exp(-dist * dist) * 0.9;
        break;
      }
      case 'flicker':
        rowMul = 1 + (noise1(tt * 12, seed) - 0.5) * amt * 1.5;
        rowOff = 0;
        break;
      case 'sine':
        rowOff = Math.sin((y / (sc * 4)) * Math.PI * 2 + tt * Math.PI * 2) * 0.5;
        break;
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let off = rowOff;
      switch (t.pattern) {
        case 'static':
          off = hash2((x / sc) | 0, (y / sc) | 0, seed + fr * 131) - 0.5;
          break;
        case 'blue': {
          const ox = Math.floor(tt * 17) & 63, oy = Math.floor(tt * 29) & 63;
          off = bn!.data[(((y + oy) & 63) * 64) + ((x + ox) & 63)] - 0.5;
          break;
        }
        case 'grain': {
          const g = hash2((x / Math.max(1, sc / 4)) | 0, (y / Math.max(1, sc / 4)) | 0, seed + fr * 97) - 0.5;
          d[i] += d[i] * g * amt * 1.5;
          d[i + 1] += d[i + 1] * g * amt * 1.5;
          d[i + 2] += d[i + 2] * g * amt * 1.5;
          continue;
        }
        case 'flicker':
          d[i] *= rowMul; d[i + 1] *= rowMul; d[i + 2] *= rowMul;
          continue;
      }
      const v = off * amt;
      d[i] += v; d[i + 1] += v; d[i + 2] += v;
    }
  }
}
