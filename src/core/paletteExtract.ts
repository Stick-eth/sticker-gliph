import { rgbToHex, luma } from './color';

/** Median cut followed by a few k-means refinement passes. Returns hex colours sorted dark to light. */
export function extractPalette(data: Uint8ClampedArray, count: number): string[] {
  const total = data.length / 4;
  const step = Math.max(1, Math.floor(total / 40000));
  const pts: number[][] = [];
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    if (data[o + 3] < 128) continue;
    pts.push([data[o], data[o + 1], data[o + 2]]);
  }
  if (!pts.length) return ['#000000', '#ffffff'];

  let boxes: number[][][] = [pts];
  while (boxes.length < count) {
    let bi = -1, bestRange = -1, bestCh = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const p of box) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; }
        const r = (hi - lo) * Math.sqrt(box.length);
        if (r > bestRange) { bestRange = r; bi = i; bestCh = ch; }
      }
    });
    if (bi < 0) break;
    const box = boxes[bi].sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }

  let centers = boxes.map((box) => {
    const c = [0, 0, 0];
    for (const p of box) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    return c.map((v) => v / box.length);
  });

  for (let iter = 0; iter < 6; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < centers.length; k++) {
        const c = centers[k];
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      const s = sums[best];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    centers = centers.map((c, k) => (sums[k][3] ? [sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]] : c));
  }

  centers.sort((a, b) => luma(a[0], a[1], a[2]) - luma(b[0], b[1], b[2]));
  const hexes = centers.map((c) => rgbToHex(c[0], c[1], c[2]));
  return [...new Set(hexes)];
}
