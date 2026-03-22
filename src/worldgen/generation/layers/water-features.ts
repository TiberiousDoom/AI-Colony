import type { SeededRNG } from '../../../shared/seed.ts'
import { createNoise2D, fractalNoise } from '../../../shared/noise.ts'
import type { WorldgenGrid } from '../../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../../world/block-types.ts'
import { BiomeType } from '../generator-interface.ts'

export interface WaterFeatureParams {
  riverCount: number
  riverWidth: number
  lakesEnabled: number      // 0 or 1
  caveFloodMaxY: number     // max Y level to flood caves (-1 to disable)
}

export const DEFAULT_WATER_PARAMS: WaterFeatureParams = {
  riverCount: 4,
  riverWidth: 2,
  lakesEnabled: 1,
  caveFloodMaxY: 12,
}

export interface WaterFeatureResult {
  riversPlaced: number
  totalRiverLength: number
  lakesPlaced: number
  lakeVolume: number
  caveFloodVolume: number
}

/**
 * Generate all water features: rivers, lakes, and flooded caves.
 * Runs after cave carving and before ore placement.
 */
export function generateWaterFeatures(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  biomeMap: Uint8Array,
  rng: SeededRNG,
  seaLevel: number,
  params: Partial<WaterFeatureParams> = {},
): WaterFeatureResult {
  const p = { ...DEFAULT_WATER_PARAMS, ...params }
  const result: WaterFeatureResult = {
    riversPlaced: 0, totalRiverLength: 0,
    lakesPlaced: 0, lakeVolume: 0,
    caveFloodVolume: 0,
  }

  // Rivers first — they modify heightMap
  const riverResult = carveRivers(grid, heightMap, biomeMap, rng.fork(), seaLevel, p.riverCount, p.riverWidth)
  result.riversPlaced = riverResult.count
  result.totalRiverLength = riverResult.totalLength

  // Lakes — fill depressions
  if (p.lakesEnabled) {
    const lakeResult = fillLakes(grid, heightMap, biomeMap, rng.fork(), seaLevel)
    result.lakesPlaced = lakeResult.count
    result.lakeVolume = lakeResult.volume
  }

  // Underground flooded caves
  if (p.caveFloodMaxY > 0) {
    result.caveFloodVolume = floodUndergroundCaves(grid, heightMap, seaLevel, p.caveFloodMaxY)
  }

  // Freeze water surfaces in Tundra biomes (biome assignment runs before water,
  // so rivers/lakes carved afterward need a post-pass to freeze)
  freezeTundraWater(grid, heightMap, biomeMap, seaLevel)

  return result
}

// ── Rivers ──────────────────────────────────────────────────────────────────

interface RiverResult { count: number; totalLength: number }

/**
 * Carve rivers from high elevation to sea level using gradient descent.
 * Rivers follow the steepest downhill path with slight lateral meander.
 */
function carveRivers(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  _biomeMap: Uint8Array,
  rng: SeededRNG,
  seaLevel: number,
  riverCount: number,
  riverWidth: number,
): RiverResult {
  const { worldWidth, worldDepth } = grid
  const key = (x: number, z: number) => x * worldDepth + z
  let totalLength = 0
  let count = 0

  // Collect high-elevation source candidates
  const sources: { x: number; z: number; h: number }[] = []
  for (let x = 5; x < worldWidth - 5; x += 3) {
    for (let z = 5; z < worldDepth - 5; z += 3) {
      const h = heightMap[key(x, z)]
      if (h > seaLevel + 8) {
        sources.push({ x, z, h })
      }
    }
  }
  if (sources.length === 0) return { count: 0, totalLength: 0 }

  // Sort by height descending and pick spread-out sources
  sources.sort((a, b) => b.h - a.h)

  const usedRiverCells = new Set<number>()
  const meander = createNoise2D(rng)

  for (let r = 0; r < riverCount && sources.length > 0; r++) {
    // Pick from top 20% of sources
    const pickIdx = rng.nextInt(0, Math.min(Math.floor(sources.length * 0.2), sources.length - 1))
    const source = sources.splice(pickIdx, 1)[0]

    let cx = source.x, cz = source.z
    let length = 0
    const maxSteps = 300
    const visited = new Set<number>()

    for (let step = 0; step < maxSteps; step++) {
      const currentH = heightMap[key(cx, cz)]
      if (currentH <= seaLevel) break // Reached sea level

      // Carve river channel at current position
      carveRiverSegment(grid, heightMap, cx, cz, riverWidth, seaLevel, usedRiverCells)
      visited.add(key(cx, cz))
      length++

      // Find steepest downhill neighbor (8-connected)
      let bestX = cx, bestZ = cz, bestH = currentH
      const meanderVal = fractalNoise(meander, cx * 0.05, cz * 0.05, 2, 0.5, 2.0)

      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = cx + dx, nz = cz + dz
        if (nx < 2 || nx >= worldWidth - 2 || nz < 2 || nz >= worldDepth - 2) continue
        if (visited.has(key(nx, nz))) continue

        const nh = heightMap[key(nx, nz)]
        // Add meander bias — slight lateral drift
        const meanderBias = meanderVal * 0.5
        const effectiveH = nh - meanderBias * (Math.abs(dx) + Math.abs(dz) === 2 ? 0.5 : 0)

        if (effectiveH < bestH) {
          bestH = effectiveH
          bestX = nx
          bestZ = nz
        }
      }

      // Stuck in a depression — carve down and try to escape
      if (bestX === cx && bestZ === cz) {
        // Lower the current cell slightly and pick a random downhill-ish direction
        heightMap[key(cx, cz)] = Math.max(seaLevel, currentH - 1)
        const dirs = [[1,0],[-1,0],[0,1],[0,-1]]
        const dir = dirs[rng.nextInt(0, dirs.length - 1)]
        const nx = cx + dir[0], nz = cz + dir[1]
        if (nx >= 2 && nx < worldWidth - 2 && nz >= 2 && nz < worldDepth - 2 && !visited.has(key(nx, nz))) {
          cx = nx; cz = nz
        } else {
          break
        }
        continue
      }

      cx = bestX
      cz = bestZ
    }

    if (length > 5) {
      count++
      totalLength += length
    }
  }

  return { count, totalLength }
}

