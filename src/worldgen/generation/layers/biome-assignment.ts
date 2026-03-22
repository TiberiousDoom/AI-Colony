import type { SeededRNG } from '../../../shared/seed.ts'
import { createNoise2D, fractalNoise } from '../../../shared/noise.ts'
import type { WorldgenGrid } from '../../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../../world/block-types.ts'
import { BiomeType } from '../generator-interface.ts'

export interface BiomeParams {
  tempFrequency: number
  humidityFrequency: number
  tempOctaves: number
  humidityOctaves: number
}

const DEFAULT_BIOME_PARAMS: BiomeParams = {
  tempFrequency: 0.008,
  humidityFrequency: 0.01,
  tempOctaves: 3,
  humidityOctaves: 3,
}

/**
 * Lookup biome from temperature and humidity values (both in [-1, 1]).
 *
 * Temperature axis: cold (-1) to hot (1)
 * Humidity axis: dry (-1) to wet (1)
 *
 *                Dry              Wet
 *   Cold     Tundra           Tundra
 *   Cool     Mountains        Forest
 *   Warm     Badlands/Plains  Swamp/Forest
 *   Hot      Desert           Swamp
 */
function lookupBiome(temperature: number, humidity: number, height: number, seaLevel: number): BiomeType {
  // High elevation always mountains
  if (height > seaLevel + 20) return BiomeType.Mountains

  if (temperature < -0.25) {
    // Cold
    return BiomeType.Tundra
  } else if (temperature < 0.0) {
    // Cool
    if (humidity > 0.0) return BiomeType.Forest
    return BiomeType.Mountains
  } else if (temperature < 0.25) {
    // Warm
    if (humidity > 0.25) return BiomeType.Swamp
    if (humidity > -0.1) return BiomeType.Forest
    if (humidity > -0.3) return BiomeType.Plains
    return BiomeType.Badlands
  } else {
    // Hot
    if (humidity > 0.2) return BiomeType.Swamp
    if (humidity > -0.1) return BiomeType.Plains
    return BiomeType.Desert
  }
}

/**
 * Get the surface block type for a given biome.
 */
function biomeSurfaceBlock(biome: BiomeType): WorldgenBlockType {
  switch (biome) {
    case BiomeType.Plains: return WorldgenBlockType.Grass
    case BiomeType.Forest: return WorldgenBlockType.Grass
    case BiomeType.Desert: return WorldgenBlockType.Sand
    case BiomeType.Tundra: return WorldgenBlockType.Snow
    case BiomeType.Swamp: return WorldgenBlockType.Mud
    case BiomeType.Mountains: return WorldgenBlockType.Stone
    case BiomeType.Badlands: return WorldgenBlockType.LayeredStone
    default: return WorldgenBlockType.Grass
  }
}

/**
 * Get the subsurface block type for a given biome (top 3 layers under surface).
 */
function biomeSubsurfaceBlock(biome: BiomeType): WorldgenBlockType {
  switch (biome) {
    case BiomeType.Desert: return WorldgenBlockType.Sand
    case BiomeType.Tundra: return WorldgenBlockType.Dirt
    case BiomeType.Swamp: return WorldgenBlockType.Mud
    case BiomeType.Mountains: return WorldgenBlockType.Stone
    case BiomeType.Badlands: return WorldgenBlockType.LayeredStone
    default: return WorldgenBlockType.Dirt
  }
}

/**
 * Assigns biomes based on temperature and humidity noise maps.
 * Updates the grid's surface blocks to match biome types.
 * Returns the biome map (Uint8Array, one entry per x,z column).
 */
export function assignBiomes(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  seaLevel: number,
  params: BiomeParams = DEFAULT_BIOME_PARAMS,
): Uint8Array {
  const tempNoise = createNoise2D(rng)
  const humidityNoise = createNoise2D(rng.fork())
  const { worldWidth, worldDepth } = grid

  const biomeMap = new Uint8Array(worldWidth * worldDepth)

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const idx = x * worldDepth + z
      const surfaceY = Math.floor(heightMap[idx])

      const temp = fractalNoise(tempNoise, x * params.tempFrequency, z * params.tempFrequency, params.tempOctaves, 0.5, 2.0)
      const humidity = fractalNoise(humidityNoise, x * params.humidityFrequency, z * params.humidityFrequency, params.humidityOctaves, 0.5, 2.0)

      const biome = lookupBiome(temp, humidity, surfaceY, seaLevel)
      biomeMap[idx] = biome

      // Update surface blocks based on biome
      if (surfaceY > seaLevel || surfaceY > 0) {
        const surfaceBlock = biomeSurfaceBlock(biome)
        const subsurfaceBlock = biomeSubsurfaceBlock(biome)

        // Set surface block
        if (grid.getBlock({ x, y: surfaceY, z }) !== WorldgenBlockType.Air &&
            grid.getBlock({ x, y: surfaceY, z }) !== WorldgenBlockType.Water) {
          grid.setBlock({ x, y: surfaceY, z }, surfaceBlock)
        }

        // Set subsurface blocks (dirt/sand/etc layer)
        for (let y = surfaceY - 1; y >= Math.max(1, surfaceY - 3); y--) {
          const block = grid.getBlock({ x, y, z })
          if (block === WorldgenBlockType.Dirt || block === WorldgenBlockType.Grass) {
            grid.setBlock({ x, y, z }, subsurfaceBlock)
          }
        }

        // Tundra: freeze water at surface
        if (biome === BiomeType.Tundra) {
          for (let y = surfaceY + 1; y <= seaLevel; y++) {
            if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Water && y === seaLevel) {
              grid.setBlock({ x, y, z }, WorldgenBlockType.Ice)
            }
          }
        }
      }
    }
  }

  return biomeMap
}

