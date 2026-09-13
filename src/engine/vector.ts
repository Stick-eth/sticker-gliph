import { rgbToHex, sortByLuma } from '../core/color';
import type { StageData } from './pipeline';
import type { Settings } from '../core/types';
import { fontStack } from './ascii/atlas';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Builds an SVG for the current stage. Post effects are raster only and are not included. */
export function stageToSvg(stage: StageData, settings: Settings, opts: { dropLightest?: boolean; dropDarkest?: boolean }): string | null {
  if (stage.ditherGrid) return ditherSvg(stage, opts);
  if (stage.ascii) return asciiSvg(stage, settings);
  if (stage.halftone) return halftoneSvg(stage, settings);
  return null;
}

/** Colour HTML page of the ASCII grid (one span per colour run). */
export function stageToHtml(stage: StageData, settings: Settings): string | null {
  const g = stage.ascii;
  if (!g) return null;
  const s = settings.ascii;
  const font = (s.customFont && String(s.customFont).trim()) || s.font || 'Consolas';
  const bg = s.bgMode === 'color' ? s.bgColor : s.bgMode === 'transparent' ? 'transparent' : '#000';
  const lines: string[] = [];
  for (let r = 0; r < g.rows; r++) {
    let line = '';
    let c = 0;
    while (c < g.cols) {
      const i = r * g.cols + c;
      const hex = rgbToHex(g.fg[i * 3], g.fg[i * 3 + 1], g.fg[i * 3 + 2]);
      let chars = '';
      let e = c;
      while (e < g.cols) {
        const j = r * g.cols + e;
        const ghex = rgbToHex(g.fg[j * 3], g.fg[j * 3 + 1], g.fg[j * 3 + 2]);
        if (g.glyph[j] >= 0 && ghex !== hex) break;
        chars += g.glyph[j] >= 0 ? g.atlas.chars[g.glyph[j]] : ' ';
        e++;
      }
      line += `<span style="color:${hex}">${esc(chars)}</span>`;
      c = e;
    }
    lines.push(line);
  }
  const lh = (g.atlas.ch / g.atlas.cw).toFixed(3);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sticker Gliph ASCII</title><style>
body{margin:0;background:${esc(bg)};display:flex;justify-content:center}
pre{font-family:${esc(fontStack(font))};font-weight:${esc(s.weight || 'normal')};font-size:10px;line-height:${lh}em;letter-spacing:0;margin:16px}
</style></head><body><pre>${lines.join('\n')}</pre></body></html>`;
}

function ditherSvg(stage: StageData, opts: { dropLightest?: boolean; dropDarkest?: boolean }): string {
  const { w, h, data, cell } = stage.ditherGrid!;
  const paths = new Map<string, string[]>();
  const ramp = sortByLuma(stage.palette);
  const skip = new Set<string>();
  if (opts.dropLightest && ramp.length) skip.add(rgbToHex(...ramp[ramp.length - 1]));
  if (opts.dropDarkest && ramp.length) skip.add(rgbToHex(...ramp[0]));
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const o = (y * w + x) * 4;
      if (data[o + 3] === 0) { x++; continue; }
      const hex = rgbToHex(data[o], data[o + 1], data[o + 2]);
      let e = x + 1;
      while (e < w) {
        const q = (y * w + e) * 4;
        if (data[q + 3] === 0 || data[q] !== data[o] || data[q + 1] !== data[o + 1] || data[q + 2] !== data[o + 2]) break;
        e++;
      }
      if (!skip.has(hex)) {
        let arr = paths.get(hex);
        if (!arr) paths.set(hex, (arr = []));
        arr.push(`M${x} ${y}h${e - x}v1h${x - e}z`);
      }
      x = e;
    }
  }
  const body = [...paths.entries()].map(([hex, d]) => `<path fill="${hex}" d="${d.join('')}"/>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * cell}" height="${h * cell}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">\n${body}\n</svg>`;
}

