export type Mode = 'dither' | 'ascii' | 'halftone' | 'none';

interface BaseDef {
  key: string;
  label: string;
  hint?: string;
  /** Visibility predicate, receives the values object of the section. */
  showIf?: (v: Record<string, any>) => boolean;
}

export interface RangeDef extends BaseDef {
  type: 'range';
  min: number;
  max: number;
  step: number;
  default: number;
  animatable?: boolean;
  unit?: string;
}

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

export interface SelectDef extends BaseDef {
  type: 'select';
  options: SelectOption[];
  default: string;
}

export interface ToggleDef extends BaseDef {
  type: 'toggle';
  default: boolean;
}

export interface ColorDef extends BaseDef {
  type: 'color';
  default: string;
}

export interface TextDef extends BaseDef {
  type: 'text';
  default: string;
  maxLength?: number;
  placeholder?: string;
}

export type ParamDef = RangeDef | SelectDef | ToggleDef | ColorDef | TextDef;

export interface EffectInstance {
  id: string;
  type: string;
  enabled: boolean;
  collapsed?: boolean;
  params: Record<string, any>;
}

export type Ease = 'linear' | 'smooth' | 'hold';

export interface Keyframe {
  t: number;
  v: number;
  ease: Ease;
}

export interface Settings {
  version: number;
  mode: Mode;
  adjust: Record<string, any>;
  temporal: Record<string, any>;
  dither: Record<string, any>;
  halftone: Record<string, any>;
  ascii: Record<string, any>;
  palette: { name: string; colors: string[] };
  effects: EffectInstance[];
  anim: { duration: number; fps: number };
  keyframes: Record<string, Keyframe[]>;
}

/** 8-bit RGBA image. */
export interface Img {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

/** Float RGBA image, straight (non premultiplied) alpha, values 0..1. */
export interface FImg {
  w: number;
  h: number;
  d: Float32Array;
}
