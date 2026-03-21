import { BlockType } from './block-types.ts'
import type { VoxelGrid } from './voxel-grid.ts'
import type { SeededRNG } from '../../utils/seed.ts'
import { createNoise2D } from '../../utils/noise.ts'

export function generateTerrain(grid: VoxelGrid, rng: SeededRNG): void {
  const size = grid.worldSize
  const noise = createNoise2D(rng)

  // 1. Height map terrain with hills
  const baseHeight = Math.floor(size * 0.25) // ground at ~25% height
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const n = noise(x * 0.08, z * 0.08) // scale noise
      const height = baseHeight + Math.floor(n * 4) // ±4 blocks of hills

      for (let y = 0; y < Math.min(height, size); y++) {
        grid.setBlock({ x, y, z }, BlockType.Solid)
      }
    }
  }

  // 2. Carve a cave (enclosed air pocket below surface)
  const caveX = Math.floor(size * 0.3)
  const caveZ = Math.floor(size * 0.3)
  const caveY = baseHeight - 4
  const caveRadius = 3

  for (let dx = -caveRadius; dx <= caveRadius; dx++) {
    for (let dy = -caveRadius; dy <= caveRadius; dy++) {
      for (let dz = -caveRadius; dz <= caveRadius; dz++) {
        if (dx * dx + dy * dy + dz * dz <= caveRadius * caveRadius) {
          const px = caveX + dx
          const py = caveY + dy
          const pz = caveZ + dz
          if (px >= 0 && px < size && py >= 0 && py < size && pz >= 0 && pz < size) {
            grid.setBlock({ x: px, y: py, z: pz }, BlockType.Air)
          }
        }
      }
    }
  }

  // 3. Build a stairwell (multi-floor structure with ladders and stairs)
  const swX = Math.floor(size * 0.7)
  const swZ = Math.floor(size * 0.7)
  const swWidth = 4
  const numFloors = 3
  const floorHeight = 4 // 3 air + 1 solid floor

  for (let floor = 0; floor < numFloors; floor++) {
    const floorY = baseHeight + floor * floorHeight

    // Solid floor
    for (let dx = 0; dx < swWidth; dx++) {
      for (let dz = 0; dz < swWidth; dz++) {
        const px = swX + dx
        const pz = swZ + dz
        if (px < size && pz < size && floorY < size) {
          grid.setBlock({ x: px, y: floorY, z: pz }, BlockType.Solid)
        }
      }
    }

    // Clear air above floor
    for (let dy = 1; dy < floorHeight; dy++) {
      for (let dx = 0; dx < swWidth; dx++) {
        for (let dz = 0; dz < swWidth; dz++) {
          const px = swX + dx
          const pz = swZ + dz
          const py = floorY + dy
          if (px < size && pz < size && py < size) {
            grid.setBlock({ x: px, y: py, z: pz }, BlockType.Air)
          }
        }
      }
    }

    // Ladder shaft on one corner
    for (let dy = 1; dy < floorHeight; dy++) {
      const py = floorY + dy
      if (py < size) {
        grid.setBlock({ x: swX, y: py, z: swZ }, BlockType.Ladder)
      }
    }

    // Stairs on opposite side
    if (floor < numFloors - 1) {
      const stairY = floorY + 1
      if (swX + swWidth - 1 < size && stairY < size) {
        grid.setBlock(
          { x: swX + swWidth - 1, y: stairY, z: swZ + swWidth - 1 },
          BlockType.Stair,
        )
      }
    }
  }

  grid.clearDirtyFlags()
}
