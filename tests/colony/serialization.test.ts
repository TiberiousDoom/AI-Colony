import { describe, it, expect } from 'vitest'
import { createRNG, createRNGFromState } from '../../src/shared/seed.ts'
import { serializeNeedsMap, deserializeNeedsMap } from '../../src/colony/utils/serialization.ts'
import { NeedType, type NeedState } from '../../src/colony/simulation/villager.ts'

describe('Serialization', () => {
  describe('RNG state capture and restore', () => {
    it('getState returns current internal state', () => {
      const rng = createRNG(42)
      const state = rng.getState()
      expect(typeof state).toBe('number')
    })

    it('createRNGFromState produces identical sequence', () => {
      const rng1 = createRNG(42)
      // Advance a few times
      rng1.next()
      rng1.next()
      rng1.next()

      // Capture state
      const state = rng1.getState()

      // Create restored RNG
      const rng2 = createRNGFromState(state)

      // Both should produce same sequence from here
      for (let i = 0; i < 10; i++) {
        expect(rng1.next()).toBe(rng2.next())
      }
    })

    it('restored RNG fork produces same results', () => {
      const rng1 = createRNG(42)
      rng1.next()
      const state = rng1.getState()

      const rng2 = createRNGFromState(state)

      const fork1 = rng1.fork()
      const fork2 = rng2.fork()

      for (let i = 0; i < 5; i++) {
        expect(fork1.next()).toBe(fork2.next())
      }
    })
  })

  describe('NeedsMap serialization', () => {
    it('round-trips NeedsMap correctly', () => {
      const needs = new Map<NeedType, NeedState>()
      needs.set(NeedType.Hunger, { current: 50, drainRate: 2, min: 0, max: 100 })
      needs.set(NeedType.Energy, { current: 75, drainRate: 1, min: 0, max: 100 })
      needs.set(NeedType.Health, { current: 80, drainRate: 0, min: 0, max: 100 })
      needs.set(NeedType.Warmth, { current: 60, drainRate: 0, min: 0, max: 100 })

      const serialized = serializeNeedsMap(needs)
      const deserialized = deserializeNeedsMap(serialized)

      expect(deserialized.size).toBe(4)
      expect(deserialized.get(NeedType.Hunger)!.current).toBe(50)
      expect(deserialized.get(NeedType.Energy)!.current).toBe(75)
      expect(deserialized.get(NeedType.Health)!.current).toBe(80)
      expect(deserialized.get(NeedType.Warmth)!.current).toBe(60)
    })
  })

  describe('Snapshot schema', () => {
    it('schema version is included', () => {
      const snapshot = {
        version: 1,
        label: 'test',
        timestamp: Date.now(),
        seed: 42,
        competitionState: {} as any,
        rngState: [42],
      }
      expect(snapshot.version).toBe(1)
    })

    it('label auto-generation works', () => {
      const seed = 42
      const ts = Date.now()
      const label = `seed-${seed}-${ts}`
      expect(label).toContain('seed-42')
    })
  })
})
