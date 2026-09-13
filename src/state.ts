import type { Ease, EffectInstance, Keyframe, Settings } from './core/types';
import { createDefaultSettings, defaultsOf, SECTION_DEFS } from './schema';
import { effectDef } from './engine/effects/defs';

export type ChangeReason = 'param' | 'structure' | 'time' | 'source' | 'load' | 'view';
type Listener = (reason: ChangeReason) => void;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function uid(prefix = 'fx'): string {
  return prefix + '_' + Math.random().toString(36).slice(2, 8);
}

/** Deep merge used to upgrade stored/preset settings with fresh defaults. */
export function mergeSettings(base: Settings, over: Partial<Settings> | any): Settings {
  const out = clone(base) as any;
  if (!over) return out;
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = { ...out[k], ...clone(v) };
    } else if (v !== undefined) out[k] = clone(v);
  }
  out.effects = (out.effects || []).map((e: EffectInstance) => ({ id: e.id || uid(), type: e.type, enabled: e.enabled !== false, collapsed: !!e.collapsed, params: { ...e.params } }));
  out.keyframes = out.keyframes || {};
  return out as Settings;
}

function interp(keys: Keyframe[], t: number): number {
  if (!keys.length) return 0;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      if (a.ease === 'hold') return a.v;
      let f = (t - a.t) / (b.t - a.t || 1);
      if (a.ease === 'smooth') f = f * f * (3 - 2 * f);
      return a.v + (b.v - a.v) * f;
    }
  }
  return last.v;
}

class Store {
  settings: Settings = createDefaultSettings();
  time = 0;
  playing = false;
  private listeners = new Set<Listener>();
  private history: string[] = [];
  private future: string[] = [];
  private commitTimer = 0;

  constructor() {
    this.history.push(JSON.stringify(this.settings));
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason: ChangeReason): void {
    for (const l of this.listeners) l(reason);
  }

  /* ------------------------------------------------ paths */

