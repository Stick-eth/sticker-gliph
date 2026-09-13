import type { FImg, Img } from '../../core/types';
import { PaletteMatcher, hexToRgb, sampleRamp, sortByLuma, type RGB } from '../../core/color';
import { bayer } from '../../core/noise';
import { DESC, getAtlas, type GlyphAtlas } from './atlas';
import { resolveGlyphs } from './charsets';

export interface AsciiGrid {
  cols: number;
  rows: number;
  glyph: Int32Array; // atlas glyph index, -1 = empty
  fg: Uint8Array; // cols*rows*3
  bg: Uint8Array; // cols*rows*4
  atlas: GlyphAtlas;
}

export interface AsciiLayout {
  cols: number;
  rows: number;
  cw: number; // output px
  ch: number;
  sub: number; // samples per cell side in the analysis image
}

export function asciiLayout(srcW: number, srcH: number, s: Record<string, any>, scale: number): AsciiLayout {
  const cellW = Math.max(1, s.cellSize || 10);
  const cellH = Math.max(1, cellW * (s.aspect || 1));
  const cols = Math.max(1, Math.round(srcW / cellW));
  const rows = Math.max(1, Math.round(srcH / cellH));
  const cw = Math.max(2, Math.round(cellW * scale));
  const ch = Math.max(2, Math.round(cellH * scale));
  return { cols, rows, cw, ch, sub: s.mapping === 'structure' ? DESC : 1 };
}

/** Picks `depth` glyphs spread evenly in density, returned as atlas indices sorted light to dense. */
export function selectGlyphs(atlas: GlyphAtlas, depth: number): Int32Array {
  const n = atlas.chars.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => atlas.density[a] - atlas.density[b]);
  const D = Math.max(1, Math.min(n, Math.round(depth)));
  if (D >= n) return Int32Array.from(order);
  if (D === 1) return Int32Array.from([order[n - 1]]);
  const sel = new Int32Array(D);
  let last = -1;
  for (let i = 0; i < D; i++) {
    const target = i / (D - 1);
    const lo = last + 1;
    const hi = n - (D - i);
    let best = lo, bd = Infinity;
    for (let k = lo; k <= hi; k++) {
      const dd = Math.abs(atlas.density[order[k]] - target);
      if (dd < bd) { bd = dd; best = k; }
    }
    sel[i] = order[best];
    last = best;
  }
  return sel;
}

