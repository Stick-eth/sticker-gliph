import './styles.css';
import { store } from './state';
import { SourceManager } from './ui/source';
import { Renderer } from './ui/renderer';
import { Viewport } from './ui/viewport';
import { Exporter } from './ui/exporter';
import { buildTimeline } from './ui/timeline';
import { adjustPanel, effectsPanel, exportPanel, modePanel, palettePanel, presetsPanel, type Panel } from './ui/panels';
import { h, pickFiles, toast } from './ui/dom';

const source = new SourceManager();
const renderer = new Renderer(source);
const exporter = new Exporter(renderer, source);

/* ------------------------------------------------ layout */

const openBtn = h('button', { class: 'btn accent', onclick: () => openFiles() }, 'Open…');
const emptyState = h('div', { class: 'empty-inner' },
  h('div', { class: 'sigil' }, '⚔'),
  h('h2', {}, 'Drop an image or video'),
  h('p', {}, 'PNG, JPG, WebP, MP4, WebM. Or paste from clipboard.'),
  h('div', { class: 'btn-row center' },
    h('button', { class: 'btn accent', onclick: () => openFiles() }, 'Open File'),
    h('button', { class: 'btn', onclick: () => source.loadDemo() }, 'Demo Castle'),
    h('button', { class: 'btn', onclick: () => startWebcam() }, 'Webcam'),
  ),
);
const viewport = new Viewport(emptyState);
const status = h('div', { class: 'status' });
const quality = h('select', { class: 'select small', title: 'Preview resolution' },
  h('option', { value: 'auto' }, 'Preview: Auto'),
  h('option', { value: 'half' }, 'Preview: 50%'),
  h('option', { value: 'full' }, 'Preview: 100%'),
);
const compareBtn = h('button', { class: 'btn small', title: 'Before / after split (C)' }, 'Compare');
const viewTools = h('div', { class: 'view-tools' },
  quality,
  h('button', { class: 'btn small', onclick: () => { viewport.fit(); renderer.request(); }, title: 'Fit (F)' }, 'Fit'),
  h('button', { class: 'btn small', onclick: () => viewport.actualSize(), title: '1:1 pixels' }, '1:1'),
  h('button', { class: 'btn small', onclick: () => viewport.zoomBy(1 / 1.25) }, '−'),
  h('button', { class: 'btn small', onclick: () => viewport.zoomBy(1.25) }, '+'),
  compareBtn,
);
viewport.el.append(status, viewTools);

const themeBtn = h('button', { class: 'btn', title: 'Switch UI theme' });
const setTheme = (t: string) => {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'grimoire' ? '❦ Grimoire' : '▦ Studio';
  try { localStorage.setItem('sg.theme', t); } catch { /* ignore */ }
};
themeBtn.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'grimoire' ? 'studio' : 'grimoire'));

const header = h('header', { class: 'topbar' },
  h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '❦'), h('span', { class: 'brand-name' }, 'Sticker Gliph'), h('span', { class: 'brand-sub' }, 'dither · halftone · ascii')),
  h('div', { class: 'top-actions' },
    openBtn,
    h('button', { class: 'btn', onclick: () => source.loadDemo() }, 'Demo'),
    h('button', { class: 'btn', onclick: () => startWebcam() }, 'Webcam'),
    h('span', { class: 'sep' }),
    h('button', { class: 'btn', title: 'Undo (Ctrl+Z)', onclick: () => store.undo() }, '↶'),
    h('button', { class: 'btn', title: 'Redo (Ctrl+Y)', onclick: () => store.redo() }, '↷'),
    h('span', { class: 'sep' }),
    themeBtn,
  ),
);

const panels: Panel[] = [];
const mode = modePanel();
const palette = palettePanel(source);
const adjust = adjustPanel();
const effects = effectsPanel();
const presets = presetsPanel();
const exportP = exportPanel(exporter, source);
panels.push(mode, palette, adjust, effects, presets, exportP);

const sourceInfo = h('div', { class: 'source-info' }, 'No source');
const left = h('aside', { class: 'panel left' }, sourceInfo, mode.el, palette.el, adjust.el);
const right = h('aside', { class: 'panel right' }, presets.el, effects.el, exportP.el);
const timeline = buildTimeline(source);

document.getElementById('app')!.append(header, h('main', { class: 'workspace' }, left, viewport.el, right), timeline.el);

/* ------------------------------------------------ rendering */

const fpsOf = () => store.settings.anim.fps || 30;

renderer.jobProvider = () => {
  const settings = store.resolved();
  let scale = viewport.previewScale(quality.value);
  // Keep glyphs and dots legible in preview: never rasterize cells below a few pixels.
  if (settings.mode === 'ascii') scale = Math.max(scale, Math.min(1, 7 / Math.max(1, settings.ascii.cellSize)));
  if (settings.mode === 'halftone') scale = Math.max(scale, Math.min(1, 4 / Math.max(1, settings.halftone.cellSize)));
  return { settings, time: store.time, frame: Math.round(store.time * fpsOf()), scale };
};

