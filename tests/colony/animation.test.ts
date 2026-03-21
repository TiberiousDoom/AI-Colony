import { describe, it, expect } from 'vitest'
import { actionToAnimation, tickAnimation, ANIMATIONS } from '../../src/colony/rendering/animation.ts'
import type { VillagerAction } from '../../src/colony/simulation/villager.ts'
import { SPRITE_NAMES } from '../../src/colony/rendering/sprite-generator.ts'

describe('Animation', () => {
  const ALL_ACTIONS: VillagerAction[] = [
    'idle', 'forage', 'eat', 'rest', 'chop_wood', 'haul',
    'fish', 'mine_stone', 'build_shelter', 'build_storage', 'warm_up', 'flee',
  ]

  it('actionToAnimation maps all 12 action types', () => {
    for (const action of ALL_ACTIONS) {
      const anim = actionToAnimation(action)
      expect(ANIMATIONS).toHaveProperty(anim)
    }
  })

  it('walk animation cycles through 4 frames', () => {
    expect(ANIMATIONS.walk.frames).toHaveLength(4)
    expect(ANIMATIONS.walk.loop).toBe(true)
  })

  it('flee animation cycles faster than walk', () => {
    expect(ANIMATIONS.flee.speed).toBeLessThan(ANIMATIONS.walk.speed)
  })

  it('rest animation loops at slower speed', () => {
    expect(ANIMATIONS.rest.speed).toBeGreaterThan(ANIMATIONS.walk.speed)
    expect(ANIMATIONS.rest.loop).toBe(true)
  })

  it('idle animation stays on frame 0', () => {
    expect(ANIMATIONS.idle.frames).toHaveLength(1)
    expect(ANIMATIONS.idle.loop).toBe(false)
  })

  it('tickAnimation advances frame at correct rate', () => {
    // Start at frame 0, tick 0
    let result = tickAnimation('walk', 0, 0)
    // Should not advance immediately (speed = 8)
    expect(result.frame).toBe(0)
    expect(result.frameTick).toBe(1)

    // Tick until we reach the speed threshold
    let frame = 0
    let tick = 0
    for (let i = 0; i < ANIMATIONS.walk.speed; i++) {
      const r = tickAnimation('walk', frame, tick)
      frame = r.frame
      tick = r.frameTick
    }
    expect(frame).toBe(1) // Should have advanced to frame 1
  })

  it('tickAnimation loops when loop=true', () => {
    const anim = ANIMATIONS.walk
    // Advance past the last frame
    let frame = anim.frames.length - 1
    let tick = anim.speed - 1
    const result = tickAnimation('walk', frame, tick)
    expect(result.frame).toBe(0) // Wrapped back to 0
  })

  it('all animation frame names exist in sprite inventory', () => {
    const spriteSet = new Set<string>(SPRITE_NAMES)
    for (const [, anim] of Object.entries(ANIMATIONS)) {
      for (const frameName of anim.frames) {
        expect(spriteSet.has(frameName), `Missing sprite: ${frameName}`).toBe(true)
      }
    }
  })
})