function asciiSvg(stage: StageData, settings: Settings): string {
  const g = stage.ascii!;
  const { cols, rows, glyph, fg, bg, atlas } = g;
  const { cw, ch } = atlas;
  const W = cols * cw, H = rows * ch;
  const s = settings.ascii;
  const font = (s.customFont && String(s.customFont).trim()) || s.font || 'Consolas';
  const parts: string[] = [];
  if (s.bgMode === 'color') parts.push(`<rect width="${W}" height="${H}" fill="${esc(s.bgColor)}"/>`);
  else if (s.bgMode === 'source') {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (bg[i * 4 + 3] === 0) continue;
        parts.push(`<rect x="${c * cw}" y="${r * ch}" width="${cw}" height="${ch}" fill="${rgbToHex(bg[i * 4], bg[i * 4 + 1], bg[i * 4 + 2])}"/>`);
      }
  }
  parts.push(`<g font-family='${esc(fontStack(font))}' font-weight="${esc(s.weight || 'normal')}" font-size="${atlas.fontSize.toFixed(2)}" text-anchor="middle" dominant-baseline="central">`);
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      const i = r * cols + c;
      if (glyph[i] < 0) { c++; continue; }
      const hex = rgbToHex(fg[i * 3], fg[i * 3 + 1], fg[i * 3 + 2]);
      let chars = '';
      const xs: string[] = [];
      let e = c;
      while (e < cols) {
        const j = r * cols + e;
        if (glyph[j] < 0) break;
        if (rgbToHex(fg[j * 3], fg[j * 3 + 1], fg[j * 3 + 2]) !== hex) break;
        chars += atlas.chars[glyph[j]];
        xs.push((e * cw + cw / 2).toFixed(1));
        e++;
      }
      parts.push(`<text x="${xs.join(' ')}" y="${(r * ch + ch / 2).toFixed(1)}" fill="${hex}">${esc(chars)}</text>`);
      c = e;
    }
  }
  parts.push('</g>');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join('\n')}\n</svg>`;
}

function halftoneSvg(stage: StageData, settings: Settings): string {
  const { sample, W, H, cellPx: size } = stage.halftone!;
  const s = settings.halftone;
  const mode = s.colorMode || 'cmyk';
  const gcr = s.gcr ?? 0.7;
  const base = ((s.angle ?? 45) * Math.PI) / 180;
  const deg = Math.PI / 180;
  const ramp = sortByLuma(stage.palette.length ? stage.palette : [[0, 0, 0], [255, 255, 255]]);
  const paper = mode === 'mono' && s.usePalette ? rgbToHex(...ramp[ramp.length - 1]) : s.paperColor;
  const inkMono = mode === 'mono' && s.usePalette ? rgbToHex(...ramp[0]) : s.inkColor;
  const sampleAt = (x: number, y: number) => {
    const sx = Math.min(sample.w - 1, Math.max(0, Math.floor((x / W) * sample.w)));
    const sy = Math.min(sample.h - 1, Math.max(0, Math.floor((y / H) * sample.h)));
    const o = (sy * sample.w + sx) * 4;
    return [sample.d[o], sample.d[o + 1], sample.d[o + 2]];
  };
  type Ch = { angle: number; color: string; tone: (c: number[]) => number };
  let chans: Ch[];
  if (mode === 'mono') chans = [{ angle: base, color: inkMono, tone: (c) => 1 - (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) }];
  else if (mode === 'rgb') chans = [
    { angle: base - 30 * deg, color: '#ff0000', tone: (c) => c[0] },
    { angle: base + 30 * deg, color: '#00ff00', tone: (c) => c[1] },
    { angle: base - 45 * deg, color: '#0000ff', tone: (c) => c[2] },
  ];
  else {
    const k = (c: number[]) => gcr * (1 - Math.max(c[0], c[1], c[2]));
    const ch = (v: number, c: number[]) => { const kk = k(c); return kk >= 0.999 ? 0 : (1 - v - kk) / (1 - kk); };
    chans = [
      { angle: base - 30 * deg, color: '#00aeef', tone: (c) => ch(c[0], c) },
      { angle: base + 30 * deg, color: '#ec008c', tone: (c) => ch(c[1], c) },
      { angle: base - 45 * deg, color: '#fff200', tone: (c) => ch(c[2], c) },
      { angle: base, color: '#231f20', tone: k },
    ];
  }
  const gain = s.dotGain ?? 1;
  const shapeSquare = s.shape === 'square' || s.shape === 'diamond';
  const out: string[] = [];
  if (mode !== 'rgb') out.push(`<rect width="${W}" height="${H}" fill="${esc(paper)}"/>`);
  else out.push(`<rect width="${W}" height="${H}" fill="#000"/>`);
  const diag = Math.hypot(W, H);
  for (const c of chans) {
    const ca = Math.cos(c.angle), sa = Math.sin(c.angle);
    const n = Math.ceil(diag / size) + 1;
    const blend = mode === 'rgb' ? 'screen' : 'multiply';
    const shapes: string[] = [];
    for (let v = -n; v <= n; v++)
      for (let u = -n; u <= n; u++) {
        const cu = (u + 0.5) * size, cv = (v + 0.5) * size;
        const x = cu * ca - cv * sa, y = cu * sa + cv * ca;
        if (x < -size || y < -size || x > W + size || y > H + size) continue;
        const cov = Math.max(0, Math.min(1, c.tone(sampleAt(x, y)) * gain));
        if (cov < 0.01) continue;
        if (shapeSquare) {
          const side = Math.sqrt(cov) * size;
          const rot = (c.angle / deg + (s.shape === 'diamond' ? 45 : 0)).toFixed(1);
          shapes.push(`<rect x="${(x - side / 2).toFixed(2)}" y="${(y - side / 2).toFixed(2)}" width="${side.toFixed(2)}" height="${side.toFixed(2)}" transform="rotate(${rot} ${x.toFixed(2)} ${y.toFixed(2)})"/>`);
        } else {
          const r = Math.min(size * 0.72, Math.sqrt(cov / Math.PI) * size);
          shapes.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}"/>`);
        }
      }
    out.push(`<g fill="${c.color}" style="mix-blend-mode:${blend}">${shapes.join('')}</g>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${out.join('\n')}\n</svg>`;
}
