/**
 * Structures: shelter and storage buildings.
 */

import type { Position, VillageStockpile } from './villager.ts'
import type { World } from './world.ts'

export type StructureType = 'shelter' | 'storage'

export interface Structure {
  id: string
  type: StructureType
  position: Position
  builtTick: number
}

export interface StructureCost {
  wood: number
  stone: number
}

export const STRUCTURE_COSTS: Record<StructureType, StructureCost> = {
  shelter: { wood: 20, stone: 0 },
  storage: { wood: 15, stone: 10 },
}

/** Base stockpile cap per resource type (food, wood, stone) */
export const BASE_STOCKPILE_CAP = 200

export function canAfford(stockpile: VillageStockpile, type: StructureType): boolean {
  const cost = STRUCTURE_COSTS[type]
  return stockpile.wood >= cost.wood && stockpile.stone >= cost.stone
}

export function deductCost(stockpile: VillageStockpile, type: StructureType): void {
  const cost = STRUCTURE_COSTS[type]
  stockpile.wood -= cost.wood
  stockpile.stone -= cost.stone
}

export function createStructure(type: StructureType, position: Position, tick: number): Structure {
  return {
    id: `${type}-${position.x}-${position.y}-${tick}`,
    type,
    position: { ...position },
    builtTick: tick,
  }
}

/** Find a passable tile near campfire for building (within radius 5) */
export function findBuildSite(world: World, campfire: Position, structures: Structure[]): Position | null {
  const occupied = new Set(structures.map(s => `${s.position.x},${s.position.y}`))
  // Campfire tile itself is reserved
  occupied.add(`${campfire.x},${campfire.y}`)

  const radius = 5
  let bestDist = Infinity
  let best: Position | null = null

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = campfire.x + dx
      const y = campfire.y + dy
      if (!world.isPassable(x, y)) continue
      if (occupied.has(`${x},${y}`)) continue
      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist > 0 && dist < bestDist) {
        bestDist = dist
        best = { x, y }
      }
    }
  }
  return best
}

export function getShelterCapacity(structures: Structure[]): number {
  return structures.filter(s => s.type === 'shelter').length * 3
}

export function getStorageBonus(structures: Structure[]): number {
  return structures.filter(s => s.type === 'storage').length * 100
}

export function getStockpileCap(structures: Structure[]): number {
  return BASE_STOCKPILE_CAP + getStorageBonus(structures)
}

export function isAtStructure(pos: Position, structures: Structure[], type?: StructureType): boolean {
  return structures.some(s =>
    (type === undefined || s.type === type) &&
    Math.abs(s.position.x - pos.x) <= 1 &&
    Math.abs(s.position.y - pos.y) <= 1
  )
}
