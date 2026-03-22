import type { SeededRNG } from '../../../shared/seed.ts'
import type { WorldgenGrid } from '../../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../../world/block-types.ts'
import { BiomeType } from '../generator-interface.ts'

/**
 * Places trees, cacti, flowers and other surface decorations.
 * Respects biome rules and minimum spacing.
 */
export function decorateSurface(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  biomeMap: Uint8Array,
  rng: SeededRNG,
  seaLevel: number,
): number {
  const { worldWidth, worldDepth, worldHeight } = grid
  let placed = 0

  // Track placed decorations for minimum spacing
  const occupied = new Set<string>()

  function isSpaceFree(x: number, z: number, minDist: number): boolean {
    for (let dx = -minDist; dx <= minDist; dx++) {
      for (let dz = -minDist; dz <= minDist; dz++) {
        if (occupied.has(`${x + dx},${z + dz}`)) return false
      }
    }
    return true
  }

  for (let x = 2; x < worldWidth - 2; x++) {
    for (let z = 2; z < worldDepth - 2; z++) {
      const idx = x * worldDepth + z
      const surfY = Math.floor(heightMap[idx])
      const biome = biomeMap[idx] as BiomeType

      // Skip underwater or at world edge
      if (surfY <= seaLevel) continue
      if (surfY >= worldHeight - 8) continue

      // Check surface is solid
      const surfBlock = grid.getBlock({ x, y: surfY, z })
      if (surfBlock === WorldgenBlockType.Air || surfBlock === WorldgenBlockType.Water) continue

      switch (biome) {
        case BiomeType.Forest: {
          // Trees: ~8% chance, min spacing 3
          if (rng.next() < 0.08 && isSpaceFree(x, z, 3)) {
            placeTree(grid, x, surfY, z, rng, worldHeight)
            occupied.add(`${x},${z}`)
            placed++
          }
          break
        }
        case BiomeType.Plains: {
          // Occasional trees (~2%), flowers (~3%)
          if (rng.next() < 0.02 && isSpaceFree(x, z, 4)) {
            placeTree(grid, x, surfY, z, rng, worldHeight)
            occupied.add(`${x},${z}`)
            placed++
          } else if (rng.next() < 0.03) {
            if (surfY + 1 < worldHeight) {
              grid.setBlock({ x, y: surfY + 1, z }, WorldgenBlockType.Flower)
              placed++
            }
          }
          break
        }
        case BiomeType.Desert: {
          // Cacti: ~1.5%, min spacing 4
          if (rng.next() < 0.015 && isSpaceFree(x, z, 4)) {
            placeCactus(grid, x, surfY, z, rng, worldHeight)
            occupied.add(`${x},${z}`)
            placed++
          }
          break
        }
        case BiomeType.Badlands: {
          // Dead bushes: ~2%
          if (rng.next() < 0.02) {
            if (surfY + 1 < worldHeight) {
              grid.setBlock({ x, y: surfY + 1, z }, WorldgenBlockType.DeadBush)
              placed++
            }
          }
          break
        }
        case BiomeType.Swamp: {
          // Sparse trees: ~4%, flowers: ~2%
          if (rng.next() < 0.04 && isSpaceFree(x, z, 3)) {
            placeTree(grid, x, surfY, z, rng, worldHeight)
            occupied.add(`${x},${z}`)
            placed++
          } else if (rng.next() < 0.02) {
            if (surfY + 1 < worldHeight) {
              grid.setBlock({ x, y: surfY + 1, z }, WorldgenBlockType.Flower)
              placed++
            }
          }
          break
        }
        // Tundra and Mountains: no trees or vegetation
      }
    }
  }

  return placed
}

function placeTree(grid: WorldgenGrid, x: number, surfY: number, z: number, rng: SeededRNG, worldHeight: number): void {
  const trunkHeight = rng.nextInt(4, 6)
  const leafRadius = 2

  // Trunk
  for (let y = surfY + 1; y <= surfY + trunkHeight && y < worldHeight; y++) {
    grid.setBlock({ x, y, z }, WorldgenBlockType.Wood)
  }

  // Leaf canopy (sphere-ish)
  const leafBaseY = surfY + trunkHeight - 1
  for (let dy = 0; dy <= leafRadius + 1; dy++) {
    const r = dy === 0 ? leafRadius : dy <= leafRadius ? leafRadius - Math.floor(dy / 2) : 0
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r + 1) continue
        const ly = leafBaseY + dy
        if (ly >= worldHeight) continue
        const lx = x + dx, lz = z + dz
        if (!grid.isInBounds({ x: lx, y: ly, z: lz })) continue
        if (grid.getBlock({ x: lx, y: ly, z: lz }) === WorldgenBlockType.Air) {
          grid.setBlock({ x: lx, y: ly, z: lz }, WorldgenBlockType.Leaves)
        }
      }
    }
  }
}

function placeCactus(grid: WorldgenGrid, x: number, surfY: number, z: number, rng: SeededRNG, worldHeight: number): void {
  const height = rng.nextInt(2, 4)
  for (let y = surfY + 1; y <= surfY + height && y < worldHeight; y++) {
    grid.setBlock({ x, y, z }, WorldgenBlockType.Cactus)
  }
}
