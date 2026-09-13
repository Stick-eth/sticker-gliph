import type { FImg, Img, Settings } from '../core/types';
import { hexToRgb, type RGB } from '../core/color';
import { resampleRGBA } from '../core/image';
import { applyAdjust } from './adjust';
import { ditherGrid } from './dither';
import { renderHalftone } from './halftone';
import { asciiLayout, asciiText, buildAsciiGrid, rasterizeAscii, type AsciiGrid } from './ascii/ascii';
import { EFFECTS, type EffectContext } from './effects/effects';
import { effectDef } from './effects/defs';
import { defaultsOf } from '../schema';

export interface RenderParams {
  settings: Settings;
  srcW: number; // nominal source size (composition space)
  srcH: number;
  time: number;
  frame: number;
  scale: number; // output px per source px
  wantText?: boolean;
  skipEffects?: boolean;
}

export interface StageData {
  mode: Settings['mode'];
  palette: RGB[];
  ditherGrid?: { w: number; h: number; data: Uint8ClampedArray; cell: number };
  ascii?: AsciiGrid;
  halftone?: { sample: FImg; W: number; H: number; cellPx: number };
}

export interface RenderResult {
  img: Img;
  text?: string;
  gridW: number;
  gridH: number;
  stage: StageData;
}

function toImg(f: FImg): Img {
  const out = new Uint8ClampedArray(f.w * f.h * 4);
  for (let i = 0; i < out.length; i++) out[i] = f.d[i] * 255;
  return { w: f.w, h: f.h, data: out };
}

function upscale(grid: Uint8ClampedArray, gw: number, gh: number, cell: number): Img {
  if (cell === 1) return { w: gw, h: gh, data: grid };
  const W = gw * cell, H = gh * cell;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < gh; y++) {
    const rowStart = y * cell * W * 4;
    // Build one output row then copy it `cell` times.
    for (let x = 0; x < gw; x++) {
      const s = (y * gw + x) * 4;
      for (let k = 0; k < cell; k++) {
        const o = rowStart + (x * cell + k) * 4;
        out[o] = grid[s]; out[o + 1] = grid[s + 1]; out[o + 2] = grid[s + 2]; out[o + 3] = grid[s + 3];
      }
    }
    for (let k = 1; k < cell; k++) out.copyWithin(rowStart + k * W * 4, rowStart, rowStart + W * 4);
  }
  return { w: W, h: H, data: out };
}

export async function renderPipeline(src: Img, rp: RenderParams, state: Map<string, any>): Promise<RenderResult> {
  const s = rp.settings;
  const palette = (s.palette?.colors || []).map(hexToRgb);
  const stage: StageData = { mode: s.mode, palette };
  let img: Img;
  let gridW: number, gridH: number;
  let text: string | undefined;

  if (s.mode === 'dither') {
    const px = Math.max(1, s.dither.pixelSize || 1);
    gridW = Math.max(1, Math.round(rp.srcW / px));
    gridH = Math.max(1, Math.round(rp.srcH / px));
    const cell = Math.max(1, Math.round(px * rp.scale));
    const sample = resampleRGBA(src, gridW, gridH);
    applyAdjust(sample, s.adjust, s.temporal, rp.time, rp.frame);
    const grid = ditherGrid(sample, s.dither, { palette, time: rp.time, frame: rp.frame });
    stage.ditherGrid = { w: gridW, h: gridH, data: grid, cell };
    img = upscale(grid, gridW, gridH, cell);
  } else if (s.mode === 'ascii') {
    const layout = asciiLayout(rp.srcW, rp.srcH, s.ascii, rp.scale);
    gridW = layout.cols;
    gridH = layout.rows;
    const sample = resampleRGBA(src, layout.cols * layout.sub, layout.rows * layout.sub);
    applyAdjust(sample, s.adjust, s.temporal, rp.time, rp.frame);
    const grid = buildAsciiGrid(sample, layout, s.ascii, palette);
    stage.ascii = grid;
    img = rasterizeAscii(grid);
    if (rp.wantText) text = asciiText(grid);
  } else if (s.mode === 'halftone') {
    const W = Math.max(1, Math.round(rp.srcW * rp.scale));
    const H = Math.max(1, Math.round(rp.srcH * rp.scale));
    const cellPx = Math.max(1.5, (s.halftone.cellSize || 8) * rp.scale);
    const sw = Math.max(1, Math.min(W, Math.round((W / cellPx) * 3)));
    const sh = Math.max(1, Math.min(H, Math.round((H / cellPx) * 3)));
    const sample = resampleRGBA(src, sw, sh);
    applyAdjust(sample, s.adjust, s.temporal, rp.time, rp.frame);
    gridW = Math.round(W / cellPx);
    gridH = Math.round(H / cellPx);
    stage.halftone = { sample, W, H, cellPx };
    img = renderHalftone(sample, W, H, s.halftone, palette, rp.scale);
  } else {
    const W = Math.max(1, Math.round(rp.srcW * rp.scale));
    const H = Math.max(1, Math.round(rp.srcH * rp.scale));
    const sample = resampleRGBA(src, W, H);
    applyAdjust(sample, s.adjust, s.temporal, rp.time, rp.frame);
    gridW = W;
    gridH = H;
    img = toImg(sample);
  }

  if (!rp.skipEffects) {
    for (const fx of s.effects || []) {
      if (!fx.enabled) continue;
      const fn = EFFECTS[fx.type];
      const def = effectDef(fx.type);
      if (!fn || !def) continue;
      const ctx: EffectContext = { id: fx.id, scale: rp.scale, time: rp.time, frame: rp.frame, fps: s.anim?.fps || 30, palette, state };
      try {
        img = await fn(img, { ...defaultsOf(def.params), ...fx.params }, ctx);
      } catch (err) {
        console.warn('Effect failed', fx.type, err);
      }
    }
  }

  return { img, text, gridW, gridH, stage };
}
