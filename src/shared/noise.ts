/**
 * 2D simplex noise using integer arithmetic and table lookups.
 * No Math.sin/Math.cos — deterministic across JS engines.
 */

import type { SeededRNG } from './seed.ts'

// Gradient vectors for 2D simplex noise (12 directions)
const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [-1, 1], [1, -1], [-1, -1],
]

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0)
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0

function dot2(g: number[], x: number, y: number): number {
  return g[0] * x + g[1] * y
}

/**
 * Creates a 2D simplex noise function seeded by the given RNG.
 * Returns values in approximately [-1, 1].
 */
export function createNoise2D(rng: SeededRNG): (x: number, y: number) => number {
  // Build permutation table
  const perm = new Uint8Array(512)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i

  // Fisher-Yates shuffle using seeded RNG
  for (let i = 255; i > 0; i--) {
    const j = rng.nextInt(0, i)
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }

  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  return function noise2D(xin: number, yin: number): number {
    // Skew input space to determine which simplex cell we're in
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)

    const t = (i + j) * G2
    const X0 = i - t
    const Y0 = j - t
    const x0 = xin - X0
    const y0 = yin - Y0

    // Determine which simplex we're in
    let i1: number, j1: number
    if (x0 > y0) {
      i1 = 1; j1 = 0
    } else {
      i1 = 0; j1 = 1
    }

    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1.0 + 2.0 * G2
    const y2 = y0 - 1.0 + 2.0 * G2

    const ii = i & 255
    const jj = j & 255
    const gi0 = perm[ii + perm[jj]] % 12
    const gi1 = perm[ii + i1 + perm[jj + j1]] % 12
    const gi2 = perm[ii + 1 + perm[jj + 1]] % 12

    // Calculate contribution from three corners
    let n0 = 0, n1 = 0, n2 = 0

    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 >= 0) {
      t0 *= t0
      n0 = t0 * t0 * dot2(GRAD2[gi0], x0, y0)
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 >= 0) {
      t1 *= t1
      n1 = t1 * t1 * dot2(GRAD2[gi1], x1, y1)
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 >= 0) {
      t2 *= t2
      n2 = t2 * t2 * dot2(GRAD2[gi2], x2, y2)
    }

    // Scale to [-1, 1]
    return 70.0 * (n0 + n1 + n2)
  }
}

/**
 * Fractal Brownian Motion: layers multiple octaves of noise
 * for natural-looking terrain variation.
 */
export function fractalNoise(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let total = 0
  let amplitude = 1
  let frequency = 1
  let maxValue = 0

  for (let i = 0; i < octaves; i++) {
    total += noise(x * frequency, y * frequency) * amplitude
    maxValue += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }

  return total / maxValue
}
