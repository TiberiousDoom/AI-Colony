import { describe, it, expect } from 'vitest'
import { World } from '../../src/colony/simulation/world.ts'

describe('Dirty Tiles', () => {
  function makeWorld() {
    return new World({ width: 64, height: 64, seed: 42 })
  }

  it('dirtyTiles starts empty', () => {
    const world = makeWorld()
    expect(world.dirtyTiles.size).toBe(0)
  })

  it('applyBlight marks tiles dirty', () => {
    const world = makeWorld()
    // Find a forest tile — center (32,32) is a grass clearing
    const forestTile = world.tiles.flat().find(t => t.type === 'forest' && t.resourceAmount > 0)
    expect(forestTile).toBeDefined()
    world.applyBlight(forestTile!.x, forestTile!.y, 0, 10)
    expect(world.dirtyTiles.size).toBeGreaterThan(0)
  })

  it('tickRegeneration marks regenerated tiles dirty', () => {
    const world = makeWorld()
    // Deplete a forest tile
    const forestTile = world.tiles.flat().find(t => t.type === 'forest' && t.resourceAmount > 0)
    if (forestTile) {
      forestTile.resourceAmount = 0
      world.dirtyTiles.clear()
      // Now regeneration should mark it dirty
      world.tickRegeneration('spring')
      // Spring has 2x regen, so if tile had regenRate > 0, it should be dirty
      if (forestTile.regenRate > 0) {
        expect(world.dirtyTiles.has(`${forestTile.x},${forestTile.y}`)).toBe(true)
      }
    }
  })

  it('dirtyTiles can be cleared', () => {
    const world = makeWorld()
    const forestTile = world.tiles.flat().find(t => t.type === 'forest' && t.resourceAmount > 0)
    expect(forestTile).toBeDefined()
    world.applyBlight(forestTile!.x, forestTile!.y, 0, 10)
    expect(world.dirtyTiles.size).toBeGreaterThan(0)
    world.dirtyTiles.clear()
    expect(world.dirtyTiles.size).toBe(0)
  })
})
