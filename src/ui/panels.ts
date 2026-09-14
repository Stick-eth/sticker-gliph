import type { Mode } from '../core/types';
import { store, uid } from '../state';
import { ADJUST_DEFS, ASCII_DEFS, DITHER_DEFS, HALFTONE_DEFS, TEMPORAL_DEFS } from '../schema';
import { CATEGORIES, CHARSETS, resolveGlyphs } from '../engine/ascii/charsets';
import { fontStack, getAtlas } from '../engine/ascii/atlas';
import { selectGlyphs } from '../engine/ascii/ascii';
import { EFFECT_DEFS, effectDef } from '../engine/effects/defs';
import { PALETTES, parsePaletteText, sortHexByLuma } from '../core/palettes';
import { extractPalette } from '../core/paletteExtract';
import { BUILTIN_PRESETS } from '../presets';
import { buildControls, type ControlSet } from './controls';
import { clear, download, h, pickFiles, section, toast } from './dom';
import type { SourceManager } from './source';
import type { Exporter, ExportFormat } from './exporter';

export interface Panel {
  el: HTMLElement;
  refresh(onlyAnimated?: boolean): void;
  rebuild?(): void;
}

/* ============================================================ Mode */

const MODES: { id: Mode; label: string; sub: string }[] = [
  { id: 'ascii', label: 'Glyphs', sub: 'ASCII' },
  { id: 'dither', label: 'Dither', sub: '38 algos' },
  { id: 'halftone', label: 'Halftone', sub: 'CMYK / AM' },
  { id: 'none', label: 'Raw', sub: 'FX only' },
];

export function modePanel(): Panel {
  const tabs = MODES.map((m) =>
    h('button', { class: 'mode-tab', 'data-mode': m.id, onclick: () => { store.settings.mode = m.id; store.emit('structure'); store.commit(); } },
      h('span', { class: 'mode-label' }, m.label), h('span', { class: 'mode-sub' }, m.sub)),
  );
  const bar = h('div', { class: 'mode-tabs' }, ...tabs);

  const ascii = asciiSection();
  const dither = section('Dither Engine', { id: 'dither' });
  const ditherCtl = buildControls(DITHER_DEFS, 'dither');
  dither.body.append(ditherCtl.el);
  const half = section('Halftone Screen', { id: 'halftone' });
  const halfCtl = buildControls(HALFTONE_DEFS, 'halftone');
  half.body.append(halfCtl.el);
  const raw = h('div', { class: 'hint-box' }, 'Raw mode passes the adjusted source straight into the effects stack.');

  const el = h('div', { class: 'mode-panel' }, bar, ascii.el, dither.root, half.root, raw);
  const refresh = (onlyAnimated = false) => {
    const mode = store.settings.mode;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    ascii.el.hidden = mode !== 'ascii';
    dither.root.hidden = mode !== 'dither';
    half.root.hidden = mode !== 'halftone';
    raw.hidden = mode !== 'none';
    document.documentElement.dataset.mode = mode;
    if (mode === 'ascii') ascii.refresh(onlyAnimated);
    if (mode === 'dither') ditherCtl.refresh(onlyAnimated);
    if (mode === 'halftone') halfCtl.refresh(onlyAnimated);
  };
  return { el, refresh };
}

/* ============================================================ Glyphs */

