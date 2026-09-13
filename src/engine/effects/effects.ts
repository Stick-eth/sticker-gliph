import type { Img } from '../../core/types';
import { hexToRgb, sampleRamp, sortByLuma, type RGB } from '../../core/color';
import { boxBlurF, wideBlurF, cloneImg } from '../../core/image';
import { hash2, mulberry32, noise1, smoothstep } from '../../core/noise';

export interface EffectContext {
  id: string;
  scale: number;
  time: number;
  frame: number;
  fps: number;
  palette: RGB[];
  state: Map<string, any>;
}

type EffectFn = (img: Img, p: Record<string, any>, ctx: EffectContext) => Img | Promise<Img>;

const L = (d: Uint8ClampedArray, o: number) => (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255;
const seedOf = (p: Record<string, any>, ctx: EffectContext) => ((p.seed | 0) * 7919 + (p.animate ? ctx.frame * 104729 : 0)) >>> 0;

/* ---------------------------------------------------------------- Glow */

const glow: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const n = w * h;
  const mask = new Float32Array(n * 3);
  const lo = p.threshold - p.softness, hi = p.threshold + p.softness;
  const tint = hexToRgb(p.tint);
  const iso = hexToRgb(p.isolateColor);
  const useTint = !!p.useTint, isolate = !!p.isolate;
  const tolLo = p.tolerance, tolHi = p.tolerance + Math.max(0.02, p.softness);
  // Mask depends only on the colour, so cache it per RGB for flat dithered images.
  const cache = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (data[o + 3] === 0) continue;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const key = (r << 16) | (g << 8) | b;
    let m = cache.get(key);
    if (m === undefined) {
      if (isolate) {
        const dist = Math.sqrt((r - iso[0]) ** 2 + (g - iso[1]) ** 2 + (b - iso[2]) ** 2) / 441.7;
        m = 1 - smoothstep(tolLo, tolHi, dist);
      } else m = smoothstep(lo, hi, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
      if (cache.size < 65536) cache.set(key, m);
    }
    if (m <= 0) continue;
    const k = m / 255;
    if (useTint) { mask[i * 3] = tint[0] * k; mask[i * 3 + 1] = tint[1] * k; mask[i * 3 + 2] = tint[2] * k; }
    else { mask[i * 3] = r * k; mask[i * 3 + 1] = g * k; mask[i * 3 + 2] = b * k; }
  }
  const layers = Math.max(1, p.layers | 0);
  const bloom = new Float32Array(n * 3);
  const r0 = Math.max(1, p.radius * ctx.scale);
  for (let k = 0; k < layers; k++) {
    const b = wideBlurF(mask, w, h, 3, r0 * Math.pow(2.2, k));
    const wt = 1 / Math.pow(1.35, k);
    for (let i = 0; i < n * 3; i++) bloom[i] += b[i] * wt;
  }
  const norm = p.intensity / (layers > 1 ? 1 + (layers - 1) * 0.5 : 1);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let a = data[o + 3];
    let gmax = 0;
    for (let c = 0; c < 3; c++) {
      const g = Math.min(4, bloom[i * 3 + c] * norm);
      gmax = Math.max(gmax, g);
      const s = a > 0 ? data[o + c] / 255 : 0;
      let v: number;
      if (p.blend === 'add') v = s + g;
      else if (p.blend === 'glowOnly') v = g;
      else v = 1 - (1 - s) * (1 - Math.min(1, g));
      out[o + c] = v * 255;
    }
    if (p.blend === 'glowOnly') a = Math.min(255, gmax * 255);
    else if (a < 255) a = Math.max(a, Math.min(255, gmax * 255));
    out[o + 3] = a;
  }
  return { w, h, data: out };
};

