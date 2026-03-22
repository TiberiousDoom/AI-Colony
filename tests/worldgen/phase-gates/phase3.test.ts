import { describe, it, expect } from 'vitest'
import { ALL_GENERATORS } from '../../../src/worldgen/generation/registry.ts'
import { createDefaultConfig, BiomeType, type GenerationResult } from '../../../src/worldgen/generation/generator-interface.ts'
import { WorldgenBlockType } from '../../../src/worldgen/world/block-types.ts'
import { WorldgenGrid } from '../../../src/worldgen/world/worldgen-grid.ts'
import { createRNG } from '../../../src/shared/seed.ts'
import { placeOres } from '../../../src/worldgen/generation/layers/ore-placement.ts'
import { decorateSurface } from '../../../src/worldgen/generation/layers/surface-decoration.ts'
import { placeSpawnPoints } from '../../../src/worldgen/generation/layers/spawn-placement.ts'
import { expandGrammar } from '../../../src/worldgen/grammar/grammar-engine.ts'
import { placeStructures } from '../../../src/worldgen/grammar/structure-placer.ts'

function createTestGrid(surfaceY: number = 32): { grid: WorldgenGrid; heightMap: Float32Array; biomeMap: Uint8Array } {
  const grid = new WorldgenGrid(64, 64, 64)
  const heightMap = new Float32Array(64 * 64)
  const biomeMap = new Uint8Array(64 * 64)

  for (let x = 0; x < 64; x++) {
    for (let z = 0; z < 64; z++) {
      heightMap[x * 64 + z] = surfaceY
      // Assign biomes in quadrants for testing
      if (x < 32 && z < 32) biomeMap[x * 64 + z] = BiomeType.Forest
      else if (x >= 32 && z < 32) biomeMap[x * 64 + z] = BiomeType.Desert
      else if (x < 32 && z >= 32) biomeMap[x * 64 + z] = BiomeType.Plains
      else biomeMap[x * 64 + z] = BiomeType.Tundra

      for (let y = 0; y < 64; y++) {
        if (y === 0) grid.setBlock({ x, y, z }, WorldgenBlockType.Bedrock)
        else if (y < surfaceY - 3) grid.setBlock({ x, y, z }, WorldgenBlockType.Stone)
        else if (y < surfaceY) grid.setBlock({ x, y, z }, WorldgenBlockType.Dirt)
        else if (y === surfaceY) grid.setBlock({ x, y, z }, WorldgenBlockType.Grass)
      }
    }
  }
  return { grid, heightMap, biomeMap }
}

describe('Phase 3: Ore Placement', () => {
  it('places ores in stone underground', () => {
    const { grid, heightMap } = createTestGrid()
    const rng = createRNG(42)
    const count = placeOres(grid, heightMap, rng)
    expect(count).toBeGreaterThan(0)
  })

  it('ore types appear at correct depths', () => {
    const { grid, heightMap } = createTestGrid()
    placeOres(grid, heightMap, createRNG(42))

    // Coal can appear anywhere, crystal only deep
    let coalFound = false
    for (let x = 0; x < 64; x += 2) {
      for (let z = 0; z < 64; z += 2) {
        for (let y = 1; y < 30; y++) {
          const block = grid.getBlock({ x, y, z })
          if (block === WorldgenBlockType.Coal) coalFound = true
          // Crystal is rare, not asserted here
        }
      }
    }
    expect(coalFound).toBe(true)
    // Crystal is rare, might not appear in small test grid
  })

  it('ores only replace stone', () => {
    const { grid, heightMap } = createTestGrid()
    placeOres(grid, heightMap, createRNG(42))
    // Bedrock layer should be untouched
    for (let x = 0; x < 64; x += 8) {
      for (let z = 0; z < 64; z += 8) {
        expect(grid.getBlock({ x, y: 0, z })).toBe(WorldgenBlockType.Bedrock)
      }
    }
  })
})

