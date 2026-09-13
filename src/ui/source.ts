export type SourceKind = 'none' | 'image' | 'video' | 'webcam';

export class SourceManager {
  kind: SourceKind = 'none';
  name = '';
  w = 0;
  h = 0;
  image: ImageBitmap | null = null;
  video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private serial = 0;
  onChange: () => void = () => {};

  constructor() {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.loop = true;
    this.video.crossOrigin = 'anonymous';
  }

  get duration(): number {
    return this.kind === 'video' && Number.isFinite(this.video.duration) ? this.video.duration : 0;
  }

  /** Identifies the current frame; changes whenever a new capture is needed. */
  frameKey(): string {
    if (this.kind === 'video') return `${this.serial}:${this.video.currentTime.toFixed(4)}`;
    if (this.kind === 'webcam') return `${this.serial}:${performance.now()}`;
    return `${this.serial}`;
  }

  private stopMedia() {
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this.video.pause();
    this.video.srcObject = null;
    if (this.video.src) { URL.revokeObjectURL(this.video.src); this.video.removeAttribute('src'); this.video.load(); }
  }

  async loadFile(file: File): Promise<void> {
    if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)) {
      this.stopMedia();
      this.video.src = URL.createObjectURL(file);
      await new Promise<void>((res, rej) => {
        this.video.onloadeddata = () => res();
        this.video.onerror = () => rej(new Error('Unsupported video'));
      });
      // Some WebM files (e.g. MediaRecorder output) have no duration until the end is reached.
      if (!Number.isFinite(this.video.duration)) {
        await new Promise<void>((res) => {
          const v = this.video;
          const done = () => { v.removeEventListener('durationchange', check); res(); };
          const check = () => { if (Number.isFinite(v.duration)) done(); };
          v.addEventListener('durationchange', check);
          v.currentTime = 1e9;
          setTimeout(done, 3000);
        });
        await new Promise<void>((res) => { this.video.onseeked = () => res(); this.video.currentTime = 0; setTimeout(res, 1000); });
        this.video.onseeked = null;
      }
      this.kind = 'video';
      this.image = null;
      this.w = this.video.videoWidth;
      this.h = this.video.videoHeight;
    } else {
      const bmp = await createImageBitmap(file);
      this.stopMedia();
      this.image = bmp;
      this.kind = 'image';
      this.w = bmp.width;
      this.h = bmp.height;
    }
    this.name = file.name;
    this.serial++;
    this.onChange();
  }

  async loadBitmap(bmp: ImageBitmap, name: string): Promise<void> {
    this.stopMedia();
    this.image = bmp;
    this.kind = 'image';
    this.w = bmp.width;
    this.h = bmp.height;
    this.name = name;
    this.serial++;
    this.onChange();
  }

  async startWebcam(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    this.stopMedia();
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    this.kind = 'webcam';
    this.image = null;
    this.w = this.video.videoWidth;
    this.h = this.video.videoHeight;
    this.name = 'Webcam';
    this.serial++;
    this.onChange();
  }

  async loadDemo(): Promise<void> {
    await this.loadBitmap(await createImageBitmap(drawDemo()), 'demo-castle.png');
  }

  /** Captures the current frame, downscaled so the longest side is at most maxDim. */
  async capture(maxDim = 4096): Promise<ImageBitmap | null> {
    const src: ImageBitmapSource | null = this.kind === 'image' ? this.image : this.kind === 'none' ? null : this.video;
    if (!src || !this.w) return null;
    const k = Math.min(1, maxDim / Math.max(this.w, this.h));
    if (k < 1) return createImageBitmap(src, { resizeWidth: Math.round(this.w * k), resizeHeight: Math.round(this.h * k), resizeQuality: 'high' });
    return createImageBitmap(src);
  }

  seek(t: number): Promise<void> {
    if (this.kind !== 'video') return Promise.resolve();
    return new Promise((res) => {
      const v = this.video;
      if (Math.abs(v.currentTime - t) < 1e-4) { res(); return; }
      const done = () => { v.removeEventListener('seeked', done); res(); };
      v.addEventListener('seeked', done);
      v.currentTime = Math.min(Math.max(0, t), Math.max(0, (v.duration || 0) - 1e-3));
    });
  }
}