const chromatic: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const amt = p.amount * ctx.scale;
  const cx = w / 2, cy = h / 2;
  const maxD = Math.hypot(cx, cy);
  const ang = (p.angle * Math.PI) / 180;
  const lx = Math.cos(ang), ly = Math.sin(ang);
  const at = (x: number, y: number) => {
    const xi = x < 0 ? 0 : x >= w ? w - 1 : x | 0;
    const yi = y < 0 ? 0 : y >= h ? h - 1 : y | 0;
    return (yi * w + xi) * 4;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let dx: number, dy: number;
      if (p.mode === 'linear') { dx = lx * amt; dy = ly * amt; }
      else {
        const vx = x - cx, vy = y - cy;
        const d = Math.hypot(vx, vy) || 1;
        const k = (d / maxD) * amt;
        dx = (vx / d) * k; dy = (vy / d) * k;
      }
      const o = (y * w + x) * 4;
      const or = at(x + dx, y + dy), ob = at(x - dx, y - dy);
      out[o] = data[or];
      out[o + 1] = data[o + 1];
      out[o + 2] = data[ob + 2];
      out[o + 3] = Math.max(data[o + 3], data[or + 3], data[ob + 3]);
    }
  return { w, h, data: out };
};

/* ---------------------------------------------------------------- Glitch */

async function encodeJpeg(img: Img, quality: number): Promise<Uint8Array> {
  const c = new OffscreenCanvas(img.w, img.h);
  const g = c.getContext('2d')!;
  const flat = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < flat.length; i += 4) {
    const a = img.data[i + 3] / 255;
    flat[i] = img.data[i] * a; flat[i + 1] = img.data[i + 1] * a; flat[i + 2] = img.data[i + 2] * a; flat[i + 3] = 255;
  }
  g.putImageData(new ImageData(flat, img.w, img.h), 0, 0);
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
  return new Uint8Array(await blob.arrayBuffer());
}

async function decodeJpeg(bytes: Uint8Array, w: number, h: number): Promise<Uint8ClampedArray | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return g.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

const jpegGlitch: EffectFn = async (img, p, ctx) => {
  const rnd = mulberry32(seedOf(p, ctx));
  let cur = img;
  const gens = Math.max(1, p.generations | 0);
  for (let gen = 0; gen < gens; gen++) {
    const bytes = await encodeJpeg(cur, p.quality);
    let sos = -1;
    for (let i = 2; i < bytes.length - 1; i++) if (bytes[i] === 0xff && bytes[i + 1] === 0xda) { sos = i; break; }
    const corrupted = bytes.slice();
    if (sos > 0 && p.corruption > 0) {
      const start = sos + 2 + ((bytes[sos + 2] << 8) | bytes[sos + 3]);
      const end = bytes.length - 2;
      const count = Math.max(1, Math.round(p.corruption * p.corruption * 120 / gens));
      for (let k = 0; k < count; k++) {
        const pos = start + Math.floor(rnd() * (end - start));
        if (corrupted[pos - 1] === 0xff || corrupted[pos] === 0xff) continue;
        corrupted[pos] = Math.floor(rnd() * 255);
      }
    }
    let dec = await decodeJpeg(corrupted, cur.w, cur.h);
    if (!dec) dec = await decodeJpeg(bytes, cur.w, cur.h);
    if (!dec) return img;
    cur = { w: cur.w, h: cur.h, data: dec };
  }
  for (let i = 3; i < cur.data.length; i += 4) cur.data[i] = img.data[i];
  return cur;
};

const slice: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data);
  const rnd = mulberry32(seedOf(p, ctx));
  const minH = Math.max(1, p.minHeight * ctx.scale), maxH = Math.max(minH, p.maxHeight * ctx.scale);
  let y = 0;
  while (y < h) {
    const sh = Math.max(1, Math.round(minH + (maxH - minH) * rnd()));
    if (rnd() < p.amount) {
      const shift = Math.round((rnd() * 2 - 1) * p.maxShift * ctx.scale);
      const split = p.rgbSplit ? Math.round(shift * 0.15) : 0;
      for (let yy = y; yy < Math.min(h, y + sh); yy++)
        for (let x = 0; x < w; x++) {
          const o = (yy * w + x) * 4;
          const sx = (((x - shift) % w) + w) % w;
          const sr = (((x - shift - split) % w) + w) % w;
          const sb = (((x - shift + split) % w) + w) % w;
          const row = yy * w;
          out[o] = data[(row + sr) * 4];
          out[o + 1] = data[(row + sx) * 4 + 1];
          out[o + 2] = data[(row + sb) * 4 + 2];
          out[o + 3] = data[(row + sx) * 4 + 3];
        }
    }
    y += sh;
  }
  return { w, h, data: out };
};