/**
 * Assign biomes using warped temperature/humidity maps.
 * Domain warping distorts the noise sampling coordinates.
 */
export function assignBiomesWarped(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  seaLevel: number,
  warpStrength: number = 15,
): Uint8Array {
  const tempNoise = createNoise2D(rng)
  const humidityNoise = createNoise2D(rng.fork())
  const warpNoise = createNoise2D(rng.fork())
  const { worldWidth, worldDepth } = grid

  const biomeMap = new Uint8Array(worldWidth * worldDepth)

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const idx = x * worldDepth + z
      const surfaceY = Math.floor(heightMap[idx])

      // Warp the sampling coordinates
      const warpX = fractalNoise(warpNoise, x * 0.005, z * 0.005, 2, 0.5, 2.0) * warpStrength
      const warpZ = fractalNoise(warpNoise, x * 0.005 + 100, z * 0.005 + 100, 2, 0.5, 2.0) * warpStrength

      const temp = fractalNoise(tempNoise, (x + warpX) * 0.008, (z + warpZ) * 0.008, 3, 0.5, 2.0)
      const humidity = fractalNoise(humidityNoise, (x + warpX) * 0.01, (z + warpZ) * 0.01, 3, 0.5, 2.0)

      const biome = lookupBiome(temp, humidity, surfaceY, seaLevel)
      biomeMap[idx] = biome

      // Update surface blocks
      if (surfaceY > 0) {
        const surfaceBlock = biomeSurfaceBlock(biome)
        const subsurfaceBlock = biomeSubsurfaceBlock(biome)

        if (grid.getBlock({ x, y: surfaceY, z }) !== WorldgenBlockType.Air &&
            grid.getBlock({ x, y: surfaceY, z }) !== WorldgenBlockType.Water) {
          grid.setBlock({ x, y: surfaceY, z }, surfaceBlock)
        }
        for (let y = surfaceY - 1; y >= Math.max(1, surfaceY - 3); y--) {
          const block = grid.getBlock({ x, y, z })
          if (block === WorldgenBlockType.Dirt || block === WorldgenBlockType.Grass) {
            grid.setBlock({ x, y, z }, subsurfaceBlock)
          }
        }
        if (biome === BiomeType.Tundra) {
          for (let y = surfaceY + 1; y <= seaLevel; y++) {
            if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Water && y === seaLevel) {
              grid.setBlock({ x, y, z }, WorldgenBlockType.Ice)
            }
          }
        }
      }
    }
  }

  return biomeMap
}

/**
 * Assign biomes based on elevation, slope, and distance from water.
 * Used by Multi-Pass Sculpting algorithm.
 */
