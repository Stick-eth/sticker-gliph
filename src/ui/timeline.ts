import { store } from '../state';
import { h } from './dom';
import type { SourceManager } from './source';

export interface TimelineApi {
  el: HTMLElement;
  refresh(): void;
  togglePlay(): void;
}

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

export function buildTimeline(source: SourceManager): TimelineApi {
  const play = h('button', { class: 'btn play', title: 'Play / pause (Space)' }, '▶');
  const toStart = h('button', { class: 'icon', title: 'Go to start' }, '⏮');
  const prevKey = h('button', { class: 'icon', title: 'Previous keyframe' }, '◀◆');
  const nextKey = h('button', { class: 'icon', title: 'Next keyframe' }, '◆▶');
  const timeLabel = h('span', { class: 'time' }, '00:00.00');
  const track = h('div', { class: 'track' });
  const fill = h('div', { class: 'track-fill' });
  const head = h('div', { class: 'playhead' });
  const keys = h('div', { class: 'keys' });
  track.append(fill, keys, head);
  const duration = h('input', { type: 'number', class: 'num small', min: 0.5, max: 600, step: 0.5, title: 'Animation length for still images (s)' });
  const fps = h('select', { class: 'select small', title: 'Frames per second' }, ...[12, 15, 24, 25, 30, 50, 60].map((f) => h('option', { value: f }, `${f} fps`)));
  const keyInfo = h('span', { class: 'dim small' });

  const length = () => (source.kind === 'video' ? source.duration : store.settings.anim.duration) || 1;

  const seek = (t: number) => {
    const len = length();
    t = Math.max(0, Math.min(len, t));
    const f = store.settings.anim.fps;
    t = Math.round(t * f) / f;
    store.setTime(t);
    if (source.kind === 'video') source.video.currentTime = Math.min(t, Math.max(0, source.duration - 1e-3));
  };

  let scrubbing = false;
  const scrubAt = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * length());
  };
  track.addEventListener('pointerdown', (e) => { scrubbing = true; track.setPointerCapture(e.pointerId); scrubAt(e); });
  track.addEventListener('pointermove', (e) => { if (scrubbing) scrubAt(e); });
  track.addEventListener('pointerup', () => (scrubbing = false));

  const togglePlay = () => {
    if (source.kind === 'webcam' || source.kind === 'none') return;
    store.playing = !store.playing;
    if (source.kind === 'video') {
      if (store.playing) void source.video.play();
      else source.video.pause();
    }
    refresh();
  };
  play.addEventListener('click', togglePlay);
  toStart.addEventListener('click', () => seek(0));
  prevKey.addEventListener('click', () => {
    const k = store.keyTimes().filter((t) => t < store.time - 1e-3).pop();
    if (k !== undefined) seek(k);
  });
  nextKey.addEventListener('click', () => {
    const k = store.keyTimes().find((t) => t > store.time + 1e-3);
    if (k !== undefined) seek(k);
  });
  duration.addEventListener('change', () => { store.settings.anim.duration = Math.max(0.5, Number(duration.value) || 6); store.emit('structure'); store.commit(); });
  fps.addEventListener('change', () => { store.settings.anim.fps = Number(fps.value); store.emit('structure'); store.commit(); });

  let lastKeys = '';
  const refresh = () => {
    const len = length();
    const pct = Math.min(100, (store.time / len) * 100);
    head.style.left = `${pct}%`;
    fill.style.width = `${pct}%`;
    timeLabel.textContent = `${fmtTime(store.time)} / ${fmtTime(len)}`;
    play.textContent = store.playing ? '❚❚' : '▶';
    play.classList.toggle('on', store.playing);
    if (document.activeElement !== duration) duration.value = String(store.settings.anim.duration);
    duration.disabled = source.kind === 'video';
    fps.value = String(store.settings.anim.fps);
    const times = store.keyTimes();
    const sig = times.join(',') + '|' + len;
    if (sig !== lastKeys) {
      lastKeys = sig;
      keys.replaceChildren(...times.map((t) => h('button', { class: 'key', style: `left:${(t / len) * 100}%`, title: `Keyframe at ${t.toFixed(2)}s`, onclick: (e: MouseEvent) => { e.stopPropagation(); seek(t); } })));
      const n = Object.keys(store.settings.keyframes).length;
      keyInfo.textContent = n ? `${n} animated param${n > 1 ? 's' : ''}` : 'Click ◆ on a slider to animate';
    }
  };

  const el = h('div', { class: 'timeline' },
    h('div', { class: 'transport' }, toStart, play, prevKey, nextKey, timeLabel),
    track,
    h('div', { class: 'tl-opts' }, keyInfo, h('label', { class: 'dim small' }, 'Length'), duration, fps),
  );
  refresh();
  return { el, refresh, togglePlay };
}
