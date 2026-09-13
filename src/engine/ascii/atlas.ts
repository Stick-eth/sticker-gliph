/**
 * Glyph atlas: renders every glyph of a set into coverage masks.
 * Density and 4x4 structure descriptors are measured at a fixed reference size so
 * glyph ordering stays identical between preview and export resolutions.
 */

export const DESC = 4; // descriptor grid DESC x DESC

export interface GlyphAtlas {
  chars: string[];
  cw: number;
  ch: number;
  masks: Uint8Array[]; // cw*ch coverage 0..255 per glyph, ordered like `chars`
  density: Float32Array; // normalized 0..1
  desc: Float32Array; // chars.length * DESC*DESC, normalized 0..1
  fontSize: number;
  fontCss: string;
}

const FALLBACK = '"Segoe UI Symbol", "Segoe UI Historic", "Segoe UI Emoji", "Noto Sans Symbols", "Noto Sans Symbols 2", "Apple Symbols", "MS Gothic", monospace';

export function fontStack(font: string): string {
  const f = (font || 'monospace').trim();
  const generic = ['monospace', 'serif', 'sans-serif', 'cursive', 'fantasy'];
  const head = generic.includes(f) ? f : `"${f.replace(/"/g, '')}"`;
  return `${head}, ${FALLBACK}`;
}

type Ctx2D = OffscreenCanvasRenderingContext2D;

function makeCtx(w: number, h: number): Ctx2D {
  const c = new OffscreenCanvas(w, h);
  return c.getContext('2d', { willReadFrequently: true }) as Ctx2D;
}

/** Font size that fits the 90th percentile glyph box into a cell. */
function fitFontSize(ctx: Ctx2D, chars: string[], cw: number, ch: number, stack: string, weight: string): number {
  const probe = 100;
  ctx.font = `${weight} ${probe}px ${stack}`;
  const ws: number[] = [];
  const hs: number[] = [];
  for (const c of chars) {
    if (c === ' ') continue;
    const m = ctx.measureText(c);
    const bw = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || m.width);
    const bh = (m.actualBoundingBoxAscent || probe * 0.75) + (m.actualBoundingBoxDescent || probe * 0.2);
    ws.push(Math.max(bw, m.width * 0.9));
    hs.push(bh);
  }
  if (!ws.length) return ch;
  ws.sort((a, b) => a - b);
  hs.sort((a, b) => a - b);
  const pw = ws[Math.floor((ws.length - 1) * 0.9)];
  const phh = hs[Math.floor((hs.length - 1) * 0.9)];
  // Use font line metrics for height so glyphs of a set share a baseline scale.
  const m = ctx.measureText('Mg|');
  const lineH = Math.max(phh, (m.actualBoundingBoxAscent || 75) + (m.actualBoundingBoxDescent || 20));
  return Math.max(1, Math.min(cw / pw, ch / lineH) * probe);
}

function renderMasks(chars: string[], cw: number, ch: number, stack: string, weight: string, size: number): Uint8Array[] {
  const ctx = makeCtx(cw, ch);
  ctx.font = `${weight} ${size}px ${stack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  const ref = ctx.measureText('Mg|');
  const asc = ref.actualBoundingBoxAscent || size * 0.75;
  const desc = ref.actualBoundingBoxDescent || size * 0.2;
  const baseline = ch / 2 + (asc - desc) / 2;
  const masks: Uint8Array[] = [];
  for (const c of chars) {
    ctx.clearRect(0, 0, cw, ch);
    const mask = new Uint8Array(cw * ch);
    if (c !== ' ') {
      const m = ctx.measureText(c);
      // Horizontally centre on the ink box, vertically on the shared baseline.
      const inkL = m.actualBoundingBoxLeft || 0;
      const inkR = m.actualBoundingBoxRight || m.width / 2;
      const dx = (inkL - inkR) / 2;
      const gAsc = m.actualBoundingBoxAscent;
      const gDesc = m.actualBoundingBoxDescent;
      let by = baseline;
      // Glyphs far outside the line box (symbols) get centred on their own box.
      if (gAsc !== undefined && gDesc !== undefined && (gAsc > asc * 1.15 || gDesc > desc * 1.6)) by = ch / 2 + (gAsc - gDesc) / 2;
      ctx.fillText(c, cw / 2 + dx, by);
      const data = ctx.getImageData(0, 0, cw, ch).data;
      for (let i = 0; i < cw * ch; i++) mask[i] = data[i * 4 + 3];
    }
    masks.push(mask);
  }
  return masks;
}

const cache = new Map<string, GlyphAtlas>();

export function getAtlas(chars: string[], font: string, weight: string, cw: number, ch: number, glyphScale: number): GlyphAtlas {
  cw = Math.max(1, Math.round(cw));
  ch = Math.max(1, Math.round(ch));
  const key = [chars.join(''), font, weight, cw, ch, glyphScale.toFixed(3)].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  const stack = fontStack(font);
  // Reference measurement at a fixed cell size keeps ordering resolution independent.
  const aspect = ch / cw;
  const RW = 32;
  const RH = Math.max(8, Math.round(RW * aspect));
  const refCtx = makeCtx(RW, RH);
  const refSize = fitFontSize(refCtx, chars, RW, RH, stack, weight) * glyphScale;
  const refMasks = renderMasks(chars, RW, RH, stack, weight, refSize);

  const n = chars.length;
  const density = new Float32Array(n);
  const desc = new Float32Array(n * DESC * DESC);
  for (let g = 0; g < n; g++) {
    const m = refMasks[g];
    let sum = 0;
    for (let y = 0; y < RH; y++) {
      const dy = Math.min(DESC - 1, Math.floor((y / RH) * DESC));
      for (let x = 0; x < RW; x++) {
        const v = m[y * RW + x] / 255;
        sum += v;
        const dx = Math.min(DESC - 1, Math.floor((x / RW) * DESC));
        desc[g * DESC * DESC + dy * DESC + dx] += v;
      }
    }
    density[g] = sum / (RW * RH);
    const cellArea = (RW / DESC) * (RH / DESC);
    for (let k = 0; k < DESC * DESC; k++) desc[g * DESC * DESC + k] /= cellArea;
  }
  let dmin = Infinity, dmax = -Infinity;
  for (let g = 0; g < n; g++) { dmin = Math.min(dmin, density[g]); dmax = Math.max(dmax, density[g]); }
  const range = dmax - dmin || 1;
  for (let g = 0; g < n; g++) density[g] = (density[g] - dmin) / range;
  let smax = 0;
  for (let k = 0; k < desc.length; k++) smax = Math.max(smax, desc[k]);
  if (smax > 0) for (let k = 0; k < desc.length; k++) desc[k] /= smax;

  const ctx = makeCtx(cw, ch);
  const size = fitFontSize(ctx, chars, cw, ch, stack, weight) * glyphScale;
  const masks = renderMasks(chars, cw, ch, stack, weight, size);

  const atlas: GlyphAtlas = { chars, cw, ch, masks, density, desc, fontSize: size, fontCss: `${weight} ${size}px ${stack}` };
  if (cache.size > 24) cache.delete(cache.keys().next().value as string);
  cache.set(key, atlas);
  return atlas;
}
