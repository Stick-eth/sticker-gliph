import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { zipSync } from 'fflate';
import { store } from '../state';
import type { Renderer } from './renderer';
import type { SourceManager } from './source';
import { download } from './dom';

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg' | 'txt' | 'html' | 'mp4' | 'gif' | 'zip';

export interface ExportOptions {
  format: ExportFormat;
  scale: number;
  start: number;
  end: number;
  fps: number;
  bitrate: number; // Mbps, 0 = auto
  dropLightest: boolean;
}

type Progress = (done: number, total: number, label: string) => void;

const EXPORT_MAX = 8192;

function baseName(source: SourceManager): string {
  return (source.name || 'forge').replace(/\.[^.]+$/, '') + '-gliph';
}

async function imageDataToBlob(img: ImageData, type: string, quality?: number): Promise<Blob> {
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext('2d')!;
  if (type !== 'image/png') {
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    const tmp = new OffscreenCanvas(img.width, img.height);
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    g.drawImage(tmp, 0, 0);
  } else g.putImageData(img, 0, 0);
  return c.convertToBlob({ type, quality });
}

export class Exporter {
  private cancelled = false;
  running = false;

  constructor(private renderer: Renderer, private source: SourceManager) {}

  cancel() {
    this.cancelled = true;
  }

  async run(opts: ExportOptions, progress: Progress): Promise<void> {
    if (this.source.kind === 'none') throw new Error('Load a source first');
    this.cancelled = false;
    this.running = true;
    await this.renderer.lock();
    try {
      switch (opts.format) {
        case 'png':
        case 'jpg':
        case 'webp':
          await this.still(opts, progress);
          break;
        case 'svg':
        case 'html':
          await this.markup(opts, progress);
          break;
        case 'txt':
          await this.text(opts, progress);
          break;
        default:
          if (this.source.kind === 'webcam') throw new Error('Pause on a still or load a video to export sequences');
          await this.sequence(opts, progress);
      }
    } finally {
      this.running = false;
      this.renderer.unlock();
    }
  }

  private job(t: number, scale: number, wantText = false) {
    const fps = store.settings.anim.fps || 30;
    return { settings: store.resolved(t), time: t, frame: Math.round(t * fps), scale, wantText };
  }

  private async still(opts: ExportOptions, progress: Progress) {
    progress(0, 1, 'Forging still');
    await this.renderer.prepareSource(EXPORT_MAX);
    const res = await this.renderer.renderPrepared(this.job(store.time, opts.scale), this.source.w, this.source.h);
    const type = opts.format === 'png' ? 'image/png' : opts.format === 'jpg' ? 'image/jpeg' : 'image/webp';
    const blob = await imageDataToBlob(res.image, type, 0.95);
    download(blob, `${baseName(this.source)}.${opts.format}`);
    progress(1, 1, `Saved ${res.image.width}x${res.image.height}`);
  }

  private async markup(opts: ExportOptions, progress: Progress) {
    progress(0, 1, 'Tracing vectors');
    await this.renderer.prepareSource(EXPORT_MAX);
    const out = await this.renderer.markup(this.job(store.time, opts.scale), { format: opts.format, dropLightest: opts.dropLightest });
    if (!out) throw new Error(opts.format === 'html' ? 'HTML export needs Glyphs (ASCII) mode' : 'SVG export needs Dither, Glyphs or Halftone mode');
    const type = opts.format === 'html' ? 'text/html' : 'image/svg+xml';
    download(new Blob([out], { type }), `${baseName(this.source)}.${opts.format}`);
    progress(1, 1, `Saved ${(out.length / 1024).toFixed(0)} KB`);
  }

  private async text(opts: ExportOptions, progress: Progress) {
    if (store.settings.mode !== 'ascii') throw new Error('TXT export needs Glyphs (ASCII) mode');
    progress(0, 1, 'Carving characters');
    await this.renderer.prepareSource(EXPORT_MAX);
    const res = await this.renderer.renderPrepared(this.job(store.time, 1, true), this.source.w, this.source.h);
    download(new Blob([res.text || ''], { type: 'text/plain;charset=utf-8' }), `${baseName(this.source)}.txt`);
    progress(1, 1, `Saved ${res.gridW}x${res.gridH} characters`);
  }

