import type { SeededRNG } from '../../../shared/seed.ts'
import { createNoise3D, fractalNoise3D } from '../../../shared/noise.ts'
import type { WorldgenGrid } from '../../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../../world/block-types.ts'

export type CaveMethod = 'noise-threshold' | 'spaghetti' | 'agent-worms' | 'cheese-spaghetti'

/**
 * Method A: 3D noise threshold caves.
 * Produces blobby caverns where noise exceeds a threshold.
 */
export function carveNoiseThreshold(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  threshold: number = 0.45,
  frequency: number = 0.06,
  octaves: number = 2,
): number {
  const noise3D = createNoise3D(rng)
  const { worldWidth, worldHeight, worldDepth } = grid
  let carved = 0

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const surfaceY = Math.floor(heightMap[x * worldDepth + z])
      for (let y = 1; y < surfaceY - 2; y++) {
        const block = grid.getBlock({ x, y, z })
        if (block === WorldgenBlockType.Bedrock || block === WorldgenBlockType.Air) continue

        const val = fractalNoise3D(noise3D, x * frequency, y * frequency, z * frequency, octaves, 0.5, 2.0)
        // Increase threshold near surface to prevent surface holes
        const depthFactor = Math.min(1, (surfaceY - y) / 8)
        if (val > threshold * (2 - depthFactor)) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Air)
          carved++
        }
      }
    }
  }
  return carved
}

/**
 * Method B: Spaghetti caves.
 * Two intersecting 3D noise fields create thin winding tunnels.
 */
export function carveSpaghetti(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  threshold: number = 0.03,
  frequency: number = 0.05,
): number {
  const noiseA = createNoise3D(rng)
  const noiseB = createNoise3D(rng.fork())
  const { worldWidth, worldHeight, worldDepth } = grid
  let carved = 0

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const surfaceY = Math.floor(heightMap[x * worldDepth + z])
      for (let y = 1; y < surfaceY - 2; y++) {
        const block = grid.getBlock({ x, y, z })
        if (block === WorldgenBlockType.Bedrock || block === WorldgenBlockType.Air) continue

        const a = fractalNoise3D(noiseA, x * frequency, y * frequency, z * frequency, 2, 0.5, 2.0)
        const b = fractalNoise3D(noiseB, x * frequency, y * frequency, z * frequency, 2, 0.5, 2.0)

        // Thin tunnels where both values are near zero
        const depthFactor = Math.min(1, (surfaceY - y) / 6)
        if (Math.abs(a) + Math.abs(b) < threshold * (2 - depthFactor * 0.5)) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Air)
          carved++
        }
      }
    }
  }
  return carved
}

/**
 * Method C: Agent worm caves.
 * Random-walk agents starting at random underground points,
 * carving spheres along their path with branching probability.
 */
export function carveAgentWorms(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  wormCount: number = 15,
  maxSteps: number = 200,
  radius: number = 2,
  branchChance: number = 0.05,
): number {
  const { worldWidth, worldHeight, worldDepth } = grid
  let carved = 0

  interface Worm {
    x: number; y: number; z: number
    dx: number; dy: number; dz: number
    steps: number
  }

  const worms: Worm[] = []
  for (let i = 0; i < wormCount; i++) {
    const wx = rng.nextInt(10, worldWidth - 10)
    const wz = rng.nextInt(10, worldDepth - 10)
    const surfaceY = Math.floor(heightMap[wx * worldDepth + wz])
    const wy = rng.nextInt(3, Math.max(4, surfaceY - 5))

    // Random initial direction
    const angle = rng.nextFloat(0, Math.PI * 2)
    const pitch = rng.nextFloat(-0.3, 0.3)
    worms.push({
      x: wx, y: wy, z: wz,
      dx: Math.cos(angle) * Math.cos(pitch),
      dy: Math.sin(pitch),
      dz: Math.sin(angle) * Math.cos(pitch),
      steps: 0,
    })
  }

  while (worms.length > 0) {
    const worm = worms[worms.length - 1]
    if (worm.steps >= maxSteps) {
      worms.pop()
      continue
    }

    // Carve a sphere at current position
    const cx = Math.round(worm.x)
    const cy = Math.round(worm.y)
    const cz = Math.round(worm.z)
    const r = Math.max(1, radius + (rng.next() < 0.3 ? 1 : 0))

    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dy * dy + dz * dz > r * r) continue
          const bx = cx + dx, by = cy + dy, bz = cz + dz
          if (!grid.isInBounds({ x: bx, y: by, z: bz })) continue
          if (by <= 0) continue // Don't carve bedrock layer
          const surfY = Math.floor(heightMap[Math.min(worldWidth - 1, Math.max(0, bx)) * worldDepth + Math.min(worldDepth - 1, Math.max(0, bz))])
          if (by >= surfY - 1) continue // Don't carve near surface
          const block = grid.getBlock({ x: bx, y: by, z: bz })
          if (block !== WorldgenBlockType.Air && block !== WorldgenBlockType.Bedrock) {
            grid.setBlock({ x: bx, y: by, z: bz }, WorldgenBlockType.Air)
            carved++
          }
        }
      }
    }

    // Move worm with slight direction randomization
    worm.dx += rng.nextFloat(-0.3, 0.3)
    worm.dy += rng.nextFloat(-0.2, 0.2)
    worm.dz += rng.nextFloat(-0.3, 0.3)
    // Normalize direction
    const len = Math.sqrt(worm.dx * worm.dx + worm.dy * worm.dy + worm.dz * worm.dz)
    if (len > 0) {
      worm.dx /= len; worm.dy /= len; worm.dz /= len
    }
    // Bias slightly downward
    worm.dy -= 0.05

    worm.x += worm.dx * 1.5
    worm.y += worm.dy * 1.5
    worm.z += worm.dz * 1.5
    worm.steps++

    // Clamp to bounds
    worm.x = Math.max(1, Math.min(worldWidth - 2, worm.x))
    worm.y = Math.max(2, Math.min(worldHeight - 2, worm.y))
    worm.z = Math.max(1, Math.min(worldDepth - 2, worm.z))

    // Branching
    if (rng.next() < branchChance && worms.length < 50) {
      const angle = rng.nextFloat(0, Math.PI * 2)
      worms.push({
        x: worm.x, y: worm.y, z: worm.z,
        dx: Math.cos(angle), dy: rng.nextFloat(-0.2, 0.2), dz: Math.sin(angle),
        steps: worm.steps,
      })
    }
  }

  return carved
}

/**
 * Method A+B combined: Cheese + Spaghetti (Minecraft-style).
 * Large blobby chambers (cheese) intersected with thin tunnels (spaghetti).
 */
export function carveCheeseAndSpaghetti(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
): number {
  let carved = 0
  carved += carveNoiseThreshold(grid, heightMap, rng, 0.55, 0.04, 2)
  carved += carveSpaghetti(grid, heightMap, rng.fork(), 0.04, 0.06)
  return carved
}