function asciiSection(): Panel {
  const sec = section('Glyph Forge', { id: 'ascii' });
  const catKey = 'sg.charsetCat';
  let cat = 'All';
  try { cat = localStorage.getItem(catKey) || 'All'; } catch { /* ignore */ }

  const chips = h('div', { class: 'chips' });
  const grid = h('div', { class: 'cs-grid' });
  const ramp = h('div', { class: 'ramp', title: 'Glyphs in use, light to dense (after depth and offset)' });
  const rampInfo = h('div', { class: 'ramp-info' });

  const renderChips = () => {
    clear(chips);
    for (const c of ['All', ...CATEGORIES]) {
      const count = c === 'All' ? CHARSETS.length : CHARSETS.filter((s) => s.category === c).length;
      chips.append(h('button', {
        class: 'chip' + (c === cat ? ' active' : ''),
        onclick: () => { cat = c; try { localStorage.setItem(catKey, c); } catch { /* ignore */ } renderChips(); renderGrid(); },
      }, c, h('span', { class: 'chip-n' }, String(count))));
    }
  };

  const cards = new Map<string, HTMLElement>();
  const renderGrid = () => {
    clear(grid);
    cards.clear();
    for (const cs of CHARSETS) {
      if (cat !== 'All' && cs.category !== cat) continue;
      const glyphs = Array.from(cs.chars).filter((c) => c !== ' ');
      const card = h('button', { class: 'cs-card', title: `${cs.category}: ${glyphs.length} glyphs`, onclick: () => store.set('ascii.charset', cs.id, true) },
        h('span', { class: 'cs-glyphs' }, glyphs.slice(0, 10).join('')),
        h('span', { class: 'cs-meta' }, h('span', { class: 'cs-name' }, cs.name), h('span', { class: 'cs-count' }, String(glyphs.length))),
      );
      cards.set(cs.id, card);
      grid.append(card);
    }
    syncCards();
  };

  const syncCards = () => {
    const s = store.settings.ascii;
    const font = (s.customFont && String(s.customFont).trim()) || s.font;
    for (const [id, card] of cards) {
      card.classList.toggle('active', id === s.charset);
      (card.firstChild as HTMLElement).style.fontFamily = fontStack(font);
    }
  };

  let rampKey = '';
  const updateRamp = () => {
    const s = store.resolved().ascii;
    const font = (s.customFont && String(s.customFont).trim()) || s.font || 'Consolas';
    const chars = resolveGlyphs(s.charset, s.custom, s.customMode, s.includeSpace !== false);
    const key = [chars.join(''), font, s.weight, s.depth, Math.floor(s.offset || 0), s.glyphScale, s.aspect].join('|');
    if (key === rampKey) return;
    rampKey = key;
    try {
      const atlas = getAtlas(chars, font, s.weight || 'normal', 16, Math.round(16 * (s.aspect || 1)), s.glyphScale || 1);
      const sel = selectGlyphs(atlas, s.depth || 16);
      const D = sel.length;
      const off = Math.floor(s.offset || 0);
      const shown: string[] = [];
      for (let i = 0; i < D; i++) {
        const k = s.offsetMode === 'clamp' ? Math.max(0, Math.min(D - 1, i + off)) : (((i + off) % D) + D) % D;
        shown.push(atlas.chars[sel[k]]);
      }
      clear(ramp);
      ramp.style.fontFamily = fontStack(font);
      for (const g of shown) ramp.append(h('span', { class: 'ramp-g' }, g === ' ' ? ' ' : g));
      rampInfo.textContent = `${D} of ${chars.length} glyphs`;
    } catch {
      rampInfo.textContent = '';
    }
  };

  const ctl = buildControls(ASCII_DEFS, 'ascii');
  sec.body.append(
    h('div', { class: 'sub-title' }, 'Character Sets', h('span', { class: 'dim' }, ' 48 sets, 11 categories')),
    chips, grid,
    h('div', { class: 'sub-title' }, 'Glyph Ramp', rampInfo),
    ramp,
    ctl.el,
  );
  renderChips();
  renderGrid();

  return {
    el: sec.root,
    refresh: (onlyAnimated = false) => {
      ctl.refresh(onlyAnimated);
      if (!onlyAnimated) syncCards();
      updateRamp();
    },
  };
}

/* ============================================================ Adjust / Temporal */

export function adjustPanel(): Panel {
  const adj = section('Tone & Colour', { id: 'adjust' });
  const adjCtl = buildControls(ADJUST_DEFS, 'adjust');
  adj.body.append(adjCtl.el);
  const tmp = section('Animated Noise', { id: 'temporal' });
  const tmpCtl = buildControls(TEMPORAL_DEFS, 'temporal');
  tmp.body.append(h('div', { class: 'hint-box' }, 'Animated noise injected before quantization. Shows while playing or in exports.'), tmpCtl.el);
  return {
    el: h('div', {}, adj.root, tmp.root),
    refresh: (o) => { adjCtl.refresh(o); tmpCtl.refresh(o); },
  };
}

