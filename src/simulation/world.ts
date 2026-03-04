/**
 * World generation: 64×64 tile grid with noise-based terrain.
 */

import { createRNG, type SeededRNG } from '../utils/seed.ts'
import { createNoise2D, fractalNoise } from '../utils/noise.ts'
import type { Position, Season } from './villager.ts'

// --- Tile Types ---

export enum TileType {
  Grass = 'grass',
  Forest = 'forest',
  Stone = 'stone',
  Water = 'water',
  FertileSoil = 'fertile',
}

// --- Tile ---

export interface Tile {
  type: TileType
  x: number
  y: number
  /** Remaining harvestable resource amount */
  resourceAmount: number
  /** Maximum resource capacity (for regeneration) */
  maxResource: number
  /** Regeneration rate per tick */
  regenRate: number
}

// --- World Config ---

export interface WorldConfig {
  width: number
  height: number
  seed: number
}

// --- World ---

export class World {
  readonly width: number
  readonly height: number
  readonly tiles: Tile[][]
  readonly seed: number
  readonly campfirePosition: Position

  /** Blighted tiles: "x,y" → ticks remaining until recovery */
  blightTiles: Map<string, number> = new Map()

  /** Tiles that changed since last render (for efficient rendering) */
  readonly dirtyTiles: Set<string> = new Set()

  constructor(config: WorldConfig) {
    this.width = config.width
    this.height = config.height
    this.seed = config.seed

    const rng = createRNG(config.seed)
    const worldRng = rng.fork()

    const { tiles, campfire } = generateWorld(
      this.width,
      this.height,
      worldRng,
    )
    this.tiles = tiles
    this.campfirePosition = campfire
  }

  getTile(x: number, y: number): Tile | null {
    if (!this.isInBounds(x, y)) return null
    return this.tiles[y][x]
  }

  isPassable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false
    return this.tiles[y][x].type !== TileType.Water
  }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height
  }

  /**
   * Find tiles matching a predicate within a radius of (cx, cy).
   * Iterates a square bounding box clamped to map bounds.
   */
  findTilesInRadius(
    cx: number,
    cy: number,
    radius: number,
    predicate: (t: Tile) => boolean,
  ): Tile[] {
    const results: Tile[] = []
    const minX = Math.max(0, Math.floor(cx - radius))
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius))
    const minY = Math.max(0, Math.floor(cy - radius))
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius))

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.tiles[y][x]
        if (predicate(tile)) {
          results.push(tile)
        }
      }
    }
    return results
  }

  /**
   * Advance resource regeneration for one tick.
   * Season defaults to 'summer' for backward compatibility with Phase 1 tests.
   */
  tickRegeneration(season: Season = 'summer'): void {
    // Process blight timers
    for (const [key, remaining] of this.blightTiles) {
      if (remaining <= 1) {
        // Blight expired — restore tile
        this.blightTiles.delete(key)
        const [x, y] = key.split(',').map(Number)
        const tile = this.tiles[y]?.[x]
        if (tile && tile.type === TileType.Forest) {
          tile.resourceAmount = tile.maxResource
          this.dirtyTiles.add(key)
        }
      } else {
        this.blightTiles.set(key, remaining - 1)
      }
    }

    // Winter: no regeneration
    if (season === 'winter') return

    const regenMult = season === 'spring' ? 2 : 1

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.tiles[y][x]
        if (tile.regenRate > 0 && tile.resourceAmount < tile.maxResource) {
          // Don't regen blighted tiles
          if (this.blightTiles.has(`${x},${y}`)) continue
          const before = tile.resourceAmount
          tile.resourceAmount = Math.min(
            tile.maxResource,
            tile.resourceAmount + tile.regenRate * regenMult,
          )
          if (tile.resourceAmount !== before) {
            this.dirtyTiles.add(`${x},${y}`)
          }
        }
      }
    }
  }

  /** Apply blight: destroy resources in radius, set recovery timer */
  applyBlight(cx: number, cy: number, radius: number, durationTicks: number): void {
    const minX = Math.max(0, cx - radius)
    const maxX = Math.min(this.width - 1, cx + radius)
    const minY = Math.max(0, cy - radius)
    const maxY = Math.min(this.height - 1, cy + radius)

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.tiles[y][x]
        if (tile.type === TileType.Forest && tile.resourceAmount > 0) {
          tile.resourceAmount = 0
          this.blightTiles.set(`${x},${y}`, durationTicks)
          this.dirtyTiles.add(`${x},${y}`)
        }
      }
    }
  }
}