/**
 * Carve a river cross-section at (cx, cz) with given width.
 * Digs 2-3 blocks below surface and fills with water.
 */
function carveRiverSegment(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  cx: number, cz: number,
  width: number,
  seaLevel: number,
  usedCells: Set<number>,
): void {
  const { worldWidth, worldDepth } = grid
  const key = (x: number, z: number) => x * worldDepth + z

  for (let dx = -width; dx <= width; dx++) {
    for (let dz = -width; dz <= width; dz++) {
      // Circular cross-section
      if (dx * dx + dz * dz > width * width) continue
      const x = cx + dx, z = cz + dz
      if (x < 0 || x >= worldWidth || z < 0 || z >= worldDepth) continue

      const idx = key(x, z)
      if (usedCells.has(idx)) continue
      usedCells.add(idx)

      const surfH = Math.floor(heightMap[idx])
      if (surfH <= seaLevel) continue // Already underwater

      // Carve channel: 2 blocks deep
      const bedY = Math.max(seaLevel, surfH - 2)
      const waterSurfY = bedY + 1

      // Remove blocks from bed to surface
      for (let y = bedY; y <= surfH; y++) {
        if (!grid.isInBounds({ x, y, z })) continue
        const block = grid.getBlock({ x, y, z })
        if (block === WorldgenBlockType.Bedrock) continue
        if (y <= waterSurfY) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Water)
        } else {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Air)
        }
      }

      // Update heightMap to reflect carved terrain (bed level)
      heightMap[idx] = bedY
    }
  }
}

// ── Lakes ───────────────────────────────────────────────────────────────────

interface LakeResult { count: number; volume: number }

/**
 * Find depressions in the heightmap and fill them with water.
 * A depression is a local minimum surrounded by higher terrain.
 */
function fillLakes(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  biomeMap: Uint8Array,
  _rng: SeededRNG,
  seaLevel: number,
): LakeResult {
  const { worldWidth, worldDepth } = grid
  const key = (x: number, z: number) => x * worldDepth + z
  let count = 0, volume = 0
  const filled = new Set<number>()

  // Scan for local minima (lower than all 4 neighbors)
  const minima: { x: number; z: number; h: number }[] = []
  for (let x = 3; x < worldWidth - 3; x += 2) {
    for (let z = 3; z < worldDepth - 3; z += 2) {
      const idx = key(x, z)
      const h = heightMap[idx]
      if (h <= seaLevel + 1) continue // Already at sea level
      // Skip desert biomes
      if (biomeMap[idx] === BiomeType.Desert) continue

      let isMin = true
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        if (heightMap[key(x + dx, z + dz)] <= h) {
          isMin = false
          break
        }
      }
      if (isMin) minima.push({ x, z, h })
    }
  }

  // Sort by height (fill lowest depressions first)
  minima.sort((a, b) => a.h - b.h)

  for (const min of minima) {
    if (filled.has(key(min.x, min.z))) continue
    if (count >= 8) break // Cap at 8 lakes

    // Find the spill elevation: lowest point on the rim
    // BFS outward from the minimum to find the basin
    const basin = new Map<number, number>() // key -> height
    const queue: { x: number; z: number }[] = [{ x: min.x, z: min.z }]
    basin.set(key(min.x, min.z), min.h)
    let spillElevation = Infinity

    while (queue.length > 0) {
      const curr = queue.shift()!
      const currH = heightMap[key(curr.x, curr.z)]

      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = curr.x + dx, nz = curr.z + dz
        if (nx < 1 || nx >= worldWidth - 1 || nz < 1 || nz >= worldDepth - 1) continue
        const nk = key(nx, nz)
        if (basin.has(nk)) continue

        const nh = heightMap[nk]
        if (nh <= currH + 1 && nh < spillElevation) {
          // Part of the basin
          basin.set(nk, nh)
          queue.push({ x: nx, z: nz })
        } else if (nh > currH) {
          // Potential rim — track the lowest rim point as spill
          spillElevation = Math.min(spillElevation, nh)
        }
      }

      if (basin.size > 200) break // Don't make huge lakes
    }

    if (spillElevation === Infinity || spillElevation <= min.h + 1) continue
    // Cap lake depth at 4 blocks
    const waterLevel = Math.min(min.h + 4, Math.floor(spillElevation) - 1)
    if (waterLevel <= min.h) continue

    let lakeVol = 0
    for (const [cellKey, cellH] of basin) {
      if (filled.has(cellKey)) continue
      const cellHFloor = Math.floor(cellH)
      if (cellHFloor >= waterLevel) continue

      // Fill with water from terrain surface up to water level
      for (let y = cellHFloor + 1; y <= waterLevel; y++) {
        const x = Math.floor(cellKey / worldDepth)
        const z = cellKey % worldDepth
        if (!grid.isInBounds({ x, y, z })) continue
        const block = grid.getBlock({ x, y, z })
        if (block === WorldgenBlockType.Air || block === WorldgenBlockType.Grass ||
            block === WorldgenBlockType.Flower || block === WorldgenBlockType.DeadBush) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Water)
          lakeVol++
        }
      }
      filled.add(cellKey)
    }

    if (lakeVol > 10) {
      count++
      volume += lakeVol
    }
  }

  return { count, volume }
}

