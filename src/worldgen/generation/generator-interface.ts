import type { WorldgenGrid } from '../world/worldgen-grid.ts'

export enum BiomeType {
  Plains = 0,
  Forest = 1,
  Desert = 2,
  Tundra = 3,
  Swamp = 4,
  Mountains = 5,
  Badlands = 6,
}

export interface GenerationConfig {
  seed: number
  worldWidth: number
  worldHeight: number
  worldDepth: number
  seaLevel: number
  params: Record<string, number>
}

export interface GenerationTiming {
  totalMs: number
  terrainMs: number
  biomesMs: number
  cavesMs: number
  oresMs: number
  decorationMs: number
  spawnsMs: number
}

export interface GenerationMetadata {
  blockCounts: Record<number, number>
  surfaceArea: number
  minHeight: number
  maxHeight: number
  avgHeight: number
}

export interface GenerationResult {
  grid: WorldgenGrid
  heightMap: Float32Array
  biomeMap: Uint8Array
  timing: GenerationTiming
  metadata: GenerationMetadata
}

export interface ParamDesc {
  label: string
  min: number
  max: number
  step: number
}

export interface IWorldGenerator {
  readonly name: string
  readonly id: string
  generate(config: GenerationConfig): GenerationResult
  getDefaultParams(): Record<string, number>
  getParamDescriptions(): Record<string, ParamDesc>
}

export function createDefaultConfig(seed: number = 42): GenerationConfig {
  return {
    seed,
    worldWidth: 128,
    worldHeight: 64,
    worldDepth: 128,
    seaLevel: 32,
    params: {},
  }
}

export function createEmptyTiming(): GenerationTiming {
  return {
    totalMs: 0,
    terrainMs: 0,
    biomesMs: 0,
    cavesMs: 0,
    oresMs: 0,
    decorationMs: 0,
    spawnsMs: 0,
  }
}

export function computeMetadata(grid: WorldgenGrid, heightMap: Float32Array): GenerationMetadata {
  const blockCounts: Record<number, number> = {}
  let minH = Infinity, maxH = -Infinity, totalH = 0

  for (let i = 0; i < heightMap.length; i++) {
    const h = heightMap[i]
    if (h < minH) minH = h
    if (h > maxH) maxH = h
    totalH += h
  }

  // Count blocks — sample every 2nd voxel for performance
  const step = 2
  for (let x = 0; x < grid.worldWidth; x += step) {
    for (let y = 0; y < grid.worldHeight; y += step) {
      for (let z = 0; z < grid.worldDepth; z += step) {
        const type = grid.getBlock({ x, y, z })
        blockCounts[type] = (blockCounts[type] ?? 0) + 1
      }
    }
  }
  // Scale counts to approximate full volume
  const scaleFactor = step * step * step
  for (const key of Object.keys(blockCounts)) {
    blockCounts[Number(key)] *= scaleFactor
  }

  return {
    blockCounts,
    surfaceArea: heightMap.length,
    minHeight: minH === Infinity ? 0 : minH,
    maxHeight: maxH === -Infinity ? 0 : maxH,
    avgHeight: heightMap.length > 0 ? totalH / heightMap.length : 0,
  }
}
