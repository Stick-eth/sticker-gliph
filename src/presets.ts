import { paletteByName } from './core/palettes';
import { effectDef } from './engine/effects/defs';
import { defaultsOf } from './schema';

export interface PresetDef {
  name: string;
  tag: string;
  settings: any;
}

const pal = (name: string) => ({ name, colors: paletteByName(name)?.colors ?? ['#000000', '#ffffff'] });

let n = 0;
const fx = (type: string, params: Record<string, any> = {}, enabled = true) => ({
  id: `fx_p${n++}`,
  type,
  enabled,
  params: { ...defaultsOf(effectDef(type)!.params), ...params },
});

export const BUILTIN_PRESETS: PresetDef[] = [
  {
    name: 'Scribe of the Crypt', tag: 'Glyphs',
    settings: {
      mode: 'ascii',
      ascii: { charset: 'classic-detailed', cellSize: 9, depth: 32, colorMode: 'mono', fgColor: '#e9dcbc', bgMode: 'color', bgColor: '#0e0b09', mapping: 'density', glyphDither: 'none' },
      adjust: { contrast: 0.15 },
      effects: [fx('glow', { threshold: 0.5, radius: 18, intensity: 0.8, layers: 2 }), fx('vignette', { amount: 0.55 })],
    },
  },
  {
    name: 'Illuminated Manuscript', tag: 'Glyphs',
    settings: {
      mode: 'ascii',
      palette: pal('Illuminated Manuscript'),
      ascii: { charset: 'med-fraktur', cellSize: 12, depth: 24, colorMode: 'ramp', bgMode: 'color', bgColor: '#140f0b', brightDense: true },
      adjust: { exposure: 0.5, contrast: 0.2, saturation: 1.1 },
      effects: [fx('grain', { amount: 0.08 }), fx('vignette', { amount: 0.6, radius: 0.45, color: '#0a0604' })],
    },
  },
  {
    name: 'Rune Carver', tag: 'Glyphs',
    settings: {
      mode: 'ascii',
      palette: pal('Iron & Ember'),
      ascii: { charset: 'med-futhark', cellSize: 11, depth: 20, colorMode: 'ramp', bgMode: 'color', bgColor: '#0b0908', glyphDither: 'fs' },
      effects: [fx('glow', { threshold: 0.45, radius: 24, intensity: 1.6, useTint: true, tint: '#ff6a1f' })],
    },
  },
  {
    name: 'Matrix Rain', tag: 'Glyphs',
    settings: {
      mode: 'ascii',
      palette: pal('Matrix'),
      ascii: { charset: 'lang-katakana', cellSize: 12, aspect: 1.2, depth: 40, colorMode: 'ramp', bgMode: 'color', bgColor: '#000000', custom: '01', customMode: 'add' },
      keyframes: { 'ascii.offset': [{ t: 0, v: 0, ease: 'linear' }, { t: 6, v: 40, ease: 'linear' }] },
      effects: [fx('glow', { threshold: 0.35, radius: 20, intensity: 1.8 }), fx('crt', { curvature: 0.04, scanlines: 0.25 })],
    },
  },
  {
    name: 'Braille Ghost', tag: 'Glyphs',
    settings: {
      mode: 'ascii',
      ascii: { charset: 'braille-full', cellSize: 6, aspect: 1.6, depth: 128, mapping: 'structure', structureMix: 0.75, colorMode: 'mono', fgColor: '#d8f3ff', bgMode: 'color', bgColor: '#05070a' },
      adjust: { contrast: 0.3, sharpen: 0.8 },
      effects: [fx('chromatic', { amount: 3 }), fx('crt', { scanlines: 0.3, curvature: 0.06 })],
    },
  },
  {
    name: 'Card Shark', tag: 'Glyphs',
    settings: {
      mode: 'ascii',
      ascii: { charset: 'card-suits', cellSize: 14, depth: 8, colorMode: 'source', saturation: 1.6, bgMode: 'source', bgDim: 0.15 },
    },
  },
  {
    name: 'Terminal Amber', tag: 'Glyphs',
    settings: {
      mode: 'ascii',
      palette: pal('Amber Monitor'),
      ascii: { charset: 'classic-standard', cellSize: 8, aspect: 1.5, depth: 10, colorMode: 'ramp', bgMode: 'color', bgColor: '#120a00', font: 'Lucida Console' },
      effects: [fx('glow', { threshold: 0.3, radius: 14, intensity: 1.2 }), fx('crt', { scanlines: 0.5, mask: 'aperture', curvature: 0.1 }), fx('echo', { decay: 0.5 })],
    },
  },
  {
    name: 'Slash Structure', tag: 'Glyphs',
    settings: {
      mode: 'ascii',
      ascii: { charset: 'struct-slashes', cellSize: 8, aspect: 1.6, depth: 11, mapping: 'structure', structureMix: 0.85, colorMode: 'mono', fgColor: '#111111', bgColor: '#efe6d2', brightDense: false },
      adjust: { contrast: 0.35, sharpen: 1.2 },
    },
  },
  {
    name: 'Game Boy', tag: 'Dither',
    settings: {
      mode: 'dither',
      palette: pal('Game Boy (DMG)'),
      dither: { algorithm: 'ord:bayer4', pixelSize: 4, colorMode: 'ramp', strength: 1 },
      adjust: { contrast: 0.15 },
    },
  },
  {
    name: 'Atkinson Mac', tag: 'Dither',
    settings: {
      mode: 'dither',
      palette: pal('1-Bit Ink'),
      dither: { algorithm: 'ed:atkinson', pixelSize: 2, colorMode: 'ramp' },
    },
  },
  {
    name: 'Acid Glitch', tag: 'Dither',
    settings: {
      mode: 'dither',
      palette: pal('Acid Graphics'),
      dither: { algorithm: 'ed:fs', pixelSize: 3, colorMode: 'palette', metric: 'redmean' },
      adjust: { saturation: 1.6, contrast: 0.2 },
      effects: [fx('jpegGlitch', { quality: 20, corruption: 0.3 }), fx('slice', { amount: 0.2, maxShift: 80 }), fx('chromatic', { amount: 6 })],
    },
  },
  {
    name: 'Cyber CRT', tag: 'Dither',
    settings: {
      mode: 'dither',
      palette: pal('Cyberpunk Neon'),
      dither: { algorithm: 'ord:bayer8', pixelSize: 3, colorMode: 'palette', metric: 'oklab', strength: 0.9 },
      temporal: { pattern: 'scanroll', amount: 0.12, speed: 1, scale: 3 },
      effects: [fx('glow', { threshold: 0.5, radius: 30, intensity: 1.5 }), fx('crt'), fx('chromatic', { amount: 3 })],
    },
  },
  {
    name: 'Modulation Lines', tag: 'Dither',
    settings: {
      mode: 'dither',
      palette: pal('Blueprint'),
      dither: { algorithm: 'pat:modulation', pixelSize: 2, period: 7, modulation: 1.4, colorMode: 'ramp' },
      adjust: { contrast: 0.2, blur: 1 },
    },
  },
  {
    name: 'Wave Dither', tag: 'Dither',
    settings: {
      mode: 'dither',
      palette: pal('Vaporwave'),
      dither: { algorithm: 'pat:waves', pixelSize: 2, period: 6, modulation: 1.2, colorMode: 'ramp', speed: 0.5 },
    },
  },
  {
    name: 'Glitched Bitmap', tag: 'Dither',
    settings: {
      mode: 'dither',
      palette: pal('Blood Oath'),
      dither: { algorithm: 'pat:glitchbitmap', pixelSize: 3, period: 8, modulation: 1.5, colorMode: 'ramp' },
      keyframes: { 'dither.phase': [{ t: 0, v: 0, ease: 'linear' }, { t: 6, v: 6, ease: 'linear' }] },
    },
  },
  {
    name: 'Newsprint CMYK', tag: 'Halftone',
    settings: {
      mode: 'halftone',
      halftone: { colorMode: 'cmyk', shape: 'round', cellSize: 7, angle: 45, misregister: 1.2, paperColor: '#f1ead8' },
      effects: [fx('grain', { amount: 0.06, animate: false })],
    },
  },
  {
    name: 'Woodcut Lines', tag: 'Halftone',
    settings: {
      mode: 'halftone',
      halftone: { colorMode: 'mono', shape: 'line', cellSize: 6, angle: 30, inkColor: '#1b1410', paperColor: '#efe4c8' },
      adjust: { contrast: 0.3 },
    },
  },
  {
    name: 'VHS Memory', tag: 'Raw',
    settings: {
      mode: 'none',
      adjust: { saturation: 1.2 },
      effects: [fx('vhs'), fx('chromatic', { mode: 'linear', amount: 3 }), fx('grain', { amount: 0.1 }), fx('vignette', { amount: 0.4 })],
    },
  },
];