// ── Underground Cave Flooding ───────────────────────────────────────────────

/**
 * Flood underground caves below a max Y level.
 * BFS from the lowest Air blocks upward, filling connected air pockets.
 */
function floodUndergroundCaves(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  _seaLevel: number,
  maxFloodY: number,
): number {
  const { worldWidth, worldHeight, worldDepth } = grid
  let volume = 0

  // Scan for air blocks at low depths and flood-fill connected pockets
  const visited = new Uint8Array(worldWidth * worldHeight * worldDepth)
  const vKey = (x: number, y: number, z: number) => (x * worldHeight + y) * worldDepth + z

  for (let x = 1; x < worldWidth - 1; x++) {
    for (let z = 1; z < worldDepth - 1; z++) {
      const surfH = Math.floor(heightMap[x * worldDepth + z])
      // Only flood below both maxFloodY and well below surface
      const floodCeiling = Math.min(maxFloodY, surfH - 4)

      for (let y = 2; y <= floodCeiling; y++) {
        const vk = vKey(x, y, z)
        if (visited[vk]) continue
        const block = grid.getBlock({ x, y, z })
        if (block !== WorldgenBlockType.Air) continue

        // BFS flood this connected air pocket
        const pocket: { x: number; y: number; z: number }[] = []
        const queue: { x: number; y: number; z: number }[] = [{ x, y, z }]
        visited[vk] = 1
        let valid = true

        while (queue.length > 0) {
          const curr = queue.shift()!
          pocket.push(curr)

          // If this pocket connects to the surface, don't flood it
          if (curr.y >= surfH - 2) {
            valid = false
          }

          for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
            const nx = curr.x + dx, ny = curr.y + dy, nz = curr.z + dz
            if (!grid.isInBounds({ x: nx, y: ny, z: nz })) continue
            if (ny > floodCeiling) continue
            const nvk = vKey(nx, ny, nz)
            if (visited[nvk]) continue
            visited[nvk] = 1

            if (grid.getBlock({ x: nx, y: ny, z: nz }) === WorldgenBlockType.Air) {
              queue.push({ x: nx, y: ny, z: nz })
            }
          }

          if (pocket.length > 500) break // Cap pocket size
        }

        // Only flood enclosed pockets (not surface-connected)
        if (valid && pocket.length >= 3) {
          for (const p of pocket) {
            grid.setBlock(p, WorldgenBlockType.Water)
            volume++
          }
        }
      }
    }
  }

  return volume
}

// ── Tundra Ice Freezing ─────────────────────────────────────────────────────

/**
 * Freeze the top water block in each column that falls in a Tundra biome.
 * This runs after all water features so that rivers and lakes in Tundra get frozen.
 */
function freezeTundraWater(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  biomeMap: Uint8Array,
  seaLevel: number,
): void {
  const { worldWidth, worldDepth } = grid
  const key = (x: number, z: number) => x * worldDepth + z

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      if (biomeMap[key(x, z)] !== BiomeType.Tundra) continue

      // Scan downward from above the surface to find the top water block
      const surfY = Math.floor(heightMap[key(x, z)])
      const scanTop = Math.max(surfY + 2, seaLevel + 1)

      for (let y = scanTop; y >= 1; y--) {
        const block = grid.getBlock({ x, y, z })
        if (block === WorldgenBlockType.Water) {
          grid.setBlock({ x, y, z }, WorldgenBlockType.Ice)
          break // Only freeze the top-most water block per column
        }
        if (block !== WorldgenBlockType.Air) break // Hit solid ground, stop scanning
      }
    }
  }
}