const blockShuffle: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data);
  const rnd = mulberry32(seedOf(p, ctx));
  const bs = Math.max(2, Math.round(p.blockSize * ctx.scale));
  const bx = Math.ceil(w / bs), by = Math.ceil(h / bs);
  const count = Math.round(bx * by * p.amount);
  for (let k = 0; k < count; k++) {
    const sx = Math.floor(rnd() * bx) * bs, sy = Math.floor(rnd() * by) * bs;
    const dx = Math.floor(rnd() * bx) * bs, dy = Math.floor(rnd() * by) * bs;
    for (let y = 0; y < bs; y++) {
      if (sy + y >= h || dy + y >= h) break;
      for (let x = 0; x < bs; x++) {
        if (sx + x >= w || dx + x >= w) break;
        const so = ((sy + y) * w + sx + x) * 4, d0 = ((dy + y) * w + dx + x) * 4;
        out[d0] = data[so]; out[d0 + 1] = data[so + 1]; out[d0 + 2] = data[so + 2]; out[d0 + 3] = data[so + 3];
      }
    }
  }
  return { w, h, data: out };
};

function hueSat(r: number, g: number, b: number): [number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const d = mx - mn;
  let hh = 0;
  if (d > 0) {
    if (mx === r) hh = ((g - b) / d) % 6;
    else if (mx === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh = (hh * 60 + 360) % 360;
  }
  return [hh / 360, mx === 0 ? 0 : d / mx];
}

const pixelSort: EffectFn = (img, p) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data);
  const vertical = p.direction === 'vertical';
  const lines = vertical ? w : h;
  const len = vertical ? h : w;
  const idx = new Int32Array(len);
  const keys = new Float32Array(len);
  const px = new Uint8ClampedArray(len * 4);
  const keyOf = (o: number) => {
    if (p.key === 'luma') return L(data, o);
    const [hh, ss] = hueSat(data[o], data[o + 1], data[o + 2]);
    return p.key === 'hue' ? hh : ss;
  };
  for (let li = 0; li < lines; li++) {
    const off = (k: number) => (vertical ? (k * w + li) * 4 : (li * w + k) * 4);
    let k = 0;
    while (k < len) {
      const l0 = L(data, off(k));
      if (l0 < p.low || l0 > p.high) { k++; continue; }
      let e = k;
      while (e < len) {
        const l = L(data, off(e));
        if (l < p.low || l > p.high) break;
        e++;
      }
      const n = e - k;
      if (n > 1) {
        for (let j = 0; j < n; j++) { idx[j] = j; keys[j] = keyOf(off(k + j)); }
        const sub = Array.from(idx.subarray(0, n)).sort((a, b) => (p.reverse ? keys[b] - keys[a] : keys[a] - keys[b]));
        for (let j = 0; j < n; j++) {
          const so = off(k + sub[j]);
          px[j * 4] = data[so]; px[j * 4 + 1] = data[so + 1]; px[j * 4 + 2] = data[so + 2]; px[j * 4 + 3] = data[so + 3];
        }
        for (let j = 0; j < n; j++) {
          const d0 = off(k + j);
          out[d0] = px[j * 4]; out[d0 + 1] = px[j * 4 + 1]; out[d0 + 2] = px[j * 4 + 2]; out[d0 + 3] = px[j * 4 + 3];
        }
      }
      k = e;
    }
  }
  return { w, h, data: out };
};

/* ---------------------------------------------------------------- Retro screen */