  private async sequence(opts: ExportOptions, progress: Progress) {
    const fps = opts.fps;
    const start = Math.max(0, opts.start);
    const end = Math.max(start + 1 / fps, opts.end);
    const total = Math.max(1, Math.round((end - start) * fps));
    const isVideo = this.source.kind === 'video';
    const wasPaused = this.source.video.paused;
    if (isVideo) this.source.video.pause();

    let mp4: { encoder: VideoEncoder; muxer: Muxer<ArrayBufferTarget>; canvas: OffscreenCanvas } | null = null;
    const gif = opts.format === 'gif' ? GIFEncoder() : null;
    const zipFiles: Record<string, Uint8Array> = {};
    let encodeError: any = null;

    for (let i = 0; i < total; i++) {
      if (this.cancelled) throw new Error('Export cancelled');
      const t = start + i / fps;
      if (isVideo) await this.source.seek(t);
      await this.renderer.prepareSource(EXPORT_MAX);
      const job = this.job(t, opts.scale);
      job.frame = i;
      const res = await this.renderer.renderPrepared(job, this.source.w, this.source.h);
      const img = res.image;

      if (opts.format === 'mp4') {
        if (!mp4) {
          const W = img.width - (img.width % 2), H = img.height - (img.height % 2);
          const bitrate = opts.bitrate > 0 ? opts.bitrate * 1e6 : Math.min(80e6, Math.max(4e6, W * H * fps * 0.25));
          const codec = await pickCodec(W, H, bitrate, fps);
          const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
          const encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => (encodeError = e),
          });
          encoder.configure({ codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' });
          mp4 = { encoder, muxer, canvas: new OffscreenCanvas(W, H) };
        }
        const g = mp4.canvas.getContext('2d')!;
        g.fillStyle = '#000';
        g.fillRect(0, 0, mp4.canvas.width, mp4.canvas.height);
        const tmp = new OffscreenCanvas(img.width, img.height);
        tmp.getContext('2d')!.putImageData(img, 0, 0);
        g.drawImage(tmp, 0, 0);
        const frame = new VideoFrame(mp4.canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
        mp4.encoder.encode(frame, { keyFrame: i % Math.round(fps * 2) === 0 });
        frame.close();
        while (mp4.encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 5));
        if (encodeError) throw encodeError;
      } else if (gif) {
        const palette = quantize(img.data, 256);
        const index = applyPalette(img.data, palette);
        gif.writeFrame(index, img.width, img.height, { palette, delay: Math.round(1000 / fps) });
      } else {
        const blob = await imageDataToBlob(img, 'image/png');
        zipFiles[`frame_${String(i).padStart(5, '0')}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      progress(i + 1, total, `Frame ${i + 1} / ${total}`);
    }

    const name = baseName(this.source);
    if (mp4) {
      await mp4.encoder.flush();
      mp4.muxer.finalize();
      download(new Blob([mp4.muxer.target.buffer], { type: 'video/mp4' }), `${name}.mp4`);
    } else if (gif) {
      gif.finish();
      download(new Blob([gif.bytes() as BlobPart], { type: 'image/gif' }), `${name}.gif`);
    } else {
      download(new Blob([zipSync(zipFiles, { level: 0 }) as BlobPart], { type: 'application/zip' }), `${name}-frames.zip`);
    }
    if (isVideo) {
      await this.source.seek(store.time);
      if (!wasPaused) void this.source.video.play();
    }
  }

  /** Applies current settings to many images and downloads a ZIP of PNGs. */
  async batch(files: File[], scale: number, progress: Progress): Promise<void> {
    this.cancelled = false;
    this.running = true;
    await this.renderer.lock();
    const out: Record<string, Uint8Array> = {};
    try {
      for (let i = 0; i < files.length; i++) {
        if (this.cancelled) throw new Error('Batch cancelled');
        const f = files[i];
        const bmp = await createImageBitmap(f);
        const w = bmp.width, h = bmp.height;
        await this.renderer.sendBitmap(bmp, 'batch:' + i);
        const res = await this.renderer.renderPrepared(this.job(store.time, scale), w, h);
        const blob = await imageDataToBlob(res.image, 'image/png');
        out[f.name.replace(/\.[^.]+$/, '') + '-gliph.png'] = new Uint8Array(await blob.arrayBuffer());
        progress(i + 1, files.length, `${f.name}`);
      }
      download(new Blob([zipSync(out, { level: 0 }) as BlobPart], { type: 'application/zip' }), 'sticker-gliph-batch.zip');
    } finally {
      this.running = false;
      this.renderer.unlock();
    }
  }
}

async function pickCodec(width: number, height: number, bitrate: number, framerate: number): Promise<string> {
  if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs not available in this browser (use Chrome or Edge)');
  for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.4d0033', 'avc1.42003e', 'avc1.42001f']) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
      if (r.supported) return codec;
    } catch { /* try next */ }
  }
  throw new Error(`No H.264 encoder for ${width}x${height}; lower the export scale`);
}
