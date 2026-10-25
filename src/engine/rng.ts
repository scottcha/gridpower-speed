/** Deterministic RNG: a serializable xorshift stream plus stateless hashing. */

export function hash32(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
}

export function hash2(x: number, y: number, salt = 0): number {
  return hash32(Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(salt + 1, 2246822519)) / 4294967296;
}

/** Smooth 2D value noise in [0,1]. */
export function valueNoise(x: number, y: number, salt: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, salt);
  const b = hash2(xi + 1, yi, salt);
  const c = hash2(xi, yi + 1, salt);
  const d = hash2(xi + 1, yi + 1, salt);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x: number, y: number, salt: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * freq, y * freq, salt + i * 131) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / norm;
}

export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T extends { weight: number }>(items: readonly T[]): T;
}

/** Advance the serialized cursor stored on the game state. */
export function makeRng(holder: { rng: number }): Rng {
  const next = (): number => {
    let s = holder.rng | 0;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    holder.rng = s | 0;
    return (s >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items) => {
      const total = items.reduce((s, it) => s + it.weight, 0);
      let r = next() * total;
      for (const it of items) {
        r -= it.weight;
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
  };
}

export function newRngState(seed: number): number {
  const s = hash32(seed ^ 0x51ed2701) | 0;
  return s === 0 ? 0x2545f491 : s;
}
