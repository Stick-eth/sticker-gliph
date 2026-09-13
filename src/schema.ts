import type { ParamDef, SelectOption, Settings } from './core/types';

export const ALGORITHMS: SelectOption[] = [
  { value: 'ed:fs', label: 'Floyd-Steinberg', group: 'Error Diffusion' },
  { value: 'ed:ffs', label: 'False Floyd-Steinberg', group: 'Error Diffusion' },
  { value: 'ed:jjn', label: 'Jarvis-Judice-Ninke', group: 'Error Diffusion' },
  { value: 'ed:stucki', label: 'Stucki', group: 'Error Diffusion' },
  { value: 'ed:burkes', label: 'Burkes', group: 'Error Diffusion' },
  { value: 'ed:sierra3', label: 'Sierra', group: 'Error Diffusion' },
  { value: 'ed:sierra2', label: 'Sierra Two-Row', group: 'Error Diffusion' },
  { value: 'ed:sierralite', label: 'Sierra Lite', group: 'Error Diffusion' },
  { value: 'ed:atkinson', label: 'Atkinson', group: 'Error Diffusion' },
  { value: 'ed:stevenson', label: 'Stevenson-Arce', group: 'Error Diffusion' },
  { value: 'ed:shiaufan', label: 'Shiau-Fan', group: 'Error Diffusion' },
  { value: 'ed:shiaufan2', label: 'Shiau-Fan 2', group: 'Error Diffusion' },
  { value: 'ed:fan', label: 'Fan', group: 'Error Diffusion' },
  { value: 'ed:riemersma', label: 'Riemersma (Hilbert)', group: 'Error Diffusion' },
  { value: 'ed:row', label: 'Row Streak (1D)', group: 'Error Diffusion' },
  { value: 'ed:column', label: 'Column Drip (1D)', group: 'Error Diffusion' },
  { value: 'ed:glitch', label: 'Glitch Diffusion', group: 'Error Diffusion' },
  { value: 'ord:bayer2', label: 'Bayer 2x2', group: 'Ordered' },
  { value: 'ord:bayer4', label: 'Bayer 4x4', group: 'Ordered' },
  { value: 'ord:bayer8', label: 'Bayer 8x8', group: 'Ordered' },
  { value: 'ord:bayer16', label: 'Bayer 16x16', group: 'Ordered' },
  { value: 'ord:cluster4', label: 'Cluster Dot 4x4', group: 'Ordered' },
  { value: 'ord:cluster8', label: 'Cluster Dot 8x8', group: 'Ordered' },
  { value: 'ord:bluenoise', label: 'Blue Noise', group: 'Ordered' },
  { value: 'ord:ign', label: 'Interleaved Gradient', group: 'Ordered' },
  { value: 'ord:white', label: 'White Noise', group: 'Ordered' },
  { value: 'pat:lines', label: 'Lines', group: 'Pattern' },
  { value: 'pat:crosshatch', label: 'Crosshatch', group: 'Pattern' },
  { value: 'pat:dots', label: 'Dot Screen', group: 'Pattern' },
  { value: 'pat:waves', label: 'Wave Dither', group: 'Pattern' },
  { value: 'pat:modulation', label: 'Modulation Lines', group: 'Pattern' },
  { value: 'pat:rings', label: 'Concentric Rings', group: 'Pattern' },
  { value: 'pat:spiral', label: 'Spiral', group: 'Pattern' },
  { value: 'pat:checker', label: 'Checker Grid', group: 'Pattern' },
  { value: 'pat:diamond', label: 'Diamond Mesh', group: 'Pattern' },
  { value: 'pat:jitter', label: 'Jitter Lines', group: 'Pattern' },
  { value: 'pat:glitchbitmap', label: 'Glitched Bitmap', group: 'Pattern' },
  { value: 'thr:threshold', label: 'Threshold (no dither)', group: 'Other' },
];

const isED = (v: Record<string, any>) => String(v.algorithm).startsWith('ed:');
const isOrd = (v: Record<string, any>) => String(v.algorithm).startsWith('ord:');
const isPat = (v: Record<string, any>) => String(v.algorithm).startsWith('pat:');