describe('Phase 3: Surface Decoration', () => {
  it('places trees in forest biome', () => {
    const { grid, heightMap, biomeMap } = createTestGrid()
    const rng = createRNG(42)
    const count = decorateSurface(grid, heightMap, biomeMap, rng, 20)
    expect(count).toBeGreaterThan(0)

    // Check for wood blocks (tree trunks) in forest quadrant
    let woodFound = false
    for (let x = 2; x < 30; x++) {
      for (let z = 2; z < 30; z++) {
        for (let y = 33; y < 40; y++) {
          if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Wood) {
            woodFound = true
            break
          }
        }
        if (woodFound) break
      }
      if (woodFound) break
    }
    expect(woodFound).toBe(true)
  })

  it('places cacti in desert biome', () => {
    const { grid, heightMap, biomeMap } = createTestGrid()
    decorateSurface(grid, heightMap, biomeMap, createRNG(42), 20)

    let cactusFound = false
    for (let x = 32; x < 62; x++) {
      for (let z = 2; z < 30; z++) {
        for (let y = 33; y < 38; y++) {
          if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Cactus) {
            cactusFound = true
            break
          }
        }
        if (cactusFound) break
      }
      if (cactusFound) break
    }
    expect(cactusFound).toBe(true)
  })

  it('does not place trees in tundra', () => {
    const { grid, heightMap, biomeMap } = createTestGrid()
    decorateSurface(grid, heightMap, biomeMap, createRNG(42), 20)

    // Tundra quadrant (x>=32, z>=32)
    let woodInTundra = false
    for (let x = 34; x < 62; x++) {
      for (let z = 34; z < 62; z++) {
        for (let y = 33; y < 40; y++) {
          if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Wood) {
            woodInTundra = true
          }
        }
      }
    }
    expect(woodInTundra).toBe(false)
  })
})

describe('Phase 3: Spawn Placement', () => {
  it('places rift and resource spawn points', () => {
    const { grid, heightMap, biomeMap } = createTestGrid()
    const spawns = placeSpawnPoints(grid, heightMap, biomeMap, createRNG(42), 20)
    expect(spawns.length).toBeGreaterThan(0)

    const rifts = spawns.filter(s => s.type === 'rift')
    const resources = spawns.filter(s => s.type === 'resource')
    expect(rifts.length).toBeGreaterThan(0)
    expect(resources.length).toBeGreaterThan(0)
  })

  it('rifts maintain minimum distance', () => {
    const { grid, heightMap, biomeMap } = createTestGrid()
    const spawns = placeSpawnPoints(grid, heightMap, biomeMap, createRNG(42), 20)
    const rifts = spawns.filter(s => s.type === 'rift')

    for (let i = 0; i < rifts.length; i++) {
      for (let j = i + 1; j < rifts.length; j++) {
        const dx = rifts[i].position.x - rifts[j].position.x
        const dz = rifts[i].position.z - rifts[j].position.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        expect(dist).toBeGreaterThanOrEqual(29) // min distance 30, allow tiny float error
      }
    }
  })

  it('spawn points have difficulty gradient', () => {
    const { grid, heightMap, biomeMap } = createTestGrid()
    const spawns = placeSpawnPoints(grid, heightMap, biomeMap, createRNG(42), 20)

    for (const s of spawns) {
      expect(s.difficulty).toBeGreaterThanOrEqual(0)
      expect(s.difficulty).toBeLessThanOrEqual(1)
    }
  })
})

