/** Integer hash to [0,1). Deterministic across frames. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise in [0,1). */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash2(i, 0, seed) * (1 - u) + hash2(i + 1, 0, seed) * u;
}

/** Smooth 2D value noise in [0,1). */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

export interface ThresholdMap {
  size: number;
  data: Float32Array; // values in (0,1)
}

const cache = new Map<string, ThresholdMap>();

export function bayer(n: number): ThresholdMap {
  const key = 'bayer' + n;
  const hit = cache.get(key);
  if (hit) return hit;
  let m = [0];
  let size = 1;
  while (size < n) {
    const s2 = size * 2;
    const next = new Array(s2 * s2);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = 4 * m[y * size + x];
        next[y * s2 + x] = v;
        next[y * s2 + x + size] = v + 2;
        next[(y + size) * s2 + x] = v + 3;
        next[(y + size) * s2 + x + size] = v + 1;
      }
    m = next;
    size = s2;
  }
  const data = new Float32Array(size * size);
  for (let i = 0; i < data.length; i++) data[i] = (m[i] + 0.5) / (size * size);
  const tm = { size, data };
  cache.set(key, tm);
  return tm;
}

/** Rank-based map from a spot function evaluated on an n x n tile. */
function rankMap(key: string, n: number, spot: (x: number, y: number) => number): ThresholdMap {
  const hit = cache.get(key);
  if (hit) return hit;
  const vals: { i: number; v: number }[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) vals.push({ i: y * n + x, v: spot((x + 0.5) / n, (y + 0.5) / n) + hash2(x, y, 7) * 1e-6 });
  vals.sort((a, b) => a.v - b.v);
  const data = new Float32Array(n * n);
  vals.forEach((e, r) => (data[e.i] = (r + 0.5) / (n * n)));
  const tm = { size: n, data };
  cache.set(key, tm);
  return tm;
}

export function clusterDot(n: number): ThresholdMap {
  return rankMap('cluster' + n, n, (x, y) => -(Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y)));
}

/** Void-and-cluster blue noise (Ulichney). */
export function blueNoise(size = 64): ThresholdMap {
  const key = 'blue' + size;
  const hit = cache.get(key);
  if (hit) return hit;
  const N = size * size;
  const sigma = 1.9;
  const R = 6;
  const kernel: number[] = [];
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) kernel.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
  const K = 2 * R + 1;
  const energy = new Float32Array(N);
  const bits = new Uint8Array(N);
  const splat = (i: number, sign: number) => {
    const px = i % size, py = (i / size) | 0;
    for (let dy = -R; dy <= R; dy++) {
      const yy = ((py + dy) % size + size) % size;
      for (let dx = -R; dx <= R; dx++) {
        const xx = ((px + dx) % size + size) % size;
        energy[yy * size + xx] += sign * kernel[(dy + R) * K + dx + R];
      }
    }
  };
  const tightest = () => {
    let best = -1, bv = -Infinity;
    for (let i = 0; i < N; i++) if (bits[i] && energy[i] > bv) { bv = energy[i]; best = i; }
    return best;
  };
  const voidest = () => {
    let best = -1, bv = Infinity;
    for (let i = 0; i < N; i++) if (!bits[i] && energy[i] < bv) { bv = energy[i]; best = i; }
    return best;
  };
  const rnd = mulberry32(1337);
  const initial = Math.floor(N * 0.1);
  let placed = 0;
  while (placed < initial) {
    const i = Math.floor(rnd() * N);
    if (!bits[i]) { bits[i] = 1; splat(i, 1); placed++; }
  }
  for (let guard = 0; guard < N; guard++) {
    const t = tightest();
    bits[t] = 0; splat(t, -1);
    const v = voidest();
    if (v === t) { bits[t] = 1; splat(t, 1); break; }
    bits[v] = 1; splat(v, 1);
  }
  const ranks = new Int32Array(N);
  const protoBits = bits.slice();
  const protoEnergy = energy.slice();
  let ones = initial;
  let rank = ones - 1;
  while (rank >= 0) {
    const t = tightest();
    bits[t] = 0; splat(t, -1);
    ranks[t] = rank--;
  }
  bits.set(protoBits);
  energy.set(protoEnergy);
  rank = ones;
  while (rank < N) {
    const v = voidest();
    bits[v] = 1; splat(v, 1);
    ranks[v] = rank++;
  }
  const data = new Float32Array(N);
  for (let i = 0; i < N; i++) data[i] = (ranks[i] + 0.5) / N;
  const tm = { size, data };
  cache.set(key, tm);
  return tm;
}

export const ign = (x: number, y: number) => {
  const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
  return v - Math.floor(v);
};

export const tri = (z: number) => Math.abs((z - Math.floor(z)) * 2 - 1);

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};