export function assignBiomesFromTerrain(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  seaLevel: number,
): Uint8Array {
  const tempNoise = createNoise2D(rng)
  const humidNoise = createNoise2D(rng.fork())
  const { worldWidth, worldDepth } = grid

  const biomeMap = new Uint8Array(worldWidth * worldDepth)

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const idx = x * worldDepth + z
      const surfaceY = Math.floor(heightMap[idx])

      // Compute local slope
      let maxSlope = 0
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, nz = z + dz
        if (nx >= 0 && nx < worldWidth && nz >= 0 && nz < worldDepth) {
          const neighborH = heightMap[nx * worldDepth + nz]
          maxSlope = Math.max(maxSlope, Math.abs(surfaceY - neighborH))
        }
      }

      // Temperature from noise + elevation cooling (higher = colder)
      const rawTemp = fractalNoise(tempNoise, x * 0.01, z * 0.01, 2, 0.5, 2.0)
      const elevCooling = Math.max(0, (surfaceY - seaLevel) / 50) * 0.15
      const temp = rawTemp - elevCooling
      const humid = fractalNoise(humidNoise, x * 0.008, z * 0.008, 2, 0.5, 2.0)

      let biome: BiomeType
      if (surfaceY > seaLevel + 22 || maxSlope > 6) {
        biome = BiomeType.Mountains
      } else if (surfaceY < seaLevel + 2 && humid > 0.0) {
        biome = BiomeType.Swamp
      } else {
        biome = lookupBiome(temp, humid, surfaceY, seaLevel)
      }

      biomeMap[idx] = biome

      // Update surface blocks
      if (surfaceY > 0) {
        const surfaceBlock = biomeSurfaceBlock(biome)
        const subsurfaceBlock = biomeSubsurfaceBlock(biome)

        if (grid.getBlock({ x, y: surfaceY, z }) !== WorldgenBlockType.Air &&
            grid.getBlock({ x, y: surfaceY, z }) !== WorldgenBlockType.Water) {
          grid.setBlock({ x, y: surfaceY, z }, surfaceBlock)
        }
        for (let y = surfaceY - 1; y >= Math.max(1, surfaceY - 3); y--) {
          const block = grid.getBlock({ x, y, z })
          if (block === WorldgenBlockType.Dirt || block === WorldgenBlockType.Grass) {
            grid.setBlock({ x, y, z }, subsurfaceBlock)
          }
        }
        if (biome === BiomeType.Tundra) {
          for (let y = surfaceY + 1; y <= seaLevel; y++) {
            if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Water && y === seaLevel) {
              grid.setBlock({ x, y, z }, WorldgenBlockType.Ice)
            }
          }
        }
      }
    }
  }

  return biomeMap
}

/**
 * Multi-noise biome selection used by Spline-Noise algorithm.
 * Uses continentalness + temperature + humidity for richer selection.
 */
export function assignBiomesMultiNoise(
  grid: WorldgenGrid,
  heightMap: Float32Array,
  rng: SeededRNG,
  seaLevel: number,
): Uint8Array {
  const tempNoise = createNoise2D(rng)
  const humidNoise = createNoise2D(rng.fork())
  const contNoise = createNoise2D(rng.fork())
  const { worldWidth, worldDepth } = grid

  const biomeMap = new Uint8Array(worldWidth * worldDepth)

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const idx = x * worldDepth + z
      const surfaceY = Math.floor(heightMap[idx])

      const temp = fractalNoise(tempNoise, x * 0.007, z * 0.007, 3, 0.5, 2.0)
      const humid = fractalNoise(humidNoise, x * 0.009, z * 0.009, 3, 0.5, 2.0)
      const cont = fractalNoise(contNoise, x * 0.005, z * 0.005, 2, 0.5, 2.0)

      let biome: BiomeType

      // Continentalness modulates biome selection
      if (cont > 0.5 || surfaceY > seaLevel + 20) {
        biome = BiomeType.Mountains
      } else if (temp < -0.25) {
        biome = BiomeType.Tundra
      } else if (temp > 0.25 && humid < -0.1) {
        biome = BiomeType.Desert
      } else if (temp > 0.2 && humid < -0.25) {
        biome = BiomeType.Badlands
      } else if (humid > 0.25 && temp > 0.05) {
        biome = BiomeType.Swamp
      } else if (humid > -0.05 || temp < 0.05) {
        biome = BiomeType.Forest
      } else {
        biome = BiomeType.Plains
      }

      biomeMap[idx] = biome

      // Update surface blocks
      if (surfaceY > 0) {
        const surfaceBlock = biomeSurfaceBlock(biome)
        const subsurfaceBlock = biomeSubsurfaceBlock(biome)

        if (grid.getBlock({ x, y: surfaceY, z }) !== WorldgenBlockType.Air &&
            grid.getBlock({ x, y: surfaceY, z }) !== WorldgenBlockType.Water) {
          grid.setBlock({ x, y: surfaceY, z }, surfaceBlock)
        }
        for (let y = surfaceY - 1; y >= Math.max(1, surfaceY - 3); y--) {
          const block = grid.getBlock({ x, y, z })
          if (block === WorldgenBlockType.Dirt || block === WorldgenBlockType.Grass) {
            grid.setBlock({ x, y, z }, subsurfaceBlock)
          }
        }
        if (biome === BiomeType.Tundra) {
          for (let y = surfaceY + 1; y <= seaLevel; y++) {
            if (grid.getBlock({ x, y, z }) === WorldgenBlockType.Water && y === seaLevel) {
              grid.setBlock({ x, y, z }, WorldgenBlockType.Ice)
            }
          }
        }
      }
    }
  }

  return biomeMap
}