export function buildAsciiGrid(sample: FImg, layout: AsciiLayout, s: Record<string, any>, palette: RGB[]): AsciiGrid {
  const { cols, rows, cw, ch, sub } = layout;
  const chars = resolveGlyphs(s.charset, s.custom, s.customMode, s.includeSpace !== false);
  const font = (s.customFont && String(s.customFont).trim()) || s.font || 'Consolas';
  const atlas = getAtlas(chars, font, s.weight || 'normal', cw, ch, s.glyphScale || 1);
  const sel = selectGlyphs(atlas, s.depth || 16);
  const D = sel.length;
  const n = cols * rows;

  // Cell statistics
  const cellRGB = new Float32Array(n * 3);
  const cellA = new Float32Array(n);
  const cellL = new Float32Array(n);
  const sd = sample.d;
  const sw = sample.w;
  const brightDense = s.brightDense !== false;
  const pat = sub > 1 ? new Float32Array(n * sub * sub) : null;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const ci = r * cols + c;
      let R = 0, G = 0, B = 0, A = 0;
      for (let yy = 0; yy < sub; yy++)
        for (let xx = 0; xx < sub; xx++) {
          const o = ((r * sub + yy) * sw + c * sub + xx) * 4;
          R += sd[o]; G += sd[o + 1]; B += sd[o + 2]; A += sd[o + 3];
          if (pat) {
            const l = 0.2126 * sd[o] + 0.7152 * sd[o + 1] + 0.0722 * sd[o + 2];
            pat[ci * sub * sub + yy * sub + xx] = brightDense ? l : 1 - l;
          }
        }
      const k = 1 / (sub * sub);
      cellRGB[ci * 3] = R * k; cellRGB[ci * 3 + 1] = G * k; cellRGB[ci * 3 + 2] = B * k;
      cellA[ci] = A * k;
      const l = 0.2126 * R * k + 0.7152 * G * k + 0.0722 * B * k;
      cellL[ci] = brightDense ? l : 1 - l;
    }

  // Glyph level per cell (0..D-1)
  const level = new Int32Array(n);
  if (s.mapping === 'structure' && pat) {
    const mix = s.structureMix ?? 0.6;
    const K = DESC * DESC;
    // Zero-mean glyph descriptors: shape is compared independently of tone.
    const dz = new Float32Array(D * K);
    for (let k = 0; k < D; k++) {
      const g = sel[k];
      let m = 0;
      for (let q = 0; q < K; q++) m += atlas.desc[g * K + q];
      m /= K;
      for (let q = 0; q < K; q++) dz[k * K + q] = atlas.desc[g * K + q] - m;
    }
    const pz = new Float32Array(K);
    for (let ci = 0; ci < n; ci++) {
      let pm = 0;
      for (let q = 0; q < K; q++) pm += pat[ci * K + q];
      pm /= K;
      let variance = 0;
      for (let q = 0; q < K; q++) { pz[q] = pat[ci * K + q] - pm; variance += pz[q] * pz[q]; }
      // Edge-aware weighting: flat cells map by tone, contrasted cells by shape.
      const contrast = Math.min(1, Math.sqrt(variance / K) * 5);
      const wShape = (mix * contrast) / K;
      const wTone = 1 - mix * contrast;
      const mean = cellL[ci];
      let best = 0, bs = Infinity;
      for (let k = 0; k < D; k++) {
        const tone = mean - atlas.density[sel[k]];
        let score = wTone * tone * tone;
        if (score >= bs) continue;
        const kk = k * K;
        for (let q = 0; q < K && score < bs; q++) {
          const dq = pz[q] - dz[kk + q];
          score += wShape * dq * dq;
        }
        if (score < bs) { bs = score; best = k; }
      }
      level[ci] = best;
    }
  } else {
    const Dm = D - 1;
    const mode = s.glyphDither || 'none';
    if (mode === 'fs' || mode === 'atkinson') {
      const buf = cellL.slice();
      const taps: [number, number, number][] = mode === 'fs'
        ? [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]]
        : [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const ci = r * cols + c;
          let k = Math.round(buf[ci] * Dm);
          k = k < 0 ? 0 : k > Dm ? Dm : k;
          level[ci] = k;
          const err = buf[ci] - k / Dm;
          for (const [dx, dy, wt] of taps) {
            const x = c + dx, y = r + dy;
            if (x >= 0 && x < cols && y < rows) buf[y * cols + x] += err * wt;
          }
        }
    } else if (mode === 'bayer') {
      const b4 = bayer(4);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const ci = r * cols + c;
          let k = Math.floor(cellL[ci] * Dm + b4.data[((r & 3) << 2) | (c & 3)]);
          level[ci] = k < 0 ? 0 : k > Dm ? Dm : k;
        }
    } else {
      for (let ci = 0; ci < n; ci++) {
        const k = Math.floor(cellL[ci] * D);
        level[ci] = k < 0 ? 0 : k > Dm ? Dm : k;
      }
    }
  }

  // Character offset
  const off = Math.floor(s.offset || 0);
  const wrap = s.offsetMode !== 'clamp';
  const blankBelow = s.blankBelow || 0;
  const glyph = new Int32Array(n);
  for (let ci = 0; ci < n; ci++) {
    if (cellA[ci] < 0.5 || (blankBelow > 0 && cellL[ci] < blankBelow)) { glyph[ci] = -1; continue; }
    let k = level[ci] + off;
    k = wrap ? ((k % D) + D) % D : Math.max(0, Math.min(D - 1, k));
    const g = sel[k];
    glyph[ci] = atlas.chars[g] === ' ' ? -1 : g;
  }

  // Colours
  const fg = new Uint8Array(n * 3);
  const bg = new Uint8Array(n * 4);
  const colorMode = s.colorMode || 'mono';
  const mono = hexToRgb(s.fgColor || '#e9dcbc');
  const pal = palette.length ? palette : [[0, 0, 0], [255, 255, 255]] as RGB[];
  const ramp = sortByLuma(pal);
  const matcher = colorMode === 'palette' ? new PaletteMatcher(pal, 'redmean') : null;
  const sat = s.saturation ?? 1;
  const bgMode = s.bgMode || 'color';
  const bgc = hexToRgb(s.bgColor || '#0e0b09');
  const dim = s.bgDim ?? 0.25;
  const tmp = [0, 0, 0];
  for (let ci = 0; ci < n; ci++) {
    const r = cellRGB[ci * 3], g = cellRGB[ci * 3 + 1], b = cellRGB[ci * 3 + 2];
    if (colorMode === 'mono') { fg[ci * 3] = mono[0]; fg[ci * 3 + 1] = mono[1]; fg[ci * 3 + 2] = mono[2]; }
    else if (colorMode === 'source') {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      fg[ci * 3] = clamp255((l + (r - l) * sat) * 255);
      fg[ci * 3 + 1] = clamp255((l + (g - l) * sat) * 255);
      fg[ci * 3 + 2] = clamp255((l + (b - l) * sat) * 255);
    } else if (matcher) {
      const c = pal[matcher.nearest(r * 255, g * 255, b * 255)];
      fg[ci * 3] = c[0]; fg[ci * 3 + 1] = c[1]; fg[ci * 3 + 2] = c[2];
    } else {
      sampleRamp(ramp, 0.2126 * r + 0.7152 * g + 0.0722 * b, tmp);
      fg[ci * 3] = tmp[0]; fg[ci * 3 + 1] = tmp[1]; fg[ci * 3 + 2] = tmp[2];
    }
    if (bgMode === 'color') { bg[ci * 4] = bgc[0]; bg[ci * 4 + 1] = bgc[1]; bg[ci * 4 + 2] = bgc[2]; bg[ci * 4 + 3] = 255; }
    else if (bgMode === 'source') {
      bg[ci * 4] = clamp255(r * dim * 255); bg[ci * 4 + 1] = clamp255(g * dim * 255); bg[ci * 4 + 2] = clamp255(b * dim * 255);
      bg[ci * 4 + 3] = cellA[ci] < 0.5 ? 0 : 255;
    }
  }
  return { cols, rows, glyph, fg, bg, atlas };
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function rasterizeAscii(grid: AsciiGrid): Img {
  const { cols, rows, glyph, fg, bg, atlas } = grid;
  const { cw, ch, masks } = atlas;
  const W = cols * cw, H = rows * ch;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const ci = r * cols + c;
      const g = glyph[ci];
      const mask = g >= 0 ? masks[g] : null;
      const fr = fg[ci * 3], fgc = fg[ci * 3 + 1], fb = fg[ci * 3 + 2];
      const br = bg[ci * 4], bgg = bg[ci * 4 + 1], bb = bg[ci * 4 + 2], ba = bg[ci * 4 + 3] / 255;
      for (let y = 0; y < ch; y++) {
        let o = ((r * ch + y) * W + c * cw) * 4;
        for (let x = 0; x < cw; x++, o += 4) {
          const a = mask ? mask[y * cw + x] / 255 : 0;
          const outA = a + ba * (1 - a);
          if (outA <= 0) continue;
          out[o] = (fr * a + br * ba * (1 - a)) / outA;
          out[o + 1] = (fgc * a + bgg * ba * (1 - a)) / outA;
          out[o + 2] = (fb * a + bb * ba * (1 - a)) / outA;
          out[o + 3] = outA * 255;
        }
      }
    }
  return { w: W, h: H, data: out };
}

export function asciiText(grid: AsciiGrid): string {
  const lines: string[] = [];
  for (let r = 0; r < grid.rows; r++) {
    let line = '';
    for (let c = 0; c < grid.cols; c++) {
      const g = grid.glyph[r * grid.cols + c];
      line += g >= 0 ? grid.atlas.chars[g] : ' ';
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}