const vhs: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const t = ctx.time;
  const bandY = ((t * p.bandSpeed) % 1) * h * 1.3 - h * 0.15;
  const bandH = h * 0.06;
  const rowShift = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    const jit = (noise1(y * 0.08 + t * 30, 3) - 0.5) * 2 * p.jitter * ctx.scale;
    const dist = (y - bandY) / bandH;
    const band = Math.exp(-dist * dist) * p.band * 40 * ctx.scale * (noise1(y * 0.5 + t * 50, 9) - 0.3);
    rowShift[y] = Math.round(jit + band);
  }
  for (let y = 0; y < h; y++) {
    const s = rowShift[y];
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1, Math.max(0, x - s));
      const so = (y * w + sx) * 4, o = (y * w + x) * 4;
      out[o] = data[so]; out[o + 1] = data[so + 1]; out[o + 2] = data[so + 2]; out[o + 3] = data[so + 3];
    }
  }
  if (p.bleed > 0) {
    // Chroma bleed: blur chroma horizontally, keep luma sharp.
    const n = w * h;
    const yiq = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = i * 4, r = out[o], g = out[o + 1], b = out[o + 2];
      yiq[i * 3] = 0.299 * r + 0.587 * g + 0.114 * b;
      yiq[i * 3 + 1] = 0.596 * r - 0.274 * g - 0.322 * b;
      yiq[i * 3 + 2] = 0.211 * r - 0.523 * g + 0.312 * b;
    }
    const chroma = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { chroma[i * 2] = yiq[i * 3 + 1]; chroma[i * 2 + 1] = yiq[i * 3 + 2]; }
    blurHorizontal(chroma, w, h, 2, p.bleed * ctx.scale);
    for (let i = 0; i < n; i++) {
      const Y = yiq[i * 3], I = chroma[i * 2], Q = chroma[i * 2 + 1];
      const o = i * 4;
      out[o] = Y + 0.956 * I + 0.621 * Q;
      out[o + 1] = Y - 0.272 * I - 0.647 * Q;
      out[o + 2] = Y - 1.106 * I + 1.703 * Q;
    }
  }
  if (p.noise > 0) {
    const fr = ctx.frame;
    for (let y = 0; y < h; y++) {
      const lineNoise = hash2(y, fr, 5) < p.noise * 0.04 ? 1 : 0;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const nz = (hash2(x, y, fr * 31) - 0.5) * p.noise * 90 + lineNoise * hash2(x >> 2, y, fr) * 180;
        out[o] += nz; out[o + 1] += nz; out[o + 2] += nz;
      }
    }
  }
  return { w, h, data: out };
};

function blurHorizontal(buf: Float32Array, w: number, h: number, ch: number, radius: number) {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(w);
  for (let pass = 0; pass < 2; pass++)
    for (let c = 0; c < ch; c++)
      for (let y = 0; y < h; y++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += buf[(y * w + Math.min(w - 1, Math.max(0, k))) * ch + c];
        for (let x = 0; x < w; x++) {
          tmp[x] = acc / (2 * r + 1);
          acc += buf[(y * w + Math.min(w - 1, x + r + 1)) * ch + c] - buf[(y * w + Math.max(0, x - r)) * ch + c];
        }
        for (let x = 0; x < w; x++) buf[(y * w + x) * ch + c] = tmp[x];
      }
}

