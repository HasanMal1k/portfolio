// Deterministic noise: the same world every visit, built on demand wherever you wander.

export function hash2(x: number, z: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function vnoise(x: number, z: number): number {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = zf * zf * (3 - 2 * zf)
  const a = hash2(xi, zi)
  const b = hash2(xi + 1, zi)
  const c = hash2(xi, zi + 1)
  const d = hash2(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, z: number, octaves = 3): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x, z) * amp
    norm += amp
    x = x * 2.03 + 17.1
    z = z * 2.03 - 9.7
    amp *= 0.5
  }
  return sum / norm
}

export const WATER = -1.0

/** How far from the start the world stays a calm, dry clearing. */
const CLEARING = 11

export function clearing(x: number, z: number): number {
  return Math.max(0, 1 - Math.hypot(x, z) / CLEARING)
}

export function height(x: number, z: number): number {
  let h = (fbm(x * 0.04, z * 0.04, 3) - 0.4) * 5
  h += (vnoise(x * 0.35 + 50, z * 0.35) - 0.5) * 0.3
  const c = clearing(x, z)
  return h * (1 - c * 0.85) + c * 0.25
}

/** 0..1, above ~0.58 the field turns to jungle. */
export function jungle(x: number, z: number): number {
  return fbm(x * 0.028 + 100, z * 0.028 - 40, 2) - clearing(x, z) * 0.5
}

/** 0..1, above ~0.68 the grass gives way to sand. The clearing is grass, bar one patch for the chicken. */
export function sandy(x: number, z: number): number {
  const patch = Math.max(0, 1 - Math.hypot(x + 2.4, z - 3.6) / 2.2)
  return Math.max(vnoise(x * 0.07 - 20, z * 0.07 + 70) - clearing(x, z), patch)
}
