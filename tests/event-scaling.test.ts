/**
 * Tests for event difficulty scaling.
 */

import { describe, it, expect } from 'vitest'
import { getDifficultyMultiplier } from '../src/simulation/events.ts'

describe('getDifficultyMultiplier', () => {
  it('returns 1.0 for early game (days 0-15)', () => {
    expect(getDifficultyMultiplier(0)).toBe(1.0)
    expect(getDifficultyMultiplier(5)).toBe(1.0)
    expect(getDifficultyMultiplier(15)).toBe(1.0)
  })

  it('returns 1.2 for mid game (days 16-30)', () => {
    expect(getDifficultyMultiplier(16)).toBe(1.2)
    expect(getDifficultyMultiplier(25)).toBe(1.2)
    expect(getDifficultyMultiplier(30)).toBe(1.2)
  })

  it('returns 1.5 for late game (days 31-50)', () => {
    expect(getDifficultyMultiplier(31)).toBe(1.5)
    expect(getDifficultyMultiplier(40)).toBe(1.5)
    expect(getDifficultyMultiplier(50)).toBe(1.5)
  })

  it('returns 1.8 for endgame (days 51+)', () => {
    expect(getDifficultyMultiplier(51)).toBe(1.8)
    expect(getDifficultyMultiplier(100)).toBe(1.8)
  })
})
