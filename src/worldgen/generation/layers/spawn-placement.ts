import type { SeededRNG } from '../../../shared/seed.ts'
import type { WorldgenGrid } from '../../world/worldgen-grid.ts'
import type { VoxelCoord } from '../../../shared/types.ts'

export interface SpawnPoint {
  position: VoxelCoord
  type: 'rift' | 'resource'
  biome: number
  difficulty: number
}

/**
 * Places spawn points using Poisson-disc-like sampling.
 * Rifts are placed on the surface with minimum distance 30.
 * Resource nodes near caves and trees.
 */
export function placeSpawnPoints(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  biomeMap: Uint8Array,
  rng: SeededRNG,
  seaLevel: number,
): SpawnPoint[] {
  const { worldWidth, worldDepth } = grid
  const spawns: SpawnPoint[] = []
  const centerX = worldWidth / 2
  const centerZ = worldDepth / 2
  const maxDist = Math.sqrt(centerX * centerX + centerZ * centerZ)

  // Place rifts with Poisson-disc sampling (min distance 30)
  const riftMinDist = 30
  const riftAttempts = 100

  for (let attempt = 0; attempt < riftAttempts; attempt++) {
    const x = rng.nextInt(5, worldWidth - 6)
    const z = rng.nextInt(5, worldDepth - 6)
    const surfY = Math.floor(heightMap[x * worldDepth + z])

    // Skip underwater
    if (surfY <= seaLevel) continue

    // Check minimum distance from existing rifts
    let tooClose = false
    for (const s of spawns) {
      if (s.type !== 'rift') continue
      const dx = s.position.x - x
      const dz = s.position.z - z
      if (dx * dx + dz * dz < riftMinDist * riftMinDist) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    // Prefer flat areas (check slope)
    let maxSlope = 0
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, nz = z + dz
      if (nx >= 0 && nx < worldWidth && nz >= 0 && nz < worldDepth) {
        maxSlope = Math.max(maxSlope, Math.abs(surfY - heightMap[nx * worldDepth + nz]))
      }
    }
    if (maxSlope > 3) continue

    // Difficulty gradient based on distance from center
    const distFromCenter = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2)
    const difficulty = Math.min(1, distFromCenter / maxDist)

    spawns.push({
      position: { x, y: surfY + 1, z },
      type: 'rift',
      biome: biomeMap[x * worldDepth + z],
      difficulty,
    })
  }

  // Place resource nodes (near surface, more numerous)
  const resourceMinDist = 15
  const resourceAttempts = 150

  for (let attempt = 0; attempt < resourceAttempts; attempt++) {
    const x = rng.nextInt(3, worldWidth - 4)
    const z = rng.nextInt(3, worldDepth - 4)
    const surfY = Math.floor(heightMap[x * worldDepth + z])

    if (surfY <= seaLevel) continue

    // Check minimum distance from existing resources
    let tooClose = false
    for (const s of spawns) {
      if (s.type !== 'resource') continue
      const dx = s.position.x - x
      const dz = s.position.z - z
      if (dx * dx + dz * dz < resourceMinDist * resourceMinDist) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    const distFromCenter = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2)
    const difficulty = Math.min(1, distFromCenter / maxDist) * 0.5

    spawns.push({
      position: { x, y: surfY + 1, z },
      type: 'resource',
      biome: biomeMap[x * worldDepth + z],
      difficulty,
    })
  }

  return spawns
}