const crt: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const k = p.curvature;
  const spacing = Math.max(1, p.spacing * ctx.scale);
  const flick = 1 + (noise1(ctx.time * 20, 11) - 0.5) * 2 * p.flicker;
  const boost = p.boost * flick;
  const maskPx = Math.max(1, Math.round(ctx.scale));
  for (let y = 0; y < h; y++) {
    const ny = (y + 0.5) / h * 2 - 1;
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5) / w * 2 - 1;
      let ux = nx, uy = ny;
      if (k > 0) {
        ux = nx * (1 + k * ny * ny);
        uy = ny * (1 + k * nx * nx);
      }
      const o = (y * w + x) * 4;
      if (ux < -1 || ux > 1 || uy < -1 || uy > 1) { out[o + 3] = 255; continue; }
      const sx = Math.min(w - 1, Math.max(0, ((ux + 1) / 2) * w | 0));
      const sy = Math.min(h - 1, Math.max(0, ((uy + 1) / 2) * h | 0));
      const so = (sy * w + sx) * 4;
      const scan = 1 - p.scanlines * (0.5 + 0.5 * Math.cos(((sy + 0.5) / spacing) * Math.PI * 2));
      let mr = 1, mg = 1, mb = 1;
      if (p.mask !== 'none' && p.maskStrength > 0) {
        const ms = p.maskStrength;
        const col = Math.floor(x / maskPx) % 3;
        const rowOdd = Math.floor(y / (maskPx * 3)) % 2;
        const c = p.mask === 'slot' ? (Math.floor(x / maskPx) + (rowOdd ? 1 : 0) * 1) % 3 : p.mask === 'shadow' ? (col + Math.floor(y / maskPx)) % 3 : col;
        mr = c === 0 ? 1 : 1 - ms; mg = c === 1 ? 1 : 1 - ms; mb = c === 2 ? 1 : 1 - ms;
        if (p.mask === 'slot' && Math.floor(y / maskPx) % (3 * 1) === 0 && ((Math.floor(x / (maskPx * 3)) + rowOdd) & 1)) { mr *= 1 - ms; mg *= 1 - ms; mb *= 1 - ms; }
      }
      const vig = 1 - p.vignette * smoothstep(0.4, 1.45, Math.hypot(ux, uy));
      const f = scan * vig * boost;
      out[o] = data[so] * f * mr;
      out[o + 1] = data[so + 1] * f * mg;
      out[o + 2] = data[so + 2] * f * mb;
      out[o + 3] = data[so + 3];
    }
  }
  return { w, h, data: out };
};

const echo: EffectFn = (img, p, ctx) => {
  const key = 'echo:' + ctx.id;
  let st = ctx.state.get(key) as { frame: number; prevAcc: Float32Array | null; acc: Float32Array; w: number; h: number } | undefined;
  const { w, h, data } = img;
  let base: Float32Array | null = null;
  if (st && st.w === w && st.h === h) {
    if (ctx.frame === st.frame) base = st.prevAcc;
    else if (ctx.frame === st.frame + 1) base = st.acc;
  }
  const acc = new Float32Array(data.length);
  const decay = p.decay;
  for (let i = 0; i < data.length; i++) {
    const cur = data[i];
    if (!base) { acc[i] = cur; continue; }
    const prev = base[i] * decay;
    acc[i] = p.blend === 'mix' ? cur * (1 - decay) + base[i] * decay : Math.max(cur, prev);
  }
  ctx.state.set(key, { frame: ctx.frame, prevAcc: base, acc, w, h });
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) out[i] = acc[i];
  return { w, h, data: out };
};

/* ---------------------------------------------------------------- Distort */

const wave: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const amp = p.amplitude * ctx.scale;
  const wl = Math.max(1, p.wavelength * ctx.scale);
  const ph = ctx.time * p.speed * Math.PI * 2;
  const horiz = p.direction !== 'vertical';
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sx = x, sy = y;
      if (horiz) sx = Math.round(x + amp * Math.sin((y / wl) * Math.PI * 2 + ph));
      else sy = Math.round(y + amp * Math.sin((x / wl) * Math.PI * 2 + ph));
      sx = ((sx % w) + w) % w;
      sy = Math.min(h - 1, Math.max(0, sy));
      const so = (sy * w + sx) * 4, o = (y * w + x) * 4;
      out[o] = data[so]; out[o + 1] = data[so + 1]; out[o + 2] = data[so + 2]; out[o + 3] = data[so + 3];
    }
  return { w, h, data: out };
};