/** Procedural test image: a castle at dusk with gradients, fine detail and text. */
function drawDemo(): HTMLCanvasElement {
  const W = 1600, H = 1000;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0d0b1f');
  sky.addColorStop(0.45, '#5a2346');
  sky.addColorStop(0.75, '#e0763a');
  sky.addColorStop(1, '#f7d488');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // Stars
  for (let i = 0; i < 260; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1, y = (Math.sin(i * 78.233) * 12345.678) % 1;
    g.fillStyle = `rgba(255,255,240,${0.3 + Math.abs((x * 7) % 1) * 0.7})`;
    g.fillRect(Math.abs(x) * W, Math.abs(y) * H * 0.45, 2, 2);
  }

  // Moon with halo
  const halo = g.createRadialGradient(1180, 300, 40, 1180, 300, 300);
  halo.addColorStop(0, 'rgba(255,240,200,0.9)');
  halo.addColorStop(0.25, 'rgba(255,210,150,0.35)');
  halo.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = halo;
  g.beginPath(); g.arc(1180, 300, 300, 0, Math.PI * 2); g.fill();
  const moon = g.createRadialGradient(1150, 270, 10, 1180, 300, 120);
  moon.addColorStop(0, '#fffaf0');
  moon.addColorStop(1, '#f1c27d');
  g.fillStyle = moon;
  g.beginPath(); g.arc(1180, 300, 120, 0, Math.PI * 2); g.fill();

  // Mountains
  const ridge = (base: number, amp: number, color: string, seed: number) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) {
      const y = base - Math.abs(Math.sin(x * 0.004 + seed) * amp + Math.sin(x * 0.013 + seed * 2) * amp * 0.35);
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.fill();
  };
  ridge(760, 180, '#3b1d33', 1);
  ridge(840, 120, '#24121f', 4);

  // Castle
  g.fillStyle = '#0c0710';
  const tower = (x: number, w: number, top: number) => {
    g.fillRect(x, top, w, H - top);
    for (let k = 0; k < w; k += 24) g.fillRect(x + k, top - 22, 14, 22);
    g.beginPath(); g.moveTo(x - 10, top - 22); g.lineTo(x + w / 2, top - 150); g.lineTo(x + w + 10, top - 22); g.fill();
  };
  g.fillRect(260, 620, 760, 400);
  for (let k = 260; k < 1020; k += 36) g.fillRect(k, 596, 22, 24);
  tower(200, 110, 480);
  tower(480, 140, 400);
  tower(930, 120, 500);
  g.fillStyle = '#ffb347';
  for (const [x, y] of [[530, 470], [575, 470], [240, 560], [965, 580], [700, 700], [760, 700], [820, 700]]) g.fillRect(x, y, 16, 30);

  // Ground and grass stripes
  const ground = g.createLinearGradient(0, 880, 0, H);
  ground.addColorStop(0, '#120a0e');
  ground.addColorStop(1, '#000');
  g.fillStyle = ground;
  g.fillRect(0, 880, W, 120);

  // Title
  g.font = 'bold 120px "Old English Text MT", "UnifrakturMaguntia", Georgia, serif';
  g.textAlign = 'center';
  g.fillStyle = '#f7e7c1';
  g.shadowColor = 'rgba(255,120,40,0.9)';
  g.shadowBlur = 30;
  g.fillText('Sticker Gliph', W / 2, 180);
  g.shadowBlur = 0;

  // Test strips
  const bar = g.createLinearGradient(60, 0, W - 60, 0);
  bar.addColorStop(0, '#000'); bar.addColorStop(1, '#fff');
  g.fillStyle = bar;
  g.fillRect(60, 930, W - 120, 26);
  const hues = g.createLinearGradient(60, 0, W - 60, 0);
  for (let i = 0; i <= 6; i++) hues.addColorStop(i / 6, `hsl(${i * 60},90%,55%)`);
  g.fillStyle = hues;
  g.fillRect(60, 960, W - 120, 26);
  return c;
}