  private container(settings: Settings, path: string): [any, string, any] | null {
    const parts = path.split('.');
    if (parts[0] === 'effects') {
      const fx = settings.effects.find((e) => e.id === parts[1]);
      if (!fx) return null;
      const def = effectDef(fx.type);
      const d = def?.params.find((p) => p.key === parts[2]);
      return [fx.params, parts[2], d?.default];
    }
    let obj: any = settings;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj?.[parts[i]];
      if (obj == null) return null;
    }
    const secDefs = SECTION_DEFS[parts[0]];
    const d = secDefs?.find((p) => p.key === parts[parts.length - 1]);
    return [obj, parts[parts.length - 1], d?.default];
  }

  getBase(path: string): any {
    const c = this.container(this.settings, path);
    if (!c) return undefined;
    const v = c[0][c[1]];
    return v === undefined ? c[2] : v;
  }

  /** Value at the current time (keyframes applied). */
  get(path: string): any {
    const keys = this.settings.keyframes[path];
    if (keys && keys.length) return interp(keys, this.time);
    return this.getBase(path);
  }

  defaultOf(path: string): any {
    return this.container(this.settings, path)?.[2];
  }

  /** Values object for showIf predicates. */
  sectionValues(base: string): Record<string, any> {
    const parts = base.split('.');
    if (parts[0] === 'effects') {
      const fx = this.settings.effects.find((e) => e.id === parts[1]);
      if (!fx) return {};
      const def = effectDef(fx.type);
      return { ...(def ? defaultsOf(def.params) : {}), ...fx.params };
    }
    return (this.settings as any)[base] || {};
  }

  set(path: string, value: any, commit = false): void {
    const keys = this.settings.keyframes[path];
    if (keys && keys.length && typeof value === 'number') {
      this.upsertKey(path, this.time, value);
    } else {
      const c = this.container(this.settings, path);
      if (!c) return;
      c[0][c[1]] = value;
    }
    this.emit('param');
    if (commit) this.commit();
  }

  /* ------------------------------------------------ keyframes */

  private tolerance(): number {
    return 0.5 / (this.settings.anim.fps || 30);
  }

  hasKeys(path: string): boolean {
    return !!this.settings.keyframes[path]?.length;
  }

  keyAtTime(path: string): Keyframe | undefined {
    const tol = this.tolerance();
    return this.settings.keyframes[path]?.find((k) => Math.abs(k.t - this.time) <= tol);
  }

  private upsertKey(path: string, t: number, v: number, ease: Ease = 'smooth'): void {
    const list = (this.settings.keyframes[path] ||= []);
    const tol = this.tolerance();
    const hit = list.find((k) => Math.abs(k.t - t) <= tol);
    if (hit) hit.v = v;
    else {
      list.push({ t, v, ease });
      list.sort((a, b) => a.t - b.t);
    }
  }

  toggleKey(path: string): void {
    const hit = this.keyAtTime(path);
    if (hit) {
      const list = this.settings.keyframes[path];
      list.splice(list.indexOf(hit), 1);
      if (!list.length) {
        delete this.settings.keyframes[path];
        const c = this.container(this.settings, path);
        if (c) c[0][c[1]] = hit.v;
      }
    } else {
      const v = Number(this.get(path));
      this.upsertKey(path, this.time, v);
    }
    this.emit('param');
    this.commit();
  }

  clearKeys(path: string): void {
    const v = this.get(path);
    delete this.settings.keyframes[path];
    const c = this.container(this.settings, path);
    if (c) c[0][c[1]] = v;
    this.emit('param');
    this.commit();
  }

  keyTimes(): number[] {
    const set = new Set<number>();
    for (const list of Object.values(this.settings.keyframes)) for (const k of list) set.add(Math.round(k.t * 1000) / 1000);
    return [...set].sort((a, b) => a - b);
  }

  /** Settings with all keyframed values baked for time t. */
  resolved(t = this.time): Settings {
    const out = clone(this.settings);
    for (const [path, keys] of Object.entries(this.settings.keyframes)) {
      if (!keys.length) continue;
      const c = this.container(out, path);
      if (c) c[0][c[1]] = interp(keys, t);
    }
    out.keyframes = {};
    return out;
  }

  isTimeDependent(): boolean {
    const s = this.settings;
    if (Object.keys(s.keyframes).length) return true;
    if (s.temporal.pattern !== 'none' && s.temporal.amount > 0) return true;
    if ((s.dither.speed || 0) !== 0 && s.mode === 'dither') return true;
    return s.effects.some((e) => e.enabled && ['jpegGlitch', 'slice', 'blockShuffle', 'vhs', 'crt', 'wave', 'grain', 'echo'].includes(e.type));
  }

  /* ------------------------------------------------ time */

  setTime(t: number): void {
    this.time = Math.max(0, t);
    this.emit('time');
  }

  /* ------------------------------------------------ effects */

  addEffect(type: string): EffectInstance | null {
    const def = effectDef(type);
    if (!def) return null;
    const fx: EffectInstance = { id: uid(), type, enabled: true, params: defaultsOf(def.params) };
    this.settings.effects.push(fx);
    this.emit('structure');
    this.commit();
    return fx;
  }

  removeEffect(id: string): void {
    this.settings.effects = this.settings.effects.filter((e) => e.id !== id);
    for (const k of Object.keys(this.settings.keyframes)) if (k.startsWith(`effects.${id}.`)) delete this.settings.keyframes[k];
    this.emit('structure');
    this.commit();
  }

  moveEffect(id: string, toIndex: number): void {
    const list = this.settings.effects;
    const from = list.findIndex((e) => e.id === id);
    if (from < 0) return;
    const [fx] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, fx);
    this.emit('structure');
    this.commit();
  }

  /* ------------------------------------------------ history */

  commit(): void {
    clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => {
      const json = JSON.stringify(this.settings);
      if (json !== this.history[this.history.length - 1]) {
        this.history.push(json);
        if (this.history.length > 200) this.history.shift();
        this.future = [];
      }
      try { localStorage.setItem('sg.session', json); } catch { /* storage unavailable */ }
    }, 250);
  }

  undo(): void {
    if (this.history.length < 2) return;
    this.future.push(this.history.pop()!);
    this.settings = mergeSettings(createDefaultSettings(), JSON.parse(this.history[this.history.length - 1]));
    this.emit('load');
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(next);
    this.settings = mergeSettings(createDefaultSettings(), JSON.parse(next));
    this.emit('load');
  }

  load(partial: any, keepAnim = false): void {
    const anim = this.settings.anim;
    this.settings = mergeSettings(createDefaultSettings(), partial);
    if (keepAnim) this.settings.anim = anim;
    this.emit('load');
    this.commit();
  }
}

export const store = new Store();
