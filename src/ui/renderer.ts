import type { Settings } from '../core/types';
import type { SourceManager } from './source';

export interface FrameResult {
  image: ImageData;
  text?: string;
  gridW: number;
  gridH: number;
  ms: number;
}

export interface RenderJob {
  settings: Settings;
  time: number;
  frame: number;
  scale: number;
  wantText?: boolean;
}

/** Talks to the engine worker; coalesces preview requests so only the latest state renders. */
export class Renderer {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private sentKey = '';
  private busy = false;
  private dirty = false;
  private locked = false;
  private idleWaiters: (() => void)[] = [];

  /** Provides the job for a preview render. */
  jobProvider: () => RenderJob | null = () => null;
  onFrame: (res: FrameResult, bitmapForCompare: ImageBitmap | null) => void = () => {};
  onError: (msg: string) => void = () => {};
  wantCompare = false;

  constructor(private source: SourceManager) {
    this.worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else p.resolve(msg);
    };
  }

  call(msg: any, transfer: Transferable[] = []): Promise<any> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  invalidateSource(): void {
    this.sentKey = '';
  }

  async sendBitmap(bmp: ImageBitmap, key: string): Promise<void> {
    this.sentKey = key;
    await this.call({ type: 'source', bitmap: bmp }, [bmp]);
  }

  private async ensureSource(maxDim: number): Promise<ImageBitmap | null> {
    const key = this.source.frameKey() + '@' + maxDim;
    if (key === this.sentKey && !this.wantCompare) return null;
    const bmp = await this.source.capture(maxDim);
    if (!bmp) return null;
    let compare: ImageBitmap | null = null;
    if (this.wantCompare) compare = await createImageBitmap(bmp);
    if (key !== this.sentKey) await this.sendBitmap(bmp, key);
    else bmp.close();
    return compare;
  }

  async render(job: RenderJob, maxDim = 2560): Promise<{ res: FrameResult; compare: ImageBitmap | null }> {
    const compare = await this.ensureSource(maxDim);
    const res = await this.renderPrepared(job, this.source.w, this.source.h);
    return { res, compare };
  }

  /** Makes sure the worker holds the current source frame at the given resolution cap. */
  async prepareSource(maxDim: number): Promise<void> {
    const extra = await this.ensureSource(maxDim);
    extra?.close();
  }

  /** Renders with whatever source the worker currently holds. */
  async renderPrepared(job: RenderJob, srcW: number, srcH: number): Promise<FrameResult> {
    const msg = await this.call({
      type: 'render',
      params: { settings: job.settings, srcW, srcH, time: job.time, frame: job.frame, scale: job.scale, wantText: job.wantText },
    });
    const image = new ImageData(new Uint8ClampedArray(msg.buffer), msg.w, msg.h);
    return { image, text: msg.text, gridW: msg.gridW, gridH: msg.gridH, ms: msg.ms };
  }

  /** Vector or HTML export of the current stage (post effects excluded). */
  async markup(job: RenderJob, options: Record<string, any>): Promise<string | null> {
    const msg = await this.call({
      type: 'svg',
      params: { settings: job.settings, srcW: this.source.w, srcH: this.source.h, time: job.time, frame: job.frame, scale: job.scale },
      options,
    });
    return msg.svg;
  }

  request(): void {
    this.dirty = true;
    if (!this.busy && !this.locked) void this.loop();
  }

  private async loop(): Promise<void> {
    this.busy = true;
    while (this.dirty && !this.locked) {
      this.dirty = false;
      const job = this.jobProvider();
      if (!job || this.source.kind === 'none') break;
      try {
        const { res, compare } = await this.render(job);
        this.onFrame(res, compare);
      } catch (err: any) {
        this.onError(String(err?.message || err));
      }
    }
    this.busy = false;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((w) => w());
  }

  /** Pauses preview rendering for exclusive use (exports). */
  async lock(): Promise<void> {
    this.locked = true;
    if (this.busy) await new Promise<void>((r) => this.idleWaiters.push(r));
  }

  unlock(): void {
    this.locked = false;
    this.sentKey = '';
    this.request();
  }

  isLocked(): boolean {
    return this.locked;
  }
}
