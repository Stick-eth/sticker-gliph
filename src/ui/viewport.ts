import { h } from './dom';

/** Zoomable, pannable preview with a before/after compare split. */
export class Viewport {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  private compareCanvas: HTMLCanvasElement;
  private stage: HTMLElement;
  private handle: HTMLElement;
  private empty: HTMLElement;
  zoom = 1;
  private panX = 0;
  private panY = 0;
  private fitMode = true;
  private split = 0.5;
  compare = false;
  srcW = 0;
  srcH = 0;
  onZoomChange: () => void = () => {};

  constructor(emptyContent: HTMLElement) {
    this.canvas = h('canvas', { class: 'out' });
    this.compareCanvas = h('canvas', { class: 'cmp' });
    this.handle = h('div', { class: 'cmp-handle' }, h('span', {}, 'SOURCE'), h('span', {}, 'FORGED'));
    this.stage = h('div', { class: 'stage' }, this.canvas, this.compareCanvas, this.handle);
    this.empty = h('div', { class: 'empty' }, emptyContent);
    this.el = h('div', { class: 'viewport' }, this.stage, this.empty);
    this.compareCanvas.hidden = true;
    this.handle.hidden = true;
    this.bind();
    new ResizeObserver(() => { if (this.fitMode) this.fit(); }).observe(this.el);
  }

  private bind() {
    let drag: { x: number; y: number; px: number; py: number } | null = null;
    let splitDrag = false;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target === this.handle || this.handle.contains(e.target as Node)) {
        splitDrag = true;
      } else {
        drag = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY };
      }
      this.el.setPointerCapture(e.pointerId);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (splitDrag) {
        const r = this.canvas.getBoundingClientRect();
        this.split = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        this.applyCompare();
      } else if (drag) {
        this.panX = drag.px + e.clientX - drag.x;
        this.panY = drag.py + e.clientY - drag.y;
        this.fitMode = false;
        this.apply();
      }
    });
    const end = () => { drag = null; splitDrag = false; };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.el.getBoundingClientRect();
      const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nz = Math.max(0.05, Math.min(32, this.zoom * factor));
      const k = nz / this.zoom;
      this.panX = mx - (mx - this.panX) * k;
      this.panY = my - (my - this.panY) * k;
      this.zoom = nz;
      this.fitMode = false;
      this.apply();
      this.onZoomChange();
    }, { passive: false });
    this.el.addEventListener('dblclick', (e) => { if (e.target !== this.handle) { this.fit(); this.onZoomChange(); } });
  }

  setSourceSize(w: number, h: number) {
    const changed = w !== this.srcW || h !== this.srcH;
    this.srcW = w;
    this.srcH = h;
    this.empty.hidden = w > 0;
    if (changed) this.fit();
  }

  fit() {
    if (!this.srcW) return;
    const r = this.el.getBoundingClientRect();
    const pad = 32;
    this.zoom = Math.max(0.02, Math.min((r.width - pad) / this.srcW, (r.height - pad) / this.srcH));
    this.panX = 0;
    this.panY = 0;
    this.fitMode = true;
    this.apply();
  }

  actualSize() {
    this.zoom = 1 / (window.devicePixelRatio || 1);
    this.panX = 0;
    this.panY = 0;
    this.fitMode = false;
    this.apply();
    this.onZoomChange();
  }

  zoomBy(f: number) {
    this.zoom = Math.max(0.05, Math.min(32, this.zoom * f));
    this.fitMode = false;
    this.apply();
    this.onZoomChange();
  }

  private apply() {
    if (!this.srcW) return;
    const outAspect = this.canvas.width && this.canvas.height ? this.canvas.height / this.canvas.width : this.srcH / this.srcW;
    const cssW = this.srcW * this.zoom;
    const cssH = cssW * outAspect;
    this.stage.style.width = `${cssW}px`;
    this.stage.style.height = `${cssH}px`;
    this.stage.style.transform = `translate(calc(-50% + ${this.panX}px), calc(-50% + ${this.panY}px))`;
    const devicePx = cssW * (window.devicePixelRatio || 1);
    this.canvas.classList.toggle('pixelated', this.canvas.width > 0 && devicePx / this.canvas.width >= 1);
    this.applyCompare();
  }

  private applyCompare() {
    this.compareCanvas.hidden = !this.compare;
    this.handle.hidden = !this.compare;
    const pct = this.split * 100;
    this.compareCanvas.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    this.handle.style.left = `${pct}%`;
  }

  setCompare(on: boolean) {
    this.compare = on;
    this.applyCompare();
  }

  /** Target render scale (output px per source px) for crisp preview at current zoom. */
  previewScale(quality: string): number {
    if (quality === 'full') return 1;
    if (quality === 'half') return 0.5;
    const dpr = window.devicePixelRatio || 1;
    return Math.max(0.05, Math.min(1, this.zoom * dpr * 1.05));
  }

  show(image: ImageData, compare: ImageBitmap | null) {
    if (this.canvas.width !== image.width || this.canvas.height !== image.height) {
      this.canvas.width = image.width;
      this.canvas.height = image.height;
      this.compareCanvas.width = image.width;
      this.compareCanvas.height = image.height;
      this.apply();
    }
    this.canvas.getContext('2d')!.putImageData(image, 0, 0);
    if (compare) {
      const g = this.compareCanvas.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.clearRect(0, 0, this.compareCanvas.width, this.compareCanvas.height);
      g.drawImage(compare, 0, 0, this.compareCanvas.width, this.compareCanvas.height);
      compare.close();
    }
  }
}
