import { describe, it, expect } from 'vitest'
import { World, TileType } from '../src/simulation/world.ts'

describe('World', () => {
  const defaultConfig = { width: 64, height: 64, seed: 42 }

  describe('generation', () => {
    it('creates a world of the correct size', () => {
      const world = new World(defaultConfig)
      expect(world.width).toBe(64)
      expect(world.height).toBe(64)
      expect(world.tiles.length).toBe(64)
      expect(world.tiles[0].length).toBe(64)
    })

    it('is deterministic for the same seed', () => {
      const w1 = new World(defaultConfig)
      const w2 = new World(defaultConfig)
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          expect(w1.tiles[y][x].type).toBe(w2.tiles[y][x].type)
        }
      }
    })

    it('places campfire at the center', () => {
      const world = new World(defaultConfig)
      expect(world.campfirePosition).toEqual({ x: 32, y: 32 })
    })

    it('has a 7x7 passable clearing around campfire (no forest/stone/water)', () => {
      const world = new World(defaultConfig)
      const cx = world.campfirePosition.x
      const cy = world.campfirePosition.y
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const tile = world.getTile(cx + dx, cy + dy)
          // Clearing is initially all grass, but fertile soil scatter may convert
          // some grass tiles adjacent to water into fertile soil
          expect(tile?.type === TileType.Grass || tile?.type === TileType.FertileSoil).toBe(true)
        }
      }
    })

    it('has minimum forest coverage (>= 15%)', () => {
      const world = new World(defaultConfig)
      let forestCount = 0
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (world.tiles[y][x].type === TileType.Forest) forestCount++
        }
      }
      expect(forestCount / (64 * 64)).toBeGreaterThanOrEqual(0.15)
    })

    it('has minimum stone coverage (>= 3%)', () => {
      const world = new World(defaultConfig)
      let stoneCount = 0
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (world.tiles[y][x].type === TileType.Stone) stoneCount++
        }
      }
      expect(stoneCount / (64 * 64)).toBeGreaterThanOrEqual(0.03)
    })

    it('has at least some water', () => {
      const world = new World(defaultConfig)
      let waterCount = 0
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (world.tiles[y][x].type === TileType.Water) waterCount++
        }
      }
      expect(waterCount).toBeGreaterThan(0)
    })
  })

  describe('getTile', () => {
    it('returns the correct tile', () => {
      const world = new World(defaultConfig)
      const tile = world.getTile(32, 32)
      expect(tile).not.toBeNull()
      expect(tile!.x).toBe(32)
      expect(tile!.y).toBe(32)
    })

    it('returns null for out-of-bounds coordinates', () => {
      const world = new World(defaultConfig)
      expect(world.getTile(-1, 0)).toBeNull()
      expect(world.getTile(0, -1)).toBeNull()
      expect(world.getTile(64, 0)).toBeNull()
      expect(world.getTile(0, 64)).toBeNull()
    })
  })

  describe('isPassable', () => {
    it('water tiles are impassable', () => {
      const world = new World(defaultConfig)
      // Find a water tile
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (world.tiles[y][x].type === TileType.Water) {
            expect(world.isPassable(x, y)).toBe(false)
            return
          }
        }
      }
    })

    it('grass, forest, and stone tiles are passable', () => {
      const world = new World(defaultConfig)
      const passableTypes = [TileType.Grass, TileType.Forest, TileType.Stone, TileType.FertileSoil]
      for (const type of passableTypes) {
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 64; x++) {
            if (world.tiles[y][x].type === type) {
              expect(world.isPassable(x, y)).toBe(true)
              return
            }
          }
        }
      }
    })

    it('out-of-bounds is impassable', () => {
      const world = new World(defaultConfig)
      expect(world.isPassable(-1, 0)).toBe(false)
      expect(world.isPassable(64, 0)).toBe(false)
    })
  })

  describe('findTilesInRadius', () => {
    it('finds forest tiles within radius', () => {
      const world = new World(defaultConfig)
      const tiles = world.findTilesInRadius(32, 32, 10, t => t.type === TileType.Forest)
      for (const tile of tiles) {
        expect(tile.type).toBe(TileType.Forest)
        expect(tile.x).toBeGreaterThanOrEqual(22)
        expect(tile.x).toBeLessThanOrEqual(42)
        expect(tile.y).toBeGreaterThanOrEqual(22)
        expect(tile.y).toBeLessThanOrEqual(42)
      }
    })

    it('returns empty array when no tiles match', () => {
      const world = new World(defaultConfig)
      const tiles = world.findTilesInRadius(32, 32, 3, t => t.type === TileType.Water)
      // Campfire clearing is all grass, water unlikely within radius 3
      expect(tiles.length).toBe(0)
    })
  })

  describe('tickRegeneration', () => {
    it('regenerates forest tiles', () => {
      const world = new World(defaultConfig)
      // Find a forest tile and deplete it
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (world.tiles[y][x].type === TileType.Forest) {
            const tile = world.tiles[y][x]
            tile.resourceAmount = 50
            world.tickRegeneration()
            expect(tile.resourceAmount).toBe(50.5) // regenRate = 0.5
            return
          }
        }
      }
    })

    it('does not exceed maxResource', () => {
      const world = new World(defaultConfig)
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (world.tiles[y][x].type === TileType.Forest) {
            const tile = world.tiles[y][x]
            tile.resourceAmount = 99.8
            world.tickRegeneration()
            expect(tile.resourceAmount).toBe(100) // capped at max
            return
          }
        }
      }
    })

    it('stone tiles do not regenerate', () => {
      const world = new World(defaultConfig)
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          if (world.tiles[y][x].type === TileType.Stone) {
            const tile = world.tiles[y][x]
            tile.resourceAmount = 50
            world.tickRegeneration()
            expect(tile.resourceAmount).toBe(50) // regenRate = 0
            return
          }
        }
      }
    })
  })
})
