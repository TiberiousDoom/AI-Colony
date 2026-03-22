import type { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'

export interface TerrainMetrics {
  heightDistribution: number[]   // 16 buckets
  slopeDistribution: number[]    // 10 buckets (0-1, 1-2, ... 9+)
  surfaceRoughness: number       // std dev of height
  waterCoverage: number          // 0-1 fraction
  blockCounts: Record<number, number>
}

export function analyzeTerrainMetrics(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  seaLevel: number,
): TerrainMetrics {
  const { worldWidth, worldDepth, worldHeight } = grid
  const total = worldWidth * worldDepth

  // Height distribution (16 buckets)
  const heightDist = new Array(16).fill(0)
  const bucketSize = Math.ceil(worldHeight / 16)
  let heightSum = 0, heightSumSq = 0

  for (let i = 0; i < heightMap.length; i++) {
    const h = heightMap[i]
    const bucket = Math.min(15, Math.floor(h / bucketSize))
    heightDist[bucket]++
    heightSum += h
    heightSumSq += h * h
  }

  const avgHeight = heightSum / total
  const surfaceRoughness = Math.sqrt(heightSumSq / total - avgHeight * avgHeight)

  // Slope distribution (10 buckets)
  const slopeDist = new Array(10).fill(0)
  for (let x = 1; x < worldWidth - 1; x++) {
    for (let z = 1; z < worldDepth - 1; z++) {
      const h = heightMap[x * worldDepth + z]
      let maxSlope = 0
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nh = heightMap[(x + dx) * worldDepth + (z + dz)]
        maxSlope = Math.max(maxSlope, Math.abs(h - nh))
      }
      const bucket = Math.min(9, Math.floor(maxSlope))
      slopeDist[bucket]++
    }
  }

  // Water coverage
  let waterCount = 0
  for (let i = 0; i < heightMap.length; i++) {
    if (heightMap[i] <= seaLevel) waterCount++
  }
  const waterCoverage = waterCount / total

  // Block counts (sampled)
  const blockCounts: Record<number, number> = {}
  for (let x = 0; x < worldWidth; x += 2) {
    for (let y = 0; y < worldHeight; y += 2) {
      for (let z = 0; z < worldDepth; z += 2) {
        const type = grid.getBlock({ x, y, z })
        blockCounts[type] = (blockCounts[type] ?? 0) + 8
      }
    }
  }

  return { heightDistribution: heightDist, slopeDistribution: slopeDist, surfaceRoughness, waterCoverage, blockCounts }
}
