import type { ParamDef } from '../core/types';
import { store } from '../state';
import { h } from './dom';

export interface ControlSet {
  el: HTMLElement;
  refresh(onlyAnimated?: boolean): void;
}

const fmt = (v: number, step: number) => {
  const dec = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  return Number(v).toFixed(dec);
};

/** Builds auto-generated controls for a list of parameter definitions bound to `base.key` paths. */
export function buildControls(defs: ParamDef[], base: string): ControlSet {
  const el = h('div', { class: 'ctls' });
  const refreshers: { path: string; def: ParamDef; row: HTMLElement; update: () => void; animatable: boolean }[] = [];

  for (const def of defs) {
    const path = `${base}.${def.key}`;
    const label = h('label', { class: 'ctl-label', title: (def.hint ? def.hint + '. ' : '') + 'Double-click to reset' }, def.label);
    label.addEventListener('dblclick', () => store.set(path, store.defaultOf(path), true));
    let row: HTMLElement;
    let update: () => void;

    switch (def.type) {
      case 'range': {
        const slider = h('input', { type: 'range', min: def.min, max: def.max, step: def.step, class: 'slider' });
        const num = h('input', { type: 'number', min: def.min, max: def.max, step: def.step, class: 'num' });
        const kf = h('button', { class: 'kf', title: 'Keyframe at playhead (right-click: clear all keys)' }, '◆');
        if (!def.animatable) kf.style.visibility = 'hidden';
        slider.addEventListener('input', () => store.set(path, Number(slider.value)));
        slider.addEventListener('change', () => store.commit());
        num.addEventListener('change', () => {
          const v = Math.max(def.min, Math.min(def.max, Number(num.value)));
          if (!Number.isNaN(v)) store.set(path, v, true);
        });
        kf.addEventListener('click', () => store.toggleKey(path));
        kf.addEventListener('contextmenu', (e) => { e.preventDefault(); store.clearKeys(path); });
        const unit = def.unit ? h('span', { class: 'unit' }, def.unit) : null;
        row = h('div', { class: 'ctl ctl-range' }, h('div', { class: 'ctl-head' }, kf, label, h('span', { class: 'num-wrap' }, num, unit)), slider);
        update = () => {
          const v = Number(store.get(path));
          const fill = ((v - def.min) / (def.max - def.min)) * 100;
          if (document.activeElement !== slider) slider.value = String(v);
          slider.style.setProperty('--fill', `${Math.max(0, Math.min(100, fill))}%`);
          if (document.activeElement !== num) num.value = fmt(v, def.step);
          const animated = store.hasKeys(path);
          kf.classList.toggle('animated', animated);
          kf.classList.toggle('onkey', !!store.keyAtTime(path));
        };
        break;
      }
      case 'select': {
        const sel = h('select', { class: 'select' });
        const groups = new Map<string, HTMLOptGroupElement>();
        for (const o of def.options) {
          const opt = h('option', { value: o.value }, o.label);
          if (o.group) {
            let g = groups.get(o.group);
            if (!g) { g = h('optgroup', { label: o.group }); groups.set(o.group, g); sel.append(g); }
            g.append(opt);
          } else sel.append(opt);
        }
        sel.addEventListener('change', () => store.set(path, sel.value, true));
        row = h('div', { class: 'ctl ctl-select' }, label, sel);
        update = () => { const v = String(store.get(path)); if (sel.value !== v) sel.value = v; };
        break;
      }
      case 'toggle': {
        const cb = h('input', { type: 'checkbox', class: 'toggle' });
        cb.addEventListener('change', () => store.set(path, cb.checked, true));
        row = h('label', { class: 'ctl ctl-toggle' }, cb, h('span', { class: 'switch' }), h('span', { class: 'ctl-label' }, def.label));
        update = () => { cb.checked = !!store.get(path); };
        break;
      }
      case 'color': {
        const picker = h('input', { type: 'color', class: 'color' });
        const text = h('input', { type: 'text', class: 'hex', maxLength: 7 });
        picker.addEventListener('input', () => store.set(path, picker.value));
        picker.addEventListener('change', () => store.commit());
        text.addEventListener('change', () => {
          if (/^#?[0-9a-f]{6}$/i.test(text.value)) store.set(path, text.value.startsWith('#') ? text.value : '#' + text.value, true);
        });
        row = h('div', { class: 'ctl ctl-color' }, label, h('span', { class: 'color-wrap' }, picker, text));
        update = () => {
          const v = String(store.get(path));
          if (picker.value !== v) picker.value = v;
          if (document.activeElement !== text) text.value = v;
        };
        break;
      }
      case 'text': {
        const input = h('input', { type: 'text', class: 'text', maxLength: def.maxLength ?? 200, placeholder: def.placeholder || '' });
        input.addEventListener('input', () => store.set(path, input.value));
        input.addEventListener('change', () => store.commit());
        row = h('div', { class: 'ctl ctl-text' }, label, input);
        update = () => { if (document.activeElement !== input) input.value = String(store.get(path) ?? ''); };
        break;
      }
    }
    el.append(row);
    refreshers.push({ path, def, row, update, animatable: def.type === 'range' });
  }

  const refresh = (onlyAnimated = false) => {
    const values = store.sectionValues(base);
    for (const r of refreshers) {
      if (onlyAnimated && !(r.animatable && store.hasKeys(r.path))) continue;
      r.row.hidden = r.def.showIf ? !r.def.showIf(values) : false;
      r.update();
    }
  };
  refresh();
  return { el, refresh };
}
