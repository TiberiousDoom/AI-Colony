import { describe, it, expect } from 'vitest'
import { calculateProsperity } from '../src/utils/scoring.ts'

describe('Prosperity Scoring', () => {
  it('returns 0 for all-zero inputs', () => {
    expect(calculateProsperity(0, 0, 0, 0, 0, 0, 0, 0)).toBe(0)
  })

  it('population contributes 10 per villager', () => {
    const base = calculateProsperity(0, 0, 0, 0, 0, 0, 0, 0)
    const with5 = calculateProsperity(5, 0, 0, 0, 0, 0, 0, 0)
    expect(with5 - base).toBe(50)
  })

  it('days survived contributes 0.5 per day', () => {
    const base = calculateProsperity(0, 0, 0, 0, 0, 0, 0, 0)
    const with10 = calculateProsperity(0, 0, 0, 0, 0, 0, 0, 10)
    expect(with10 - base).toBe(5)
  })

  it('all components accumulate', () => {
    const score = calculateProsperity(10, 75, 100, 50, 30, 0, 0, 20)
    // 10*10 + 75*0.5 + 100*0.3 + 50*0.2 + 30*0.2 + 0 + 0 + 20*0.5
    // = 100 + 37.5 + 30 + 10 + 6 + 0 + 0 + 10 = 193.5
    expect(score).toBeCloseTo(193.5)
  })
})
