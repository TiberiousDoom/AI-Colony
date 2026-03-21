import { describe, it, expect } from 'vitest'
import { createRNG } from '../../src/shared/seed.ts'

describe('SeededRNG', () => {
  it('produces deterministic results for the same seed', () => {
    const a = createRNG(42)
    const b = createRNG(42)
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('produces different results for different seeds', () => {
    const a = createRNG(1)
    const b = createRNG(2)
    const aVals = Array.from({ length: 10 }, () => a.next())
    const bVals = Array.from({ length: 10 }, () => b.next())
    expect(aVals).not.toEqual(bVals)
  })

  it('next() returns values in [0, 1)', () => {
    const rng = createRNG(123)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('nextInt returns values in [min, max] inclusive', () => {
    const rng = createRNG(99)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
      expect(Number.isInteger(v)).toBe(true)
      seen.add(v)
    }
    // Should have seen all values 3-7 in 1000 draws
    expect(seen.size).toBe(5)
  })

  it('nextFloat returns values in [min, max)', () => {
    const rng = createRNG(77)
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextFloat(2.5, 5.5)
      expect(v).toBeGreaterThanOrEqual(2.5)
      expect(v).toBeLessThan(5.5)
    }
  })

  it('fork creates an independent child', () => {
    const parent1 = createRNG(42)
    const parent2 = createRNG(42)

    const child1 = parent1.fork()
    const child2 = parent2.fork()

    // Children should produce the same sequence
    for (let i = 0; i < 50; i++) {
      expect(child1.next()).toBe(child2.next())
    }

    // Parent should continue producing different values from child
    const parentVal = parent1.next()
    const childVal = child1.next()
    // They might occasionally match, but across many values they diverge
    const parentVals = [parentVal, ...Array.from({ length: 9 }, () => parent1.next())]
    const childVals = [childVal, ...Array.from({ length: 9 }, () => child1.next())]
    expect(parentVals).not.toEqual(childVals)
  })

  it('shuffle is deterministic and in-place', () => {
    const rng1 = createRNG(42)
    const rng2 = createRNG(42)
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    const result1 = rng1.shuffle(arr1)
    rng2.shuffle(arr2)

    expect(result1).toBe(arr1) // in-place
    expect(arr1).toEqual(arr2) // deterministic
    // Should actually be shuffled (unlikely to stay sorted for 10 elements)
    expect(arr1).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})