export const DITHER_DEFS: ParamDef[] = [
  { key: 'algorithm', label: 'Algorithm', type: 'select', options: ALGORITHMS, default: 'ed:fs' },
  { key: 'pixelSize', label: 'Pixel Size', type: 'range', min: 1, max: 48, step: 1, default: 3, animatable: true, unit: 'px' },
  {
    key: 'colorMode', label: 'Colour Mode', type: 'select', default: 'palette',
    options: [
      { value: 'palette', label: 'Palette (nearest colour)' },
      { value: 'ramp', label: 'Luminance ramp (gradient map)' },
      { value: 'source', label: '1-bit mask, source colours' },
      { value: 'rgb', label: 'RGB levels' },
    ],
  },
  { key: 'levels', label: 'Levels / channel', type: 'range', min: 2, max: 16, step: 1, default: 2, showIf: (v) => v.colorMode === 'rgb' },
  {
    key: 'metric', label: 'Colour Distance', type: 'select', default: 'redmean', showIf: (v) => v.colorMode === 'palette',
    options: [
      { value: 'redmean', label: 'Redmean (perceptual RGB)' },
      { value: 'oklab', label: 'OKLab' },
      { value: 'rgb', label: 'Euclidean RGB' },
    ],
  },
  { key: 'strength', label: 'Dither Strength', type: 'range', min: 0, max: 1.5, step: 0.01, default: 1, animatable: true },
  { key: 'threshold', label: 'Threshold Bias', type: 'range', min: -0.5, max: 0.5, step: 0.01, default: 0, animatable: true },
  { key: 'noise', label: 'Threshold Noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0, animatable: true },
  { key: 'serpentine', label: 'Serpentine Scan', type: 'toggle', default: true, showIf: isED },
  { key: 'errorClamp', label: 'Error Bleed Limit', type: 'range', min: 0.05, max: 2, step: 0.01, default: 2, showIf: isED, hint: 'Lower values stop error streaks' },
  { key: 'matrixScale', label: 'Matrix Scale', type: 'range', min: 1, max: 16, step: 1, default: 1, showIf: isOrd },
  { key: 'period', label: 'Pattern Period', type: 'range', min: 2, max: 96, step: 0.5, default: 6, animatable: true, showIf: (v) => isPat(v) || v.algorithm === 'ed:glitch' },
  { key: 'angle', label: 'Angle', type: 'range', min: -90, max: 90, step: 1, default: 0, animatable: true, unit: 'deg', showIf: (v) => isPat(v) || isOrd(v) },
  { key: 'modulation', label: 'Modulation', type: 'range', min: 0, max: 4, step: 0.01, default: 1, animatable: true, showIf: isPat },
  { key: 'phase', label: 'Phase', type: 'range', min: 0, max: 10, step: 0.01, default: 0, animatable: true, showIf: isPat },
  { key: 'speed', label: 'Pattern Drift', type: 'range', min: -4, max: 4, step: 0.01, default: 0, showIf: (v) => isPat(v) || isOrd(v), hint: 'Periods per second' },
  {
    key: 'transparent', label: 'Transparent Colour', type: 'select', default: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'darkest', label: 'Darkest palette colour' },
      { value: 'lightest', label: 'Lightest palette colour' },
    ],
  },
];