// --- Generation ---

function generateWorld(
  width: number,
  height: number,
  rng: SeededRNG,
): { tiles: Tile[][]; campfire: Position } {
  const noiseRng = rng.fork()
  const noise = createNoise2D(noiseRng)

  const scale = 0.08

  const tiles: Tile[][] = []

  for (let y = 0; y < height; y++) {
    const row: Tile[] = []
    for (let x = 0; x < width; x++) {
      const n = fractalNoise(noise, x * scale, y * scale, 4, 0.5, 2.0)
      const type = classifyTile(n)
      row.push(createTile(type, x, y))
    }
    tiles.push(row)
  }

  // Starting clearing: 7×7 area near center
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const tx = cx + dx
      const ty = cy + dy
      if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
        tiles[ty][tx] = createTile(TileType.Grass, tx, ty)
      }
    }
  }

  // Scatter fertile soil near water (secondary pass)
  const fertileRng = rng.fork()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].type !== TileType.Grass) continue
      if (!hasAdjacentType(tiles, x, y, width, height, TileType.Water)) continue
      if (fertileRng.next() < 0.4) {
        tiles[y][x] = createTile(TileType.FertileSoil, x, y)
      }
    }
  }

  // Validation pass
  validateOrRegenerate(tiles, width, height)

  return { tiles, campfire: { x: cx, y: cy } }
}

function classifyTile(noiseValue: number): TileType {
  if (noiseValue < -0.3) return TileType.Water
  if (noiseValue < -0.05) return TileType.Grass
  if (noiseValue < 0.3) return TileType.Forest
  if (noiseValue < 0.55) return TileType.Grass
  return TileType.Stone
}

function createTile(type: TileType, x: number, y: number): Tile {
  switch (type) {
    case TileType.Forest:
      return { type, x, y, resourceAmount: 100, maxResource: 100, regenRate: 0.5 }
    case TileType.Stone:
      return { type, x, y, resourceAmount: 100, maxResource: 100, regenRate: 0 }
    default:
      return { type, x, y, resourceAmount: 0, maxResource: 0, regenRate: 0 }
  }
}

function hasAdjacentType(
  tiles: Tile[][],
  x: number,
  y: number,
  width: number,
  height: number,
  type: TileType,
): boolean {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  for (const [dx, dy] of dirs) {
    const nx = x + dx
    const ny = y + dy
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      if (tiles[ny][nx].type === type) return true
    }
  }
  return false
}

function validateOrRegenerate(tiles: Tile[][], width: number, height: number): void {
  let forestCount = 0
  let stoneCount = 0
  let waterCount = 0
  const total = width * height

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      switch (tiles[y][x].type) {
        case TileType.Forest: forestCount++; break
        case TileType.Stone: stoneCount++; break
        case TileType.Water: waterCount++; break
      }
    }
  }

  if (forestCount / total < 0.15) {
    const needed = Math.ceil(total * 0.15) - forestCount
    let converted = 0
    for (let y = 0; y < height && converted < needed; y++) {
      for (let x = 0; x < width && converted < needed; x++) {
        if (tiles[y][x].type === TileType.Grass) {
          tiles[y][x] = createTile(TileType.Forest, x, y)
          converted++
        }
      }
    }
  }

  if (stoneCount / total < 0.03) {
    const needed = Math.ceil(total * 0.03) - stoneCount
    let converted = 0
    for (let y = height - 1; y >= 0 && converted < needed; y--) {
      for (let x = width - 1; x >= 0 && converted < needed; x--) {
        if (tiles[y][x].type === TileType.Grass) {
          tiles[y][x] = createTile(TileType.Stone, x, y)
          converted++
        }
      }
    }
  }

  if (waterCount === 0) {
    const px = Math.min(5, width - 1)
    const py = Math.min(5, height - 1)
    tiles[py][px] = createTile(TileType.Water, px, py)
  }
}