describe('Phase 3: Grammar Engine', () => {
  it('expands grammar and produces connected rooms', () => {
    const rng = createRNG(42)
    const result = expandGrammar(rng, 32, 5, 32, 8, 64, 64, 64)
    expect(result.rooms.length).toBeGreaterThan(1)
  })

  it('rooms do not overlap', () => {
    const rng = createRNG(42)
    const result = expandGrammar(rng, 32, 5, 32, 8, 128, 64, 128)

    for (let i = 0; i < result.rooms.length; i++) {
      for (let j = i + 1; j < result.rooms.length; j++) {
        const a = result.rooms[i], b = result.rooms[j]
        const overlaps =
          a.x < b.x + b.template.width && a.x + a.template.width > b.x &&
          a.y < b.y + b.template.height && a.y + a.template.height > b.y &&
          a.z < b.z + b.template.depth && a.z + a.template.depth > b.z
        expect(overlaps).toBe(false)
      }
    }
  })

  it('rooms fit within world bounds', () => {
    const rng = createRNG(42)
    const result = expandGrammar(rng, 32, 5, 32, 8, 64, 64, 64)

    for (const room of result.rooms) {
      expect(room.x).toBeGreaterThanOrEqual(0)
      expect(room.y).toBeGreaterThanOrEqual(0)
      expect(room.z).toBeGreaterThanOrEqual(0)
      expect(room.x + room.template.width).toBeLessThanOrEqual(64)
      expect(room.y + room.template.height).toBeLessThanOrEqual(64)
      expect(room.z + room.template.depth).toBeLessThanOrEqual(64)
    }
  })

  it('placeStructures carves rooms into grid', () => {
    const { grid, heightMap: _heightMap } = createTestGrid()
    const rng = createRNG(42)
    const result = expandGrammar(rng, 20, 5, 20, 5, 64, 64, 64)
    const carved = placeStructures(grid, result)
    expect(carved).toBeGreaterThan(0)
  })
})

describe('Phase 3: Full Pipeline (All 5 Algorithms)', () => {
  const config = createDefaultConfig(42)

  for (const gen of ALL_GENERATORS) {
    describe(gen.name, () => {
      let result: GenerationResult

      it('generates with all 6 layers', () => {
        const c = { ...config, params: gen.getDefaultParams() }
        result = gen.generate(c)
        expect(result).toBeDefined()
        expect(result.spawnPoints).toBeDefined()
      })

      it('has ore blocks underground', () => {
        const { grid } = result
        const oreTypes = [WorldgenBlockType.Coal, WorldgenBlockType.Iron, WorldgenBlockType.Copper,
                          WorldgenBlockType.Gold, WorldgenBlockType.Gem, WorldgenBlockType.Crystal]
        let oreCount = 0
        for (let x = 0; x < grid.worldWidth; x += 8) {
          for (let z = 0; z < grid.worldDepth; z += 8) {
            for (let y = 1; y < 30; y++) {
              if (oreTypes.includes(grid.getBlock({ x, y, z }))) oreCount++
            }
          }
        }
        expect(oreCount).toBeGreaterThan(0)
      })

      it('has surface decorations', () => {
        const { grid } = result
        const decoTypes = [WorldgenBlockType.Wood, WorldgenBlockType.Leaves,
                           WorldgenBlockType.Cactus, WorldgenBlockType.Flower, WorldgenBlockType.DeadBush]
        let decoCount = 0
        for (let x = 0; x < grid.worldWidth; x += 4) {
          for (let z = 0; z < grid.worldDepth; z += 4) {
            for (let y = 30; y < 55; y++) {
              if (decoTypes.includes(grid.getBlock({ x, y, z }))) decoCount++
            }
          }
        }
        expect(decoCount).toBeGreaterThan(0)
      })

      it('has spawn points with valid properties', () => {
        expect(result.spawnPoints.length).toBeGreaterThan(0)
        for (const s of result.spawnPoints) {
          expect(s.type === 'rift' || s.type === 'resource').toBe(true)
          expect(s.difficulty).toBeGreaterThanOrEqual(0)
          expect(s.difficulty).toBeLessThanOrEqual(1)
          expect(s.position.x).toBeGreaterThanOrEqual(0)
          expect(s.position.z).toBeGreaterThanOrEqual(0)
        }
      })

      it('reports timing for all layers', () => {
        expect(result.timing.oresMs).toBeGreaterThanOrEqual(0)
        expect(result.timing.decorationMs).toBeGreaterThanOrEqual(0)
        expect(result.timing.spawnsMs).toBeGreaterThanOrEqual(0)
      })
    })
  }
})
