import type { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType, isSolid } from '../world/block-types.ts'
import type { SeededRNG } from '../../shared/seed.ts'

export interface NavigabilityResult {
  successRate: number          // fraction of sampled pairs with valid path
  avgPathRatio: number         // avg path_length / straight_line_distance
  isolatedRegionCount: number  // flood-fill surface connectivity regions
  navigabilityScore: number    // weighted combination (0-1)
  reachabilityMap: Uint8Array  // per-column distance from center (0=unreachable)
}

/**
 * Simplified A* on the worldgen grid surface.
 * Movement: walk on solid, step up 1 block, drop any distance.
 */
function findPath(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  sx: number, sz: number,
  ex: number, ez: number,
  maxSteps: number = 3000,
): number | null {
  const { worldWidth, worldDepth } = grid
  const key = (x: number, z: number) => x * worldDepth + z

  const startY = Math.floor(heightMap[key(sx, sz)])
  const endY = Math.floor(heightMap[key(ex, ez)])

  // Simple BFS with step constraint
  const visited = new Set<number>()
  const queue: { x: number; z: number; y: number; dist: number }[] = [
    { x: sx, z: sz, y: startY, dist: 0 },
  ]
  visited.add(key(sx, sz))

  let steps = 0
  while (queue.length > 0 && steps < maxSteps) {
    const curr = queue.shift()!
    steps++

    if (curr.x === ex && curr.z === ez) return curr.dist

    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = curr.x + dx, nz = curr.z + dz
      if (nx < 0 || nx >= worldWidth || nz < 0 || nz >= worldDepth) continue
      const k = key(nx, nz)
      if (visited.has(k)) continue

      const neighborSurf = Math.floor(heightMap[k])
      const dy = neighborSurf - curr.y

      // Can walk flat or step up 1, or drop down any
      if (dy > 1) continue // Too high to climb
      if (neighborSurf <= 0) continue

      visited.add(k)
      queue.push({ x: nx, z: nz, y: neighborSurf, dist: curr.dist + 1 })
    }
  }

  return null // No path found
}

/**
 * Analyze navigability by sampling random surface pairs
 * and measuring path success and efficiency.
 */
export function analyzeNavigability(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  seaLevel: number,
  sampleCount: number = 30,
): NavigabilityResult {
  const { worldWidth, worldDepth } = grid

  // Collect valid surface positions (above sea level)
  const validPositions: { x: number; z: number }[] = []
  for (let x = 2; x < worldWidth - 2; x += 4) {
    for (let z = 2; z < worldDepth - 2; z += 4) {
      const h = heightMap[x * worldDepth + z]
      if (h > seaLevel) {
        validPositions.push({ x, z })
      }
    }
  }

  if (validPositions.length < 2) {
    return {
      successRate: 0, avgPathRatio: 0, isolatedRegionCount: 1,
      navigabilityScore: 0, reachabilityMap: new Uint8Array(worldWidth * worldDepth),
    }
  }

  // Sample pairs and test paths
  let successes = 0
  let totalRatio = 0

  for (let i = 0; i < sampleCount; i++) {
    const a = validPositions[rng.nextInt(0, validPositions.length - 1)]
    const b = validPositions[rng.nextInt(0, validPositions.length - 1)]
    if (a.x === b.x && a.z === b.z) continue

    const straightDist = Math.abs(a.x - b.x) + Math.abs(a.z - b.z)
    const pathLen = findPath(grid, heightMap, a.x, a.z, b.x, b.z)

    if (pathLen !== null) {
      successes++
      totalRatio += pathLen / straightDist
    }
  }

  const successRate = sampleCount > 0 ? successes / sampleCount : 0
  const avgPathRatio = successes > 0 ? totalRatio / successes : 0

  // Flood-fill from center to build reachability map
  const reachabilityMap = new Uint8Array(worldWidth * worldDepth)
  const centerX = Math.floor(worldWidth / 2)
  const centerZ = Math.floor(worldDepth / 2)
  const centerH = heightMap[centerX * worldDepth + centerZ]

  if (centerH > seaLevel) {
    const visited = new Set<number>()
    const queue: { x: number; z: number; y: number; dist: number }[] = [
      { x: centerX, z: centerZ, y: Math.floor(centerH), dist: 1 },
    ]
    const key = (x: number, z: number) => x * worldDepth + z
    visited.add(key(centerX, centerZ))
    reachabilityMap[key(centerX, centerZ)] = 1

    while (queue.length > 0) {
      const curr = queue.shift()!
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = curr.x + dx, nz = curr.z + dz
        if (nx < 0 || nx >= worldWidth || nz < 0 || nz >= worldDepth) continue
        const k = key(nx, nz)
        if (visited.has(k)) continue

        const nh = Math.floor(heightMap[k])
        if (nh <= seaLevel) continue
        if (nh - curr.y > 1) continue

        visited.add(k)
        const dist = Math.min(255, curr.dist + 1)
        reachabilityMap[k] = dist
        queue.push({ x: nx, z: nz, y: nh, dist })
      }
    }
  }

  // Count isolated regions
  const surfaceVisited = new Uint8Array(worldWidth * worldDepth)
  let isolatedRegionCount = 0
  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const idx = x * worldDepth + z
      if (surfaceVisited[idx]) continue
      if (heightMap[idx] <= seaLevel) continue
      surfaceVisited[idx] = 1
      isolatedRegionCount++

      const stack = [idx]
      while (stack.length > 0) {
        const ci = stack.pop()!
        const cx = Math.floor(ci / worldDepth)
        const cz = ci % worldDepth
        const ch = Math.floor(heightMap[ci])
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, nz = cz + dz
          if (nx < 0 || nx >= worldWidth || nz < 0 || nz >= worldDepth) continue
          const ni = nx * worldDepth + nz
          if (surfaceVisited[ni]) continue
          const nh = Math.floor(heightMap[ni])
          if (nh <= seaLevel) continue
          if (Math.abs(nh - ch) > 1) continue
          surfaceVisited[ni] = 1
          stack.push(ni)
        }
      }
    }
  }

  // Navigability score: weighted combination
  const navigabilityScore = Math.min(1, successRate * 0.5 + (1 / Math.max(1, isolatedRegionCount)) * 0.3 + Math.max(0, 1 - avgPathRatio / 3) * 0.2)

  return { successRate, avgPathRatio, isolatedRegionCount, navigabilityScore, reachabilityMap }
}