export const HALFTONE_DEFS: ParamDef[] = [
  {
    key: 'colorMode', label: 'Screen', type: 'select', default: 'cmyk',
    options: [
      { value: 'mono', label: 'Mono (ink on paper)' },
      { value: 'cmyk', label: 'CMYK process' },
      { value: 'rgb', label: 'RGB additive' },
    ],
  },
  {
    key: 'shape', label: 'Dot Shape', type: 'select', default: 'round',
    options: [
      { value: 'round', label: 'Round' },
      { value: 'ellipse', label: 'Ellipse' },
      { value: 'diamond', label: 'Diamond' },
      { value: 'square', label: 'Square' },
      { value: 'line', label: 'Line' },
      { value: 'cross', label: 'Cross' },
    ],
  },
  { key: 'cellSize', label: 'Cell Size', type: 'range', min: 2, max: 96, step: 0.5, default: 8, animatable: true, unit: 'px' },
  { key: 'angle', label: 'Screen Angle', type: 'range', min: 0, max: 90, step: 0.5, default: 45, animatable: true, unit: 'deg' },
  { key: 'dotGain', label: 'Dot Gain', type: 'range', min: 0.2, max: 2, step: 0.01, default: 1, animatable: true },
  { key: 'softness', label: 'Edge Softness', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
  { key: 'usePalette', label: 'Ink/Paper from palette', type: 'toggle', default: false, showIf: (v) => v.colorMode === 'mono' },
  { key: 'inkColor', label: 'Ink', type: 'color', default: '#1c1a18', showIf: (v) => v.colorMode === 'mono' && !v.usePalette },
  { key: 'paperColor', label: 'Paper', type: 'color', default: '#f1ead8', showIf: (v) => v.colorMode !== 'rgb' && !(v.colorMode === 'mono' && v.usePalette) },
  { key: 'gcr', label: 'Black Generation (GCR)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, showIf: (v) => v.colorMode === 'cmyk' },
  { key: 'misregister', label: 'Misregistration', type: 'range', min: 0, max: 12, step: 0.1, default: 0, animatable: true, unit: 'px', showIf: (v) => v.colorMode !== 'mono' },
];

export const ASCII_FONTS: SelectOption[] = [
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Cascadia Mono', label: 'Cascadia Mono' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Lucida Console', label: 'Lucida Console' },
  { value: 'Segoe UI Symbol', label: 'Segoe UI Symbol' },
  { value: 'Old English Text MT', label: 'Old English Text MT (blackletter)' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Arial Black', label: 'Arial Black' },
  { value: 'Impact', label: 'Impact' },
  { value: 'monospace', label: 'System monospace' },
  { value: 'serif', label: 'System serif' },
];

export const ASCII_DEFS: ParamDef[] = [
  { key: 'custom', label: 'Custom Injection', type: 'text', default: '', maxLength: 10, placeholder: 'up to 10 glyphs' },
  {
    key: 'customMode', label: 'Injection Mode', type: 'select', default: 'add', showIf: (v) => !!v.custom,
    options: [
      { value: 'add', label: 'Inject into set' },
      { value: 'only', label: 'Use injected glyphs only' },
    ],
  },
  { key: 'cellSize', label: 'Cell Size', type: 'range', min: 3, max: 64, step: 1, default: 10, animatable: true, unit: 'px' },
  { key: 'aspect', label: 'Cell Aspect (h/w)', type: 'range', min: 0.5, max: 3, step: 0.05, default: 1 },
  { key: 'depth', label: 'Character Depth', type: 'range', min: 2, max: 128, step: 1, default: 16, animatable: true, hint: 'Number of glyphs used from the set' },
  { key: 'offset', label: 'Character Offset', type: 'range', min: -128, max: 128, step: 0.1, default: 0, animatable: true, hint: 'Shifts the luminance to glyph mapping' },
  {
    key: 'offsetMode', label: 'Offset Edge', type: 'select', default: 'wrap',
    options: [
      { value: 'wrap', label: 'Wrap around' },
      { value: 'clamp', label: 'Clamp' },
    ],
  },
  {
    key: 'mapping', label: 'Glyph Mapping', type: 'select', default: 'density',
    options: [
      { value: 'density', label: 'Density (luminance)' },
      { value: 'structure', label: 'Structure (shape match)' },
    ],
  },
  { key: 'structureMix', label: 'Shape vs Tone', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, showIf: (v) => v.mapping === 'structure' },
  {
    key: 'glyphDither', label: 'Glyph Dithering', type: 'select', default: 'none', showIf: (v) => v.mapping === 'density',
    options: [
      { value: 'none', label: 'None' },
      { value: 'fs', label: 'Floyd-Steinberg' },
      { value: 'atkinson', label: 'Atkinson' },
      { value: 'bayer', label: 'Bayer 4x4' },
    ],
  },
  { key: 'brightDense', label: 'Bright = dense glyph', type: 'toggle', default: true },
  { key: 'includeSpace', label: 'Include blank glyph', type: 'toggle', default: true },
  { key: 'blankBelow', label: 'Blank Below', type: 'range', min: 0, max: 1, step: 0.01, default: 0, animatable: true },
  { key: 'font', label: 'Font', type: 'select', options: ASCII_FONTS, default: 'Consolas' },
  { key: 'customFont', label: 'Custom Font Name', type: 'text', default: '', placeholder: 'any installed font' },
  {
    key: 'weight', label: 'Weight', type: 'select', default: 'normal',
    options: [
      { value: 'normal', label: 'Regular' },
      { value: 'bold', label: 'Bold' },
    ],
  },
  { key: 'glyphScale', label: 'Glyph Scale', type: 'range', min: 0.4, max: 2.5, step: 0.01, default: 1, animatable: true },
  {
    key: 'colorMode', label: 'Glyph Colour', type: 'select', default: 'mono',
    options: [
      { value: 'mono', label: 'Single colour' },
      { value: 'source', label: 'Source colours' },
      { value: 'palette', label: 'Palette mapped (nearest)' },
      { value: 'ramp', label: 'Palette ramp (luminance)' },
    ],
  },
  { key: 'fgColor', label: 'Glyph Colour', type: 'color', default: '#e9dcbc', showIf: (v) => v.colorMode === 'mono' },
  { key: 'saturation', label: 'Colour Boost', type: 'range', min: 0, max: 3, step: 0.01, default: 1, showIf: (v) => v.colorMode === 'source' },
  {
    key: 'bgMode', label: 'Background', type: 'select', default: 'color',
    options: [
      { value: 'color', label: 'Custom colour' },
      { value: 'transparent', label: 'Transparent' },
      { value: 'source', label: 'Dimmed source' },
    ],
  },
  { key: 'bgColor', label: 'Background Colour', type: 'color', default: '#0e0b09', showIf: (v) => v.bgMode === 'color' },
  { key: 'bgDim', label: 'Background Dim', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, animatable: true, showIf: (v) => v.bgMode === 'source' },
];

export const ADJUST_DEFS: ParamDef[] = [
  { key: 'exposure', label: 'Exposure', type: 'range', min: -3, max: 3, step: 0.01, default: 0, animatable: true },
  { key: 'brightness', label: 'Brightness', type: 'range', min: -1, max: 1, step: 0.01, default: 0, animatable: true },
  { key: 'contrast', label: 'Contrast', type: 'range', min: -1, max: 1, step: 0.01, default: 0, animatable: true },
  { key: 'gamma', label: 'Gamma', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1, animatable: true },
  { key: 'blackPoint', label: 'Black Point', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
  { key: 'whitePoint', label: 'White Point', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
  { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 3, step: 0.01, default: 1, animatable: true },
  { key: 'hue', label: 'Hue Shift', type: 'range', min: -180, max: 180, step: 1, default: 0, animatable: true, unit: 'deg' },
  { key: 'blur', label: 'Pre Blur', type: 'range', min: 0, max: 20, step: 0.1, default: 0, animatable: true },
  { key: 'sharpen', label: 'Pre Sharpen', type: 'range', min: 0, max: 4, step: 0.01, default: 0 },
  { key: 'invert', label: 'Invert', type: 'toggle', default: false },
];

export const TEMPORAL_DEFS: ParamDef[] = [
  {
    key: 'pattern', label: 'Pattern', type: 'select', default: 'none',
    options: [
      { value: 'none', label: 'Off' },
      { value: 'static', label: 'TV Static' },
      { value: 'blue', label: 'Blue Noise Drift' },
      { value: 'scanroll', label: 'Scanline Roll' },
      { value: 'interlace', label: 'Interlace Flicker' },
      { value: 'sine', label: 'Sine Wave' },
      { value: 'vhs', label: 'VHS Tracking' },
      { value: 'band', label: 'Rolling Band' },
      { value: 'flicker', label: 'CRT Flicker' },
      { value: 'grain', label: 'Film Grain' },
    ],
  },
  { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, animatable: true, showIf: (v) => v.pattern !== 'none' },
  { key: 'speed', label: 'Speed', type: 'range', min: 0, max: 8, step: 0.01, default: 1, showIf: (v) => v.pattern !== 'none' },
  { key: 'scale', label: 'Scale', type: 'range', min: 1, max: 64, step: 0.5, default: 4, showIf: (v) => v.pattern !== 'none' },
  { key: 'seed', label: 'Seed', type: 'range', min: 0, max: 999, step: 1, default: 1, showIf: (v) => v.pattern !== 'none' },
];

export function defaultsOf(defs: ParamDef[]): Record<string, any> {
  const o: Record<string, any> = {};
  for (const d of defs) o[d.key] = d.default;
  return o;
}

export function createDefaultSettings(): Settings {
  return {
    version: 1,
    mode: 'ascii',
    adjust: defaultsOf(ADJUST_DEFS),
    temporal: defaultsOf(TEMPORAL_DEFS),
    dither: defaultsOf(DITHER_DEFS),
    halftone: defaultsOf(HALFTONE_DEFS),
    ascii: { ...defaultsOf(ASCII_DEFS), charset: 'classic-standard' },
    palette: { name: 'Illuminated Manuscript', colors: ['#1b1410', '#5a1a12', '#8c2a1a', '#b8862b', '#d9c79e', '#f1e6c8'] },
    effects: [],
    anim: { duration: 6, fps: 30 },
    keyframes: {},
  };
}

export const SECTION_DEFS: Record<string, ParamDef[]> = {
  adjust: ADJUST_DEFS,
  temporal: TEMPORAL_DEFS,
  dither: DITHER_DEFS,
  halftone: HALFTONE_DEFS,
  ascii: ASCII_DEFS,
};