/* ============================================================ Palette */

export function palettePanel(source: SourceManager): Panel {
  const sec = section('Palette', { id: 'palette' });
  const name = h('div', { class: 'pal-name' });
  const swatches = h('div', { class: 'swatches' });
  const picker = h('input', { type: 'color', class: 'hidden-picker' });
  let editing = -1;

  const setColors = (colors: string[], newName?: string) => {
    store.settings.palette = { name: newName ?? store.settings.palette.name, colors };
    store.emit('param');
    store.commit();
  };

  picker.addEventListener('input', () => {
    if (editing < 0) return;
    const cols = [...store.settings.palette.colors];
    cols[editing] = picker.value;
    setColors(cols, 'Custom');
  });

  const extractN = h('input', { type: 'number', min: 2, max: 32, value: 6, class: 'num small', title: 'Colour count' });
  const actions = h('div', { class: 'btn-row wrap' },
    h('button', { class: 'btn', title: 'Add colour', onclick: () => setColors([...store.settings.palette.colors, '#808080'], 'Custom') }, '+ Colour'),
    h('button', { class: 'btn', onclick: () => setColors([...store.settings.palette.colors].reverse()) }, 'Reverse'),
    h('button', { class: 'btn', onclick: () => setColors(sortHexByLuma(store.settings.palette.colors)) }, 'Sort'),
    h('span', { class: 'btn-group' },
      h('button', {
        class: 'btn accent', title: 'Automatic palette extraction from the source',
        onclick: async () => {
          const bmp = await source.capture(320);
          if (!bmp) { toast('Load a source first', 'error'); return; }
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const g = c.getContext('2d')!;
          g.drawImage(bmp, 0, 0);
          bmp.close();
          const cols = extractPalette(g.getImageData(0, 0, c.width, c.height).data, Math.max(2, Math.min(32, Number(extractN.value) || 6)));
          setColors(cols, 'Extracted');
        },
      }, 'Extract'),
      extractN),
    h('button', {
      class: 'btn', title: 'Import .hex, .gpl or .txt',
      onclick: async () => {
        const [f] = await pickFiles('.hex,.gpl,.txt,.pal');
        if (!f) return;
        const cols = parsePaletteText(await f.text());
        if (cols.length < 1) { toast('No colours found in file', 'error'); return; }
        setColors(cols.slice(0, 256), f.name.replace(/\.[^.]+$/, ''));
      },
    }, 'Import'),
    h('button', {
      class: 'btn', title: 'Export .hex (Lospec format)',
      onclick: () => download(new Blob([store.settings.palette.colors.map((c) => c.replace('#', '')).join('\n')], { type: 'text/plain' }), `${store.settings.palette.name || 'palette'}.hex`),
    }, 'Export'),
  );

  const lib = h('div', { class: 'pal-lib' });
  let group = '';
  for (const p of PALETTES) {
    if (p.group !== group) { group = p.group; lib.append(h('div', { class: 'pal-group' }, group)); }
    lib.append(h('button', { class: 'pal-row', onclick: () => setColors([...p.colors], p.name) },
      h('span', { class: 'pal-row-name' }, p.name),
      h('span', { class: 'pal-strip' }, ...p.colors.slice(0, 24).map((c) => h('i', { style: `background:${c}` }))),
    ));
  }

  sec.body.append(name, swatches, picker, actions, h('div', { class: 'sub-title' }, 'Library'), lib);
  let last = '';
  const refresh = () => {
    const pal = store.settings.palette;
    const key = JSON.stringify(pal);
    if (key === last) return;
    last = key;
    name.textContent = `${pal.name}  ·  ${pal.colors.length} colours`;
    clear(swatches);
    pal.colors.forEach((c, i) => {
      swatches.append(h('button', {
        class: 'swatch', style: `background:${c}`, title: `${c}  (click edit, right-click remove)`,
        onclick: () => { editing = i; picker.value = c; picker.click(); },
        oncontextmenu: (e: MouseEvent) => {
          e.preventDefault();
          if (pal.colors.length <= 1) return;
          setColors(pal.colors.filter((_, k) => k !== i), 'Custom');
        },
      }));
    });
    for (const row of lib.querySelectorAll<HTMLElement>('.pal-row')) row.classList.toggle('active', row.firstChild?.textContent === pal.name);
  };
  return { el: sec.root, refresh };
}