const mirror: EffectFn = (img, p) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const cx = w / 2, cy = h / 2;
  const seg = (Math.PI * 2) / Math.max(2, p.segments | 0);
  const rot = ((p.rotation || 0) * Math.PI) / 180;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sx = x, sy = y;
      if (p.mode === 'horizontal') { if (x >= cx) sx = w - 1 - x; }
      else if (p.mode === 'vertical') { if (y >= cy) sy = h - 1 - y; }
      else if (p.mode === 'quad') { if (x >= cx) sx = w - 1 - x; if (y >= cy) sy = h - 1 - y; }
      else {
        const dx = x - cx, dy = y - cy;
        const r = Math.hypot(dx, dy);
        let a = Math.atan2(dy, dx) - rot;
        a = ((a % seg) + seg) % seg;
        if (a > seg / 2) a = seg - a;
        a += rot;
        sx = Math.round(cx + r * Math.cos(a));
        sy = Math.round(cy + r * Math.sin(a));
        sx = Math.min(w - 1, Math.max(0, sx));
        sy = Math.min(h - 1, Math.max(0, sy));
      }
      const so = (sy * w + sx) * 4, o = (y * w + x) * 4;
      out[o] = data[so]; out[o + 1] = data[so + 1]; out[o + 2] = data[so + 2]; out[o + 3] = data[so + 3];
    }
  return { w, h, data: out };
};

const pixelate: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const bs = Math.max(1, Math.round(p.size * ctx.scale));
  if (bs <= 1) return img;
  const out = new Uint8ClampedArray(data.length);
  for (let by = 0; by < h; by += bs)
    for (let bx = 0; bx < w; bx += bs) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const ye = Math.min(h, by + bs), xe = Math.min(w, bx + bs);
      for (let y = by; y < ye; y++)
        for (let x = bx; x < xe; x++) {
          const o = (y * w + x) * 4;
          r += data[o]; g += data[o + 1]; b += data[o + 2]; a += data[o + 3]; n++;
        }
      for (let y = by; y < ye; y++)
        for (let x = bx; x < xe; x++) {
          const o = (y * w + x) * 4;
          out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
        }
    }
  return { w, h, data: out };
};

/* ---------------------------------------------------------------- Texture */

const blurSharpen: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const f = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) f[i] = data[i];
  if (p.blur > 0) boxBlurF(f, w, h, 4, (p.blur * ctx.scale) / 1.7, 3, 4);
  if (p.sharpen > 0) {
    const b = f.slice();
    boxBlurF(b, w, h, 4, (p.sharpenRadius * ctx.scale) / 1.7, 2, 3);
    for (let i = 0; i < f.length; i += 4)
      for (let c = 0; c < 3; c++) f[i + c] += (f[i + c] - b[i + c]) * p.sharpen;
  }
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i++) out[i] = f[i];
  return { w, h, data: out };
};

const grain: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data);
  const sz = Math.max(1, Math.round(p.size * ctx.scale));
  const seed = p.animate ? ctx.frame * 7 + 1 : 1;
  const amt = p.amount * 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = (x / sz) | 0, gy = (y / sz) | 0;
      const o = (y * w + x) * 4;
      if (p.mono) {
        const nz = (hash2(gx, gy, seed) - 0.5) * amt;
        out[o] += nz; out[o + 1] += nz; out[o + 2] += nz;
      } else {
        out[o] += (hash2(gx, gy, seed) - 0.5) * amt;
        out[o + 1] += (hash2(gx, gy, seed + 101) - 0.5) * amt;
        out[o + 2] += (hash2(gx, gy, seed + 202) - 0.5) * amt;
      }
    }
  return { w, h, data: out };
};

const vignette: EffectFn = (img, p) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data);
  const col = hexToRgb(p.color);
  const cx = w / 2, cy = h / 2;
  const norm = Math.hypot(cx, cy);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy) / norm;
      const f = p.amount * smoothstep(p.radius, p.radius + p.softness, d);
      const o = (y * w + x) * 4;
      out[o] += (col[0] - out[o]) * f;
      out[o + 1] += (col[1] - out[o + 1]) * f;
      out[o + 2] += (col[2] - out[o + 2]) * f;
    }
  return { w, h, data: out };
};

