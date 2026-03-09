/**
 * Biome preset system: parameterized world generation that modifies
 * tile distribution, seasonal intensity, event frequency, and environmental pressures.
 */

export type BiomeType = 'temperate' | 'desert' | 'tundra' | 'island' | 'lush'

export interface BiomeParams {
  name: string
  description: string
  // World generation
  noiseScale: number
  waterThreshold: number
  forestThreshold: [number, number]
  stoneThreshold: number
  fertileChance: number
  // Resources
  forestResourceRange: [number, number]
  stoneResourceRange: [number, number]
  regenMultiplier: number
  // Environment
  seasonIntensity: number
  eventFrequencyMod: number
  // Special mechanics
  hasCoolingNeed: boolean
  permanentWinter: boolean
  shortGrowingSeason: boolean
}

export const BIOME_PRESETS: Record<BiomeType, BiomeParams> = {
  temperate: {
    name: 'Temperate',
    description: 'Balanced environment with moderate resources and seasons.',
    noiseScale: 0.08,
    waterThreshold: -0.3,
    forestThreshold: [0.0, 0.5],
    stoneThreshold: 0.65,
    fertileChance: 0.3,
    forestResourceRange: [80, 120],
    stoneResourceRange: [60, 100],
    regenMultiplier: 1.0,
    seasonIntensity: 1.0,
    eventFrequencyMod: 1.0,
    hasCoolingNeed: false,
    permanentWinter: false,
    shortGrowingSeason: false,
  },
  desert: {
    name: 'Desert',
    description: 'Scarce water and forests, abundant stone. Cooling need drains during daytime.',
    noiseScale: 0.06,
    waterThreshold: -0.6,
    forestThreshold: [0.3, 0.5],
    stoneThreshold: 0.45,
    fertileChance: 0.1,
    forestResourceRange: [40, 80],
    stoneResourceRange: [80, 140],
    regenMultiplier: 0.5,
    seasonIntensity: 0.5,
    eventFrequencyMod: 0.8,
    hasCoolingNeed: true,
    permanentWinter: false,
    shortGrowingSeason: false,
  },
  tundra: {
    name: 'Tundra',
    description: 'Abundant forests and stone but harsh winters. Permanent cold, short growing season.',
    noiseScale: 0.07,
    waterThreshold: -0.35,
    forestThreshold: [-0.1, 0.5],
    stoneThreshold: 0.55,
    fertileChance: 0.15,
    forestResourceRange: [90, 140],
    stoneResourceRange: [80, 120],
    regenMultiplier: 0.7,
    seasonIntensity: 2.0,
    eventFrequencyMod: 1.2,
    hasCoolingNeed: false,
    permanentWinter: true,
    shortGrowingSeason: true,
  },
  island: {
    name: 'Island Archipelago',
    description: 'Fragmented landmass with lots of water. Clustered forests, scarce stone.',
    noiseScale: 0.1,
    waterThreshold: -0.1,
    forestThreshold: [0.1, 0.6],
    stoneThreshold: 0.75,
    fertileChance: 0.35,
    forestResourceRange: [70, 110],
    stoneResourceRange: [40, 70],
    regenMultiplier: 1.2,
    seasonIntensity: 0.8,
    eventFrequencyMod: 0.9,
    hasCoolingNeed: false,
    permanentWinter: false,
    shortGrowingSeason: false,
  },
  lush: {
    name: 'Lush',
    description: 'Abundant forests, double regeneration. Easy mode for testing.',
    noiseScale: 0.08,
    waterThreshold: -0.35,
    forestThreshold: [-0.2, 0.6],
    stoneThreshold: 0.65,
    fertileChance: 0.4,
    forestResourceRange: [100, 160],
    stoneResourceRange: [60, 100],
    regenMultiplier: 2.0,
    seasonIntensity: 0.5,
    eventFrequencyMod: 0.6,
    hasCoolingNeed: false,
    permanentWinter: false,
    shortGrowingSeason: false,
  },
}

/** Get biome params by type, defaults to temperate */
export function getBiomeParams(biome: BiomeType): BiomeParams {
  return BIOME_PRESETS[biome] ?? BIOME_PRESETS.temperate
}
