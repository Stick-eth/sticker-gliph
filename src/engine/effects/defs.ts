import type { ParamDef } from '../../core/types';

export interface EffectDef {
  type: string;
  label: string;
  category: 'Glow & Light' | 'Glitch' | 'Retro Screen' | 'Distort' | 'Colour' | 'Texture';
  params: ParamDef[];
}

const seedAnim: ParamDef[] = [
  { key: 'seed', label: 'Seed', type: 'range', min: 0, max: 999, step: 1, default: 7, animatable: true },
  { key: 'animate', label: 'Re-roll every frame', type: 'toggle', default: true },
];

export const EFFECT_DEFS: EffectDef[] = [
  {
    type: 'glow', label: 'Threshold Glow', category: 'Glow & Light',
    params: [
      { key: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, animatable: true },
      { key: 'softness', label: 'Softness', type: 'range', min: 0.001, max: 0.5, step: 0.001, default: 0.12, animatable: true },
      { key: 'radius', label: 'Radius', type: 'range', min: 1, max: 256, step: 1, default: 28, animatable: true, unit: 'px' },
      { key: 'layers', label: 'Bloom Layers', type: 'range', min: 1, max: 4, step: 1, default: 3 },
      { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 6, step: 0.01, default: 1.4, animatable: true },
      {
        key: 'blend', label: 'Blend', type: 'select', default: 'screen',
        options: [{ value: 'screen', label: 'Screen' }, { value: 'add', label: 'Add' }, { value: 'glowOnly', label: 'Glow only' }],
      },
      { key: 'useTint', label: 'Tint Glow', type: 'toggle', default: false },
      { key: 'tint', label: 'Tint', type: 'color', default: '#ff7a2f', showIf: (v) => v.useTint },
      { key: 'isolate', label: 'Isolate Colour', type: 'toggle', default: false },
      { key: 'isolateColor', label: 'Target Colour', type: 'color', default: '#ffffff', showIf: (v) => v.isolate },
      { key: 'tolerance', label: 'Tolerance', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, showIf: (v) => v.isolate },
    ],
  },
  {
    type: 'chromatic', label: 'Chromatic Aberration', category: 'Glow & Light',
    params: [
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 64, step: 0.1, default: 4, animatable: true, unit: 'px' },
      { key: 'mode', label: 'Mode', type: 'select', default: 'radial', options: [{ value: 'radial', label: 'Radial (lens)' }, { value: 'linear', label: 'Linear (shift)' }] },
      { key: 'angle', label: 'Angle', type: 'range', min: 0, max: 360, step: 1, default: 0, animatable: true, showIf: (v) => v.mode === 'linear' },
    ],
  },
  {
    type: 'jpegGlitch', label: 'JPEG Glitch', category: 'Glitch',
    params: [
      { key: 'quality', label: 'JPEG Quality', type: 'range', min: 1, max: 100, step: 1, default: 35 },
      { key: 'corruption', label: 'Corruption', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, animatable: true },
      { key: 'generations', label: 'Generations', type: 'range', min: 1, max: 12, step: 1, default: 1 },
      ...seedAnim,
    ],
  },
  {
    type: 'slice', label: 'Slice Shift', category: 'Glitch',
    params: [
      { key: 'amount', label: 'Probability', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, animatable: true },
      { key: 'maxShift', label: 'Max Shift', type: 'range', min: 0, max: 400, step: 1, default: 60, animatable: true, unit: 'px' },
      { key: 'minHeight', label: 'Min Slice Height', type: 'range', min: 1, max: 200, step: 1, default: 4, unit: 'px' },
      { key: 'maxHeight', label: 'Max Slice Height', type: 'range', min: 1, max: 400, step: 1, default: 40, unit: 'px' },
      { key: 'rgbSplit', label: 'RGB Split in slices', type: 'toggle', default: true },
      ...seedAnim,
    ],
  },
  {
    type: 'blockShuffle', label: 'Block Shuffle', category: 'Glitch',
    params: [
      { key: 'blockSize', label: 'Block Size', type: 'range', min: 4, max: 256, step: 1, default: 32, unit: 'px' },
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.08, animatable: true },
      ...seedAnim,
    ],
  },
  {
    type: 'pixelSort', label: 'Pixel Sort', category: 'Glitch',
    params: [
      { key: 'direction', label: 'Direction', type: 'select', default: 'horizontal', options: [{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }] },
      { key: 'low', label: 'Low Threshold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, animatable: true },
      { key: 'high', label: 'High Threshold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, animatable: true },
      { key: 'key', label: 'Sort By', type: 'select', default: 'luma', options: [{ value: 'luma', label: 'Luminance' }, { value: 'hue', label: 'Hue' }, { value: 'sat', label: 'Saturation' }] },
      { key: 'reverse', label: 'Reverse', type: 'toggle', default: false },
    ],
  },
  {
    type: 'vhs', label: 'VHS Tape', category: 'Retro Screen',
    params: [
      { key: 'jitter', label: 'Line Jitter', type: 'range', min: 0, max: 20, step: 0.1, default: 2, animatable: true, unit: 'px' },
      { key: 'band', label: 'Tracking Band', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, animatable: true },
      { key: 'bandSpeed', label: 'Band Speed', type: 'range', min: 0, max: 2, step: 0.01, default: 0.25 },
      { key: 'bleed', label: 'Colour Bleed', type: 'range', min: 0, max: 24, step: 0.5, default: 4, unit: 'px' },
      { key: 'noise', label: 'Tape Noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
    ],
  },
  {
    type: 'crt', label: 'CRT Screen', category: 'Retro Screen',
    params: [
      { key: 'scanlines', label: 'Scanlines', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, animatable: true },
      { key: 'spacing', label: 'Line Spacing', type: 'range', min: 1, max: 16, step: 0.5, default: 3, unit: 'px' },
      { key: 'mask', label: 'Phosphor Mask', type: 'select', default: 'aperture', options: [{ value: 'none', label: 'None' }, { value: 'aperture', label: 'Aperture Grille' }, { value: 'slot', label: 'Slot Mask' }, { value: 'shadow', label: 'Shadow Mask' }] },
      { key: 'maskStrength', label: 'Mask Strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'curvature', label: 'Curvature', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.08, animatable: true },
      { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'boost', label: 'Brightness Boost', type: 'range', min: 0.5, max: 2, step: 0.01, default: 1.2 },
      { key: 'flicker', label: 'Flicker', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.02 },
    ],
  },
  {
    type: 'echo', label: 'Phosphor Echo', category: 'Retro Screen',
    params: [
      { key: 'decay', label: 'Persistence', type: 'range', min: 0, max: 0.98, step: 0.01, default: 0.7, animatable: true },
      { key: 'blend', label: 'Blend', type: 'select', default: 'lighten', options: [{ value: 'lighten', label: 'Lighten (trails)' }, { value: 'mix', label: 'Mix (ghosting)' }] },
    ],
  },
  {
    type: 'wave', label: 'Wave Distort', category: 'Distort',
    params: [
      { key: 'amplitude', label: 'Amplitude', type: 'range', min: 0, max: 200, step: 0.5, default: 12, animatable: true, unit: 'px' },
      { key: 'wavelength', label: 'Wavelength', type: 'range', min: 2, max: 1000, step: 1, default: 120, animatable: true, unit: 'px' },
      { key: 'speed', label: 'Speed', type: 'range', min: -5, max: 5, step: 0.01, default: 0.5 },
      { key: 'direction', label: 'Direction', type: 'select', default: 'horizontal', options: [{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }] },
    ],
  },
  {
    type: 'mirror', label: 'Mirror / Kaleidoscope', category: 'Distort',
    params: [
      { key: 'mode', label: 'Mode', type: 'select', default: 'horizontal', options: [{ value: 'horizontal', label: 'Mirror left to right' }, { value: 'vertical', label: 'Mirror top to bottom' }, { value: 'quad', label: 'Quad mirror' }, { value: 'kaleido', label: 'Kaleidoscope' }] },
      { key: 'segments', label: 'Segments', type: 'range', min: 2, max: 24, step: 1, default: 6, showIf: (v) => v.mode === 'kaleido' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: 0, max: 360, step: 1, default: 0, animatable: true, showIf: (v) => v.mode === 'kaleido' },
    ],
  },
  {
    type: 'pixelate', label: 'Pixelate', category: 'Distort',
    params: [{ key: 'size', label: 'Block Size', type: 'range', min: 1, max: 128, step: 1, default: 8, animatable: true, unit: 'px' }],
  },
  {
    type: 'blurSharpen', label: 'Blur / Sharpen', category: 'Texture',
    params: [
      { key: 'blur', label: 'Blur Radius', type: 'range', min: 0, max: 64, step: 0.5, default: 0, animatable: true, unit: 'px' },
      { key: 'sharpen', label: 'Sharpen', type: 'range', min: 0, max: 5, step: 0.01, default: 0.6, animatable: true },
      { key: 'sharpenRadius', label: 'Sharpen Radius', type: 'range', min: 1, max: 12, step: 0.5, default: 2, unit: 'px' },
    ],
  },
  {
    type: 'grain', label: 'Grain / Noise', category: 'Texture',
    params: [
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.12, animatable: true },
      { key: 'size', label: 'Grain Size', type: 'range', min: 1, max: 8, step: 1, default: 1, unit: 'px' },
      { key: 'mono', label: 'Monochrome', type: 'toggle', default: true },
      { key: 'animate', label: 'Animate', type: 'toggle', default: true },
    ],
  },
  {
    type: 'vignette', label: 'Vignette', category: 'Texture',
    params: [
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, animatable: true },
      { key: 'radius', label: 'Radius', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.55 },
      { key: 'softness', label: 'Softness', type: 'range', min: 0.01, max: 1.5, step: 0.01, default: 0.5 },
      { key: 'color', label: 'Colour', type: 'color', default: '#000000' },
    ],
  },
  {
    type: 'edges', label: 'Edge Outline', category: 'Texture',
    params: [
      { key: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, animatable: true },
      { key: 'mode', label: 'Mode', type: 'select', default: 'overlay', options: [{ value: 'overlay', label: 'Overlay on image' }, { value: 'only', label: 'Edges only' }] },
      { key: 'color', label: 'Edge Colour', type: 'color', default: '#f1e6c8' },
      { key: 'background', label: 'Background', type: 'color', default: '#0e0b09', showIf: (v) => v.mode === 'only' },
    ],
  },
  {
    type: 'colorGrade', label: 'Colour Grade', category: 'Colour',
    params: [
      { key: 'hue', label: 'Hue Shift', type: 'range', min: -180, max: 180, step: 1, default: 0, animatable: true, unit: 'deg' },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 3, step: 0.01, default: 1, animatable: true },
      { key: 'brightness', label: 'Brightness', type: 'range', min: -1, max: 1, step: 0.01, default: 0, animatable: true },
      { key: 'contrast', label: 'Contrast', type: 'range', min: -1, max: 1, step: 0.01, default: 0, animatable: true },
      { key: 'invert', label: 'Invert', type: 'toggle', default: false },
    ],
  },
  {
    type: 'gradientMap', label: 'Gradient Map', category: 'Colour',
    params: [
      { key: 'usePalette', label: 'Use current palette', type: 'toggle', default: false },
      { key: 'shadow', label: 'Shadow', type: 'color', default: '#1b1410', showIf: (v) => !v.usePalette },
      { key: 'highlight', label: 'Highlight', type: 'color', default: '#e8c170', showIf: (v) => !v.usePalette },
      { key: 'mix', label: 'Mix', type: 'range', min: 0, max: 1, step: 0.01, default: 1, animatable: true },
    ],
  },
  {
    type: 'posterize', label: 'Posterize', category: 'Colour',
    params: [{ key: 'levels', label: 'Levels', type: 'range', min: 2, max: 32, step: 1, default: 4, animatable: true }],
  },
  {
    type: 'bitmap', label: 'Bitmap Threshold', category: 'Colour',
    params: [
      { key: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, animatable: true },
      { key: 'dark', label: 'Dark', type: 'color', default: '#000000' },
      { key: 'light', label: 'Light', type: 'color', default: '#ffffff' },
    ],
  },
];

export function effectDef(type: string): EffectDef | undefined {
  return EFFECT_DEFS.find((e) => e.type === type);
}