const edges: EffectFn = (img, p) => {
  const { w, h, data } = img;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = L(data, i * 4);
  const out = p.mode === 'only' ? new Uint8ClampedArray(data.length) : new Uint8ClampedArray(data);
  const ec = hexToRgb(p.color), bg = hexToRgb(p.background);
  const at = (x: number, y: number) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const m = Math.hypot(gx, gy) / 4;
      const e = smoothstep(p.threshold, p.threshold + 0.08, m);
      const o = (y * w + x) * 4;
      if (p.mode === 'only') {
        out[o] = bg[0] + (ec[0] - bg[0]) * e; out[o + 1] = bg[1] + (ec[1] - bg[1]) * e; out[o + 2] = bg[2] + (ec[2] - bg[2]) * e; out[o + 3] = 255;
      } else if (e > 0) {
        out[o] += (ec[0] - out[o]) * e; out[o + 1] += (ec[1] - out[o + 1]) * e; out[o + 2] += (ec[2] - out[o + 2]) * e;
        out[o + 3] = Math.max(out[o + 3], e * 255);
      }
    }
  return { w, h, data: out };
};

/* ---------------------------------------------------------------- Colour */

const colorGrade: EffectFn = (img, p) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  const hue = (p.hue * Math.PI) / 180;
  const c = Math.cos(hue), s = Math.sin(hue);
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  const cf = p.contrast >= 0 ? 1 + p.contrast * 3 : 1 + p.contrast;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    if (p.hue) {
      const nr = m[0] * r + m[1] * g + m[2] * b, ng = m[3] * r + m[4] * g + m[5] * b, nb = m[6] * r + m[7] * g + m[8] * b;
      r = nr; g = ng; b = nb;
    }
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = l + (r - l) * p.saturation; g = l + (g - l) * p.saturation; b = l + (b - l) * p.saturation;
    r = (r - 0.5) * cf + 0.5 + p.brightness; g = (g - 0.5) * cf + 0.5 + p.brightness; b = (b - 0.5) * cf + 0.5 + p.brightness;
    if (p.invert) { r = 1 - r; g = 1 - g; b = 1 - b; }
    out[i] = r * 255; out[i + 1] = g * 255; out[i + 2] = b * 255; out[i + 3] = data[i + 3];
  }
  return { w, h, data: out };
};

const gradientMap: EffectFn = (img, p, ctx) => {
  const { w, h, data } = img;
  const out = new Uint8ClampedArray(data);
  const ramp: RGB[] = p.usePalette && ctx.palette.length ? sortByLuma(ctx.palette) : [hexToRgb(p.shadow), hexToRgb(p.highlight)];
  const tmp = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    sampleRamp(ramp, L(data, i), tmp);
    out[i] = data[i] + (tmp[0] - data[i]) * p.mix;
    out[i + 1] = data[i + 1] + (tmp[1] - data[i + 1]) * p.mix;
    out[i + 2] = data[i + 2] + (tmp[2] - data[i + 2]) * p.mix;
  }
  return { w, h, data: out };
};

const posterize: EffectFn = (img, p) => {
  const out = new Uint8ClampedArray(img.data);
  const lv = Math.max(2, p.levels | 0) - 1;
  for (let i = 0; i < out.length; i += 4)
    for (let c = 0; c < 3; c++) out[i + c] = (Math.round((out[i + c] / 255) * lv) / lv) * 255;
  return { w: img.w, h: img.h, data: out };
};

const bitmap: EffectFn = (img, p) => {
  const out = new Uint8ClampedArray(img.data);
  const dk = hexToRgb(p.dark), lt = hexToRgb(p.light);
  for (let i = 0; i < out.length; i += 4) {
    const c = L(img.data, i) >= p.threshold ? lt : dk;
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
  }
  return { w: img.w, h: img.h, data: out };
};

export const EFFECTS: Record<string, EffectFn> = {
  glow, chromatic, jpegGlitch, slice, blockShuffle, pixelSort, vhs, crt, echo,
  wave, mirror, pixelate, blurSharpen, grain, vignette, edges, colorGrade, gradientMap, posterize, bitmap,
};

export { cloneImg };