/* ============================================================ Effects */

export function effectsPanel(): Panel {
  const sec = section('Effects Stack', { id: 'effects' });
  const sel = h('select', { class: 'select' });
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const d of EFFECT_DEFS) {
    let g = groups.get(d.category);
    if (!g) { g = h('optgroup', { label: d.category }); groups.set(d.category, g); sel.append(g); }
    g.append(h('option', { value: d.type }, d.label));
  }
  const list = h('div', { class: 'fx-list' });
  const empty = h('div', { class: 'hint-box' }, 'No effects. Stack them, drag to reorder: they run top to bottom on the forged image.');
  sec.body.append(h('div', { class: 'btn-row' }, sel, h('button', { class: 'btn accent', onclick: () => store.addEffect(sel.value) }, 'Add')), empty, list);

  let controls: ControlSet[] = [];
  let dragId: string | null = null;

  const rebuild = () => {
    clear(list);
    controls = [];
    const fxs = store.settings.effects;
    empty.hidden = fxs.length > 0;
    fxs.forEach((fx, index) => {
      const def = effectDef(fx.type);
      if (!def) return;
      const ctl = buildControls(def.params, `effects.${fx.id}`);
      controls.push(ctl);
      const enabled = h('input', { type: 'checkbox', class: 'toggle', checked: fx.enabled, title: 'Enable' });
      enabled.addEventListener('change', () => { fx.enabled = enabled.checked; store.emit('param'); store.commit(); card.classList.toggle('disabled', !fx.enabled); });
      const head = h('div', { class: 'fx-head', draggable: true },
        h('span', { class: 'grip', title: 'Drag to reorder' }, '☰'),
        h('label', { class: 'fx-enable' }, enabled, h('span', { class: 'switch' })),
        h('span', { class: 'fx-name', onclick: () => { fx.collapsed = !fx.collapsed; body.hidden = !!fx.collapsed; card.classList.toggle('collapsed', !!fx.collapsed); } }, `${index + 1}. ${def.label}`),
        h('button', { class: 'icon', title: 'Move up', onclick: () => store.moveEffect(fx.id, index - 1) }, '▲'),
        h('button', { class: 'icon', title: 'Move down', onclick: () => store.moveEffect(fx.id, index + 1) }, '▼'),
        h('button', {
          class: 'icon', title: 'Duplicate',
          onclick: () => {
            const copy = { ...JSON.parse(JSON.stringify(fx)), id: uid() };
            store.settings.effects.splice(index + 1, 0, copy);
            store.emit('structure'); store.commit();
          },
        }, '⎘'),
        h('button', { class: 'icon danger', title: 'Remove', onclick: () => store.removeEffect(fx.id) }, '✕'),
      );
      const body = h('div', { class: 'fx-body' }, ctl.el);
      body.hidden = !!fx.collapsed;
      const card = h('div', { class: 'fx-card' + (fx.enabled ? '' : ' disabled') + (fx.collapsed ? ' collapsed' : '') }, head, body);
      head.addEventListener('dragstart', (e) => { dragId = fx.id; e.dataTransfer?.setData('text/plain', fx.id); card.classList.add('dragging'); });
      head.addEventListener('dragend', () => { dragId = null; card.classList.remove('dragging'); });
      card.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); card.classList.add('drop'); } });
      card.addEventListener('dragleave', () => card.classList.remove('drop'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drop');
        if (dragId && dragId !== fx.id) store.moveEffect(dragId, index);
      });
      list.append(card);
    });
  };
  rebuild();
  return { el: sec.root, refresh: (o) => controls.forEach((c) => c.refresh(o)), rebuild };
}

/* ============================================================ Presets */

const USER_KEY = 'sg.userPresets';

function readUserPresets(): { name: string; settings: any }[] {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || '[]'); } catch { return []; }
}

function writeUserPresets(list: { name: string; settings: any }[]) {
  try { localStorage.setItem(USER_KEY, JSON.stringify(list)); } catch { toast('Could not save presets (storage blocked)', 'error'); }
}

