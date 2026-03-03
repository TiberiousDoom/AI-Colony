import { describe, it, expect } from 'vitest'
import { findPath } from '../src/utils/pathfinding.ts'

const always = () => true
const SIZE = 20

describe('Pathfinding (A*)', () => {
  it('finds a straight line path in open space', () => {
    const result = findPath(0, 0, 5, 0, always, SIZE, SIZE)
    expect(result.found).toBe(true)
    expect(result.path[0]).toEqual({ x: 0, y: 0 })
    expect(result.path[result.path.length - 1]).toEqual({ x: 5, y: 0 })
    expect(result.cost).toBe(5)
  })

  it('returns same position when start === goal', () => {
    const result = findPath(3, 3, 3, 3, always, SIZE, SIZE)
    expect(result.found).toBe(true)
    expect(result.path).toEqual([{ x: 3, y: 3 }])
    expect(result.cost).toBe(0)
  })

  it('navigates around obstacles', () => {
    // Create a wall at x=5 from y=0 to y=8
    const isPassable = (x: number, y: number) => !(x === 5 && y <= 8)
    const result = findPath(3, 4, 7, 4, isPassable, SIZE, SIZE)
    expect(result.found).toBe(true)
    expect(result.path[result.path.length - 1]).toEqual({ x: 7, y: 4 })
    // Path should go around the wall
    expect(result.cost).toBeGreaterThan(4)
    // Verify no step passes through the wall
    for (const step of result.path) {
      expect(!(step.x === 5 && step.y <= 8)).toBe(true)
    }
  })

  it('returns empty path when start is impassable', () => {
    const isPassable = (x: number, y: number) => !(x === 0 && y === 0)
    const result = findPath(0, 0, 5, 5, isPassable, SIZE, SIZE)
    expect(result.found).toBe(false)
    expect(result.path).toEqual([])
  })

  it('returns partial path when goal is unreachable', () => {
    // Block a 3x3 area around the goal
    const isPassable = (x: number, y: number) => {
      if (x >= 8 && x <= 10 && y >= 8 && y <= 10) return false
      return true
    }
    const result = findPath(0, 0, 9, 9, isPassable, SIZE, SIZE)
    expect(result.found).toBe(false)
    // Should have a partial path that gets closer to goal
    expect(result.path.length).toBeGreaterThan(0)
    const last = result.path[result.path.length - 1]
    const dist = Math.abs(last.x - 9) + Math.abs(last.y - 9)
    expect(dist).toBeLessThan(20) // closer than start
  })

  it('respects grid boundaries', () => {
    const result = findPath(0, 0, 4, 4, always, 5, 5)
    expect(result.found).toBe(true)
    for (const step of result.path) {
      expect(step.x).toBeGreaterThanOrEqual(0)
      expect(step.x).toBeLessThan(5)
      expect(step.y).toBeGreaterThanOrEqual(0)
      expect(step.y).toBeLessThan(5)
    }
  })

  it('path steps are contiguous (4-directional)', () => {
    const result = findPath(0, 0, 10, 10, always, SIZE, SIZE)
    expect(result.found).toBe(true)
    for (let i = 1; i < result.path.length; i++) {
      const prev = result.path[i - 1]
      const curr = result.path[i]
      const dx = Math.abs(curr.x - prev.x)
      const dy = Math.abs(curr.y - prev.y)
      // Each step must be exactly one tile in cardinal direction
      expect(dx + dy).toBe(1)
    }
  })
})
