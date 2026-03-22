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

// --- 3D Simplex Noise ---

// 16 gradient vectors for 3D simplex noise
const GRAD3 = [
  [1,1,0], [-1,1,0], [1,-1,0], [-1,-1,0],
  [1,0,1], [-1,0,1], [1,0,-1], [-1,0,-1],
  [0,1,1], [0,-1,1], [0,1,-1], [0,-1,-1],
  [1,1,0], [-1,1,0], [0,-1,1], [0,-1,-1],
]

const F3 = 1.0 / 3.0
const G3 = 1.0 / 6.0

function dot3(g: number[], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z
}

/**
 * Creates a 3D simplex noise function seeded by the given RNG.
 * Returns values in approximately [-1, 1].
 */
export function createNoise3D(rng: SeededRNG): (x: number, y: number, z: number) => number {
  const perm = new Uint8Array(512)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i

  for (let i = 255; i > 0; i--) {
    const j = rng.nextInt(0, i)
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }

  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  return function noise3D(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const k = Math.floor(zin + s)

    const t = (i + j + k) * G3
    const X0 = i - t
    const Y0 = j - t
    const Z0 = k - t
    const x0 = xin - X0
    const y0 = yin - Y0
    const z0 = zin - Z0

    // Determine which simplex we're in
    let i1: number, j1: number, k1: number
    let i2: number, j2: number, k2: number

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0
      }
    }

    const x1 = x0 - i1 + G3
    const y1 = y0 - j1 + G3
    const z1 = z0 - k1 + G3
    const x2 = x0 - i2 + 2.0 * G3
    const y2 = y0 - j2 + 2.0 * G3
    const z2 = z0 - k2 + 2.0 * G3
    const x3 = x0 - 1.0 + 3.0 * G3
    const y3 = y0 - 1.0 + 3.0 * G3
    const z3 = z0 - 1.0 + 3.0 * G3

    const ii = i & 255
    const jj = j & 255
    const kk = k & 255
    const gi0 = perm[ii + perm[jj + perm[kk]]] % 16
    const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 16
    const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 16
    const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 16

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
    if (t0 >= 0) {
      t0 *= t0
      n0 = t0 * t0 * dot3(GRAD3[gi0], x0, y0, z0)
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
    if (t1 >= 0) {
      t1 *= t1
      n1 = t1 * t1 * dot3(GRAD3[gi1], x1, y1, z1)
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
    if (t2 >= 0) {
      t2 *= t2
      n2 = t2 * t2 * dot3(GRAD3[gi2], x2, y2, z2)
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
    if (t3 >= 0) {
      t3 *= t3
      n3 = t3 * t3 * dot3(GRAD3[gi3], x3, y3, z3)
    }

    // Scale to [-1, 1]
    return 32.0 * (n0 + n1 + n2 + n3)
  }
}

/**
 * Fractal Brownian Motion for 3D noise.
 */
export function fractalNoise3D(
  noise: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let total = 0
  let amplitude = 1
  let frequency = 1
  let maxValue = 0

  for (let i = 0; i < octaves; i++) {
    total += noise(x * frequency, y * frequency, z * frequency) * amplitude
    maxValue += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }

  return total / maxValue
}
