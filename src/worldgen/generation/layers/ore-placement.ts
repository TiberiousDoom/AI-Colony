import type { SeededRNG } from '../../../shared/seed.ts'
import type { WorldgenGrid } from '../../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../../world/block-types.ts'

interface OreConfig {
  type: WorldgenBlockType
  minDepth: number    // min Y (from bottom)
  maxDepth: number    // max Y (from bottom)
  veinSizeMin: number
  veinSizeMax: number
  frequency: number   // veins per 1000 columns
}

const ORE_CONFIGS: OreConfig[] = [
  { type: WorldgenBlockType.Coal,    minDepth: 1, maxDepth: 48, veinSizeMin: 4, veinSizeMax: 12, frequency: 8 },
  { type: WorldgenBlockType.Iron,    minDepth: 1, maxDepth: 40, veinSizeMin: 3, veinSizeMax: 8,  frequency: 6 },
  { type: WorldgenBlockType.Copper,  minDepth: 8, maxDepth: 36, veinSizeMin: 3, veinSizeMax: 7,  frequency: 5 },
  { type: WorldgenBlockType.Gold,    minDepth: 1, maxDepth: 20, veinSizeMin: 2, veinSizeMax: 5,  frequency: 3 },
  { type: WorldgenBlockType.Gem,     minDepth: 1, maxDepth: 16, veinSizeMin: 1, veinSizeMax: 4,  frequency: 2 },
  { type: WorldgenBlockType.Crystal, minDepth: 1, maxDepth: 12, veinSizeMin: 1, veinSizeMax: 3,  frequency: 1.5 },
]

/**
 * Places ore veins underground. Each vein grows by random-walking
 * through stone blocks from a seed point.
 */
export function placeOres(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
): number {
  const { worldWidth, worldDepth } = grid
  let totalPlaced = 0

  for (const ore of ORE_CONFIGS) {
    const veinCount = Math.floor(worldWidth * worldDepth / 1000 * ore.frequency)

    for (let v = 0; v < veinCount; v++) {
      const sx = rng.nextInt(1, worldWidth - 2)
      const sz = rng.nextInt(1, worldDepth - 2)
      const surfY = Math.floor(heightMap[sx * worldDepth + sz])
      const maxY = Math.min(ore.maxDepth, surfY - 2)
      if (maxY <= ore.minDepth) continue

      const sy = rng.nextInt(ore.minDepth, maxY)
      const veinSize = rng.nextInt(ore.veinSizeMin, ore.veinSizeMax)

      // Grow vein by random walk
      let cx = sx, cy = sy, cz = sz
      for (let i = 0; i < veinSize; i++) {
        if (grid.isInBounds({ x: cx, y: cy, z: cz }) &&
            grid.getBlock({ x: cx, y: cy, z: cz }) === WorldgenBlockType.Stone) {
          grid.setBlock({ x: cx, y: cy, z: cz }, ore.type)
          totalPlaced++
        }
        // Random walk
        const dir = rng.nextInt(0, 5)
        if (dir === 0) cx++
        else if (dir === 1) cx--
        else if (dir === 2) cy++
        else if (dir === 3) cy--
        else if (dir === 4) cz++
        else cz--
      }
    }
  }

  return totalPlaced
}
