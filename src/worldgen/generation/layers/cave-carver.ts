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
  const { worldWidth, worldHeight: _worldHeight, worldDepth } = grid
  let carved = 0

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const surfaceY = Math.floor(heightMap[x * worldDepth + z])
      for (let y = 2; y < surfaceY - 2; y++) {
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
  threshold: number = 0.06,
  frequency: number = 0.05,
): number {
  const noiseA = createNoise3D(rng)
  const noiseB = createNoise3D(rng.fork())
  const { worldWidth, worldHeight: _worldHeight, worldDepth } = grid
  let carved = 0

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const surfaceY = Math.floor(heightMap[x * worldDepth + z])
      for (let y = 2; y < surfaceY - 2; y++) {
        const block = grid.getBlock({ x, y, z })
        if (block === WorldgenBlockType.Bedrock || block === WorldgenBlockType.Air) continue

        const a = fractalNoise3D(noiseA, x * frequency, y * frequency, z * frequency, 2, 0.5, 2.0)
        const b = fractalNoise3D(noiseB, x * frequency, y * frequency, z * frequency, 2, 0.5, 2.0)

        // Thin tunnels where both values are near zero
        // depthFactor: 0 near surface, 1 deep underground — suppress caves near surface
        const depthFactor = Math.min(1, (surfaceY - y) / 8)
        if (Math.abs(a) + Math.abs(b) < threshold * depthFactor) {
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
 * Random-walk agents carving tunnels with controlled radius.
 * Starts mid-depth, avoids bedrock zone, limits branching.
 */
export function carveAgentWorms(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  wormCount: number = 10,
  maxSteps: number = 150,
  radius: number = 2,
  branchChance: number = 0.04,
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
    // Start in the middle third of the terrain, not near bedrock
    const minY = Math.max(5, Math.floor(surfaceY * 0.25))
    const maxY = Math.max(minY + 2, Math.floor(surfaceY * 0.75))
    const wy = rng.nextInt(minY, maxY)

    const angle = rng.nextFloat(0, Math.PI * 2)
    const pitch = rng.nextFloat(-0.2, 0.2)
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

    const cx = Math.round(worm.x)
    const cy = Math.round(worm.y)
    const cz = Math.round(worm.z)

    // Carve a sphere — fixed radius (no random inflation)
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dy * dy + dz * dz > radius * radius) continue
          const bx = cx + dx, by = cy + dy, bz = cz + dz
          if (by <= 1) continue // Protect bedrock + 1 buffer
          if (!grid.isInBounds({ x: bx, y: by, z: bz })) continue
          const surfY = heightMap[Math.max(0, Math.min(worldWidth - 1, bx)) * worldDepth + Math.max(0, Math.min(worldDepth - 1, bz))]
          if (by >= surfY - 1) continue
          const block = grid.getBlock({ x: bx, y: by, z: bz })
          if (block !== WorldgenBlockType.Air && block !== WorldgenBlockType.Bedrock && block !== WorldgenBlockType.Water) {
            grid.setBlock({ x: bx, y: by, z: bz }, WorldgenBlockType.Air)
            carved++
          }
        }
      }
    }

    // Move worm — gentler randomization, no downward bias
    worm.dx += rng.nextFloat(-0.25, 0.25)
    worm.dy += rng.nextFloat(-0.15, 0.15)
    worm.dz += rng.nextFloat(-0.25, 0.25)
    const len = Math.sqrt(worm.dx * worm.dx + worm.dy * worm.dy + worm.dz * worm.dz)
    if (len > 0) {
      worm.dx /= len; worm.dy /= len; worm.dz /= len
    }
    // Gentle bias toward mid-height (prevents piling at bottom or top)
    const midY = worldHeight * 0.35
    if (worm.y < midY - 5) worm.dy += 0.02
    else if (worm.y > midY + 10) worm.dy -= 0.02

    worm.x += worm.dx * 2.0
    worm.y += worm.dy * 1.5
    worm.z += worm.dz * 2.0
    worm.steps++

    // Clamp — keep away from edges and bedrock
    worm.x = Math.max(3, Math.min(worldWidth - 4, worm.x))
    worm.y = Math.max(4, Math.min(worldHeight - 4, worm.y))
    worm.z = Math.max(3, Math.min(worldDepth - 4, worm.z))

    // Branching — reduced max branches
    if (rng.next() < branchChance && worms.length < 25) {
      const angle = rng.nextFloat(0, Math.PI * 2)
      worms.push({
        x: worm.x, y: worm.y, z: worm.z,
        dx: Math.cos(angle), dy: rng.nextFloat(-0.15, 0.15), dz: Math.sin(angle),
        steps: worm.steps,
      })
    }
  }

  return carved
}

/**
 * Method A+B combined: Cheese + Spaghetti (Minecraft-style).
 */
export function carveCheeseAndSpaghetti(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
): number {
  let carved = 0
  carved += carveNoiseThreshold(grid, heightMap, rng, 0.55, 0.04, 2)
  carved += carveSpaghetti(grid, heightMap, rng.fork(), 0.06, 0.06)
  return carved
}