export function presetsPanel(): Panel {
  const sec = section('Presets', { id: 'presets', open: true });
  const builtin = h('div', { class: 'preset-grid' });
  let tag = '';
  for (const p of BUILTIN_PRESETS) {
    if (p.tag !== tag) { tag = p.tag; builtin.append(h('div', { class: 'pal-group' }, tag)); }
    builtin.append(h('button', { class: 'preset', onclick: () => { store.load(p.settings, true); toast(`Preset: ${p.name}`); } }, p.name));
  }
  const userList = h('div', { class: 'user-presets' });
  const nameInput = h('input', { type: 'text', class: 'text', placeholder: 'Preset name' });
  const renderUser = () => {
    clear(userList);
    const list = readUserPresets();
    if (!list.length) userList.append(h('div', { class: 'dim small' }, 'No saved presets yet.'));
    list.forEach((p, i) => userList.append(h('div', { class: 'user-row' },
      h('button', { class: 'preset', onclick: () => { store.load(p.settings, true); toast(`Preset: ${p.name}`); } }, p.name),
      h('button', { class: 'icon', title: 'Download JSON', onclick: () => download(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${p.name}.gliph.json`) }, '⬇'),
      h('button', { class: 'icon danger', title: 'Delete', onclick: () => { const l = readUserPresets(); l.splice(i, 1); writeUserPresets(l); renderUser(); } }, '✕'),
    )));
  };
  sec.body.append(
    builtin,
    h('div', { class: 'sub-title' }, 'Your Presets'),
    h('div', { class: 'btn-row' }, nameInput, h('button', {
      class: 'btn accent',
      onclick: () => {
        const name = nameInput.value.trim() || `Preset ${readUserPresets().length + 1}`;
        const list = readUserPresets().filter((p) => p.name !== name);
        list.push({ name, settings: JSON.parse(JSON.stringify(store.settings)) });
        writeUserPresets(list);
        nameInput.value = '';
        renderUser();
        toast(`Saved "${name}"`);
      },
    }, 'Save')),
    h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn', onclick: async () => {
          const files = await pickFiles('.json', true);
          const list = readUserPresets();
          for (const f of files) {
            try {
              const data = JSON.parse(await f.text());
              const entry = data.settings ? data : { name: f.name.replace(/\.(gliph\.)?json$/, ''), settings: data };
              list.push(entry);
            } catch { toast(`Invalid preset: ${f.name}`, 'error'); }
          }
          writeUserPresets(list);
          renderUser();
        },
      }, 'Import JSON'),
      h('button', { class: 'btn', onclick: () => download(new Blob([JSON.stringify({ name: 'current', settings: store.settings }, null, 2)], { type: 'application/json' }), 'current.gliph.json') }, 'Export Current'),
    ),
    userList,
  );
  renderUser();
  return { el: sec.root, refresh: () => {} };
}

/* ============================================================ Export */

export function exportPanel(exporter: Exporter, source: SourceManager): Panel {
  const sec = section('Export', { id: 'export' });
  const format = h('select', { class: 'select' },
    h('optgroup', { label: 'Still' }, h('option', { value: 'png' }, 'PNG (alpha)'), h('option', { value: 'jpg' }, 'JPEG'), h('option', { value: 'webp' }, 'WebP')),
    h('optgroup', { label: 'Vector & Text' }, h('option', { value: 'svg' }, 'SVG vector'), h('option', { value: 'txt' }, 'TXT character grid'), h('option', { value: 'html' }, 'HTML colour ASCII')),
    h('optgroup', { label: 'Motion' }, h('option', { value: 'mp4' }, 'MP4 (H.264)'), h('option', { value: 'gif' }, 'GIF'), h('option', { value: 'zip' }, 'PNG sequence (ZIP)')),
  );
  const scale = h('select', { class: 'select' }, ...[0.5, 1, 2, 3, 4].map((s) => h('option', { value: s, selected: s === 1 }, `${s}x`)));
  const start = h('input', { type: 'number', class: 'num', min: 0, step: 0.1, value: 0 });
  const end = h('input', { type: 'number', class: 'num', min: 0, step: 0.1, value: 0 });
  const bitrate = h('input', { type: 'number', class: 'num', min: 0, max: 200, step: 1, value: 0, title: '0 = automatic' });
  const drop = h('input', { type: 'checkbox', class: 'toggle' });
  const rangeRow = h('div', { class: 'ctl-grid' },
    h('label', { class: 'ctl-label' }, 'Start (s)'), start,
    h('label', { class: 'ctl-label' }, 'End (s)'), end,
    h('label', { class: 'ctl-label' }, 'Bitrate Mbps'), bitrate,
  );
  const dropRow = h('label', { class: 'ctl ctl-toggle' }, drop, h('span', { class: 'switch' }), h('span', { class: 'ctl-label' }, 'Drop lightest colour (print / embroidery)'));
  const bar = h('div', { class: 'progress' }, h('i'));
  const status = h('div', { class: 'dim small export-status' });
  const go = h('button', { class: 'btn big accent' }, 'Forge Export');
  const cancel = h('button', { class: 'btn', hidden: true, onclick: () => exporter.cancel() }, 'Cancel');
  const note = h('div', { class: 'hint-box small' });

  const progress = (done: number, total: number, label: string) => {
    (bar.firstChild as HTMLElement).style.width = `${(done / Math.max(1, total)) * 100}%`;
    status.textContent = label;
  };

  const sync = () => {
    const f = format.value as ExportFormat;
    const motion = f === 'mp4' || f === 'gif' || f === 'zip';
    rangeRow.hidden = !motion;
    bitrate.hidden = f !== 'mp4';
    (bitrate.previousElementSibling as HTMLElement).hidden = f !== 'mp4';
    dropRow.hidden = f !== 'svg';
    scale.disabled = f === 'txt' || f === 'html';
    const notes: Record<string, string> = {
      svg: 'Vectors trace the dither grid, glyphs or halftone dots. Post effects are raster only and are skipped.',
      txt: 'True character grid, one glyph per cell. Needs Glyphs mode.',
      html: 'Coloured monospace page. Needs Glyphs mode.',
      mp4: `Renders every frame at ${store.settings.anim.fps} fps using the timeline range.`,
      gif: 'GIF uses a 256 colour palette per frame. Keep the scale small.',
      zip: 'Lossless PNG frames with alpha, for compositing.',
    };
    note.textContent = notes[f] || 'Exports the current frame at the chosen scale.';
    note.hidden = false;
    if (motion && Number(end.value) <= Number(start.value)) end.value = String((source.kind === 'video' ? source.duration : store.settings.anim.duration).toFixed(2));
  };
  format.addEventListener('change', sync);

  go.addEventListener('click', async () => {
    if (exporter.running) return;
    go.disabled = true;
    cancel.hidden = false;
    try {
      await exporter.run({
        format: format.value as ExportFormat,
        scale: Number(scale.value),
        start: Number(start.value),
        end: Number(end.value),
        fps: store.settings.anim.fps,
        bitrate: Number(bitrate.value),
        dropLightest: drop.checked,
      }, progress);
    } catch (err: any) {
      toast(String(err?.message || err), 'error');
      status.textContent = String(err?.message || err);
    } finally {
      go.disabled = false;
      cancel.hidden = true;
    }
  });

  const batch = h('button', {
    class: 'btn', title: 'Apply current settings to many images, download a ZIP',
    onclick: async () => {
      const files = await pickFiles('image/*', true);
      if (!files.length) return;
      cancel.hidden = false;
      try { await exporter.batch(files, Number(scale.value), progress); }
      catch (err: any) { toast(String(err?.message || err), 'error'); }
      finally { cancel.hidden = true; }
    },
  }, 'Batch Images…');

  sec.body.append(
    h('div', { class: 'ctl-grid' }, h('label', { class: 'ctl-label' }, 'Format'), format, h('label', { class: 'ctl-label' }, 'Scale'), scale),
    rangeRow, dropRow, note,
    h('div', { class: 'btn-row' }, go, cancel),
    bar, status,
    h('div', { class: 'btn-row' }, batch),
  );
  sync();
  return { el: sec.root, refresh: () => { if (!exporter.running) sync(); } };
}
