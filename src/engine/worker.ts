/// <reference lib="webworker" />
import type { Img } from '../core/types';
import { renderPipeline, type RenderParams } from './pipeline';
import { stageToHtml, stageToSvg } from './vector';

declare const self: DedicatedWorkerGlobalScope;

let source: Img | null = null;
const state = new Map<string, any>();

function reply(msg: any, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

self.onmessage = async (ev: MessageEvent) => {
  const msg = ev.data;
  const id = msg.id;
  try {
    switch (msg.type) {
      case 'source': {
        const bmp: ImageBitmap = msg.bitmap;
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(bmp, 0, 0);
        bmp.close();
        const data = g.getImageData(0, 0, c.width, c.height).data;
        source = { w: c.width, h: c.height, data };
        reply({ type: 'ok', id });
        break;
      }
      case 'render': {
        if (!source) throw new Error('No source');
        const t0 = performance.now();
        const res = await renderPipeline(source, msg.params as RenderParams, state);
        const buf = res.img.data.buffer as ArrayBuffer;
        reply(
          { type: 'result', id, w: res.img.w, h: res.img.h, buffer: buf, text: res.text, gridW: res.gridW, gridH: res.gridH, ms: performance.now() - t0 },
          [buf],
        );
        break;
      }
      case 'svg': {
        if (!source) throw new Error('No source');
        const res = await renderPipeline(source, { ...(msg.params as RenderParams), skipEffects: true }, new Map());
        const opts = msg.options || {};
        const markup = opts.format === 'html' ? stageToHtml(res.stage, msg.params.settings) : stageToSvg(res.stage, msg.params.settings, opts);
        reply({ type: 'svg', id, svg: markup });
        break;
      }
      case 'resetState':
        state.clear();
        reply({ type: 'ok', id });
        break;
    }
  } catch (err: any) {
    reply({ type: 'error', id, message: String(err?.message || err) });
  }
};
