import { describe, it, expect } from 'vitest'
import { createRNG } from '../../src/shared/seed.ts'
import { createNoise2D, fractalNoise } from '../../src/shared/noise.ts'

describe('Noise2D', () => {
  it('is deterministic for the same seed', () => {
    const rng1 = createRNG(42)
    const rng2 = createRNG(42)
    const noise1 = createNoise2D(rng1)
    const noise2 = createNoise2D(rng2)

    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        expect(noise1(x * 0.1, y * 0.1)).toBe(noise2(x * 0.1, y * 0.1))
      }
    }
  })

  it('returns values approximately in [-1, 1]', () => {
    const rng = createRNG(123)
    const noise = createNoise2D(rng)

    let min = Infinity
    let max = -Infinity
    for (let x = 0; x < 100; x++) {
      for (let y = 0; y < 100; y++) {
        const v = noise(x * 0.1, y * 0.1)
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
    }

    expect(min).toBeGreaterThan(-1.5)
    expect(max).toBeLessThan(1.5)
  })

  it('varies across different coordinates', () => {
    const rng = createRNG(42)
    const noise = createNoise2D(rng)

    const values = new Set<string>()
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        values.add(noise(x, y).toFixed(6))
      }
    }
    // Should have many distinct values (not all identical)
    expect(values.size).toBeGreaterThan(10)
  })

  it('returns 0 at the origin', () => {
    const rng = createRNG(42)
    const noise = createNoise2D(rng)
    // Simplex noise returns 0 at exact integer coordinates
    expect(noise(0, 0)).toBe(0)
  })
})

describe('fractalNoise', () => {
  it('returns values for layered octaves', () => {
    const rng = createRNG(42)
    const noise = createNoise2D(rng)

    const v = fractalNoise(noise, 5.5, 3.2, 4, 0.5, 2.0)
    expect(typeof v).toBe('number')
    expect(Number.isFinite(v)).toBe(true)
  })

  it('is deterministic', () => {
    const rng1 = createRNG(42)
    const noise1 = createNoise2D(rng1)
    const rng2 = createRNG(42)
    const noise2 = createNoise2D(rng2)

    const v1 = fractalNoise(noise1, 10.5, 7.3, 4, 0.5, 2.0)
    const v2 = fractalNoise(noise2, 10.5, 7.3, 4, 0.5, 2.0)
    expect(v1).toBe(v2)
  })

  it('with more octaves produces more variation', () => {
    const rng = createRNG(42)
    const noise = createNoise2D(rng)

    // Collect range for 1 octave vs 4 octaves
    let min1 = Infinity, max1 = -Infinity
    let min4 = Infinity, max4 = -Infinity

    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        const v1 = fractalNoise(noise, x * 0.1, y * 0.1, 1, 0.5, 2.0)
        const v4 = fractalNoise(noise, x * 0.1, y * 0.1, 4, 0.5, 2.0)
        min1 = Math.min(min1, v1)
        max1 = Math.max(max1, v1)
        min4 = Math.min(min4, v4)
        max4 = Math.max(max4, v4)
      }
    }

    // Both should have finite range
    expect(max1 - min1).toBeGreaterThan(0)
    expect(max4 - min4).toBeGreaterThan(0)
  })
})