let lastMs = 0;
renderer.onFrame = (res, compare) => {
  viewport.show(res.image, compare);
  lastMs = res.ms;
  status.textContent = `${source.w}×${source.h}  →  grid ${res.gridW}×${res.gridH}  →  ${res.image.width}×${res.image.height}  ·  ${lastMs.toFixed(0)} ms`;
};
renderer.onError = (msg) => toast(msg, 'error');

let zoomTimer = 0;
viewport.onZoomChange = () => {
  clearTimeout(zoomTimer);
  zoomTimer = window.setTimeout(() => renderer.request(), 120);
};
quality.addEventListener('change', () => renderer.request());
compareBtn.addEventListener('click', () => {
  const on = !viewport.compare;
  viewport.setCompare(on);
  renderer.wantCompare = on;
  compareBtn.classList.toggle('on', on);
  renderer.invalidateSource();
  renderer.request();
});

store.on((reason) => {
  if (reason === 'time') {
    for (const p of panels) p.refresh(true);
  } else {
    if (reason === 'structure' || reason === 'load') effects.rebuild?.();
    for (const p of panels) p.refresh(false);
  }
  timeline.refresh();
  if (reason !== 'view') renderer.request();
});

source.onChange = () => {
  viewport.setSourceSize(source.w, source.h);
  renderer.invalidateSource();
  sourceInfo.replaceChildren(
    h('span', { class: 'src-kind' }, source.kind.toUpperCase()),
    h('span', { class: 'src-name', title: source.name }, source.name),
    h('span', { class: 'dim' }, `${source.w}×${source.h}${source.kind === 'video' ? ` · ${source.duration.toFixed(1)}s` : ''}`),
  );
  if (source.kind === 'video') {
    store.playing = false;
    store.setTime(0);
  }
  timeline.refresh();
  exportP.refresh();
  renderer.request();
};

source.video.addEventListener('seeked', () => renderer.request());

/* ------------------------------------------------ playback loop */

let lastTick = performance.now();
const tick = (now: number) => {
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  if (!renderer.isLocked()) {
    if (source.kind === 'webcam') {
      store.time += dt;
      renderer.request();
    } else if (store.playing) {
      if (source.kind === 'video') {
        if (Math.abs(source.video.currentTime - store.time) > 1e-4) store.setTime(source.video.currentTime);
      } else if (source.kind === 'image') {
        let t = store.time + dt;
        if (t > store.settings.anim.duration) t = 0;
        store.setTime(t);
      }
    }
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

/* ------------------------------------------------ input */

async function openFiles() {
  const [f] = await pickFiles('image/*,video/*');
  if (f) await loadFile(f);
}

async function loadFile(f: File) {
  try {
    await source.loadFile(f);
  } catch (err: any) {
    toast(`Could not open ${f.name}: ${err?.message || err}`, 'error');
  }
}

async function startWebcam() {
  try {
    await source.startWebcam();
  } catch (err: any) {
    toast(`Webcam unavailable: ${err?.message || err}`, 'error');
  }
}

window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dropping'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
window.addEventListener('drop', (e) => {
  document.body.classList.remove('dropping');
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  e.preventDefault();
  if (/json$/i.test(f.name)) {
    f.text().then((t) => { const d = JSON.parse(t); store.load(d.settings || d, true); toast('Preset loaded'); }).catch(() => toast('Invalid preset', 'error'));
  } else void loadFile(f);
});
window.addEventListener('paste', (e) => {
  const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
  const f = item?.getAsFile();
  if (f) void loadFile(f);
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); void openFiles(); }
  else if (e.key === ' ') { e.preventDefault(); timeline.togglePlay(); }
  else if (e.key === 'f') { viewport.fit(); renderer.request(); }
  else if (e.key === 'c') compareBtn.click();
  else if (e.key === '1') { store.settings.mode = 'ascii'; store.emit('structure'); store.commit(); }
  else if (e.key === '2') { store.settings.mode = 'dither'; store.emit('structure'); store.commit(); }
  else if (e.key === '3') { store.settings.mode = 'halftone'; store.emit('structure'); store.commit(); }
  else if (e.key === '4') { store.settings.mode = 'none'; store.emit('structure'); store.commit(); }
});

/* ------------------------------------------------ boot */

let theme = 'grimoire';
try { theme = localStorage.getItem('sg.theme') || 'grimoire'; } catch { /* ignore */ }
setTheme(theme);

try {
  const saved = localStorage.getItem('sg.session');
  if (saved) store.load(JSON.parse(saved));
} catch { /* ignore corrupt session */ }
store.emit('load');
void source.loadDemo();

if (import.meta.env.DEV) (window as any).__gliph = { store, renderer, source, viewport, exporter };
