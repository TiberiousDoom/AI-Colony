/**
 * Seasonal color palette and village identification colors.
 */

import type { Season } from '../simulation/villager.ts'
import { TileType } from '../simulation/world.ts'

/** Tint color per tile type per season (hex numbers for PixiJS Sprite.tint) */
export const SEASONAL_TINTS: Record<Season, Partial<Record<TileType, number>>> = {
  spring: {
    [TileType.Grass]: 0x66cc66,
    [TileType.Forest]: 0x339933,
    [TileType.FertileSoil]: 0x8b7355,
  },
  summer: {
    [TileType.Grass]: 0x55aa55,
    [TileType.Forest]: 0x2d8a2d,
    [TileType.FertileSoil]: 0x7a6644,
  },
  autumn: {
    [TileType.Grass]: 0xccaa44,
    [TileType.Forest]: 0xaa6633,
    [TileType.FertileSoil]: 0x997744,
  },
  winter: {
    [TileType.Grass]: 0xccccdd,
    [TileType.Forest]: 0x556655,
    [TileType.FertileSoil]: 0xaaaaaa,
  },
}

/** Default tints for non-seasonal tile types */
export const BASE_TINTS: Partial<Record<TileType, number>> = {
  [TileType.Stone]: 0x888888,
  [TileType.Water]: 0x4488cc,
}

/** Village identification colors */
export const VILLAGE_COLORS: Record<string, number> = {
  utility: 0x3b82f6,   // Blue
  bt: 0xf97316,        // Orange
  goap: 0x10b981,      // Emerald green
  evolutionary: 0xa855f7, // Purple
}

/** Get tint for a tile type in a given season */
export function getTileTint(tileType: TileType, season: Season): number {
  return SEASONAL_TINTS[season][tileType] ?? BASE_TINTS[tileType] ?? 0xffffff
}
