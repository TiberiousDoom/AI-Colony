import type { IWorldGenerator } from './generator-interface.ts'
import { LayeredPerlinGenerator } from './layered-perlin.ts'
import { DomainWarpingGenerator } from './domain-warping.ts'
import { MultiPassSculptingGenerator } from './multi-pass-sculpting.ts'
import { SplineNoiseGenerator } from './spline-noise.ts'
import { GrammarHybridGenerator } from './grammar-hybrid.ts'

export const ALL_GENERATORS: IWorldGenerator[] = [
  new SplineNoiseGenerator(),
  new LayeredPerlinGenerator(),
  new DomainWarpingGenerator(),
  new MultiPassSculptingGenerator(),
  new GrammarHybridGenerator(),
]

/** The recommended default algorithm for world generation. */
export const DEFAULT_GENERATOR_ID = 'spline-noise'

export function getGeneratorById(id: string): IWorldGenerator | undefined {
  return ALL_GENERATORS.find(g => g.id === id)
}

export function getGeneratorIds(): string[] {
  return ALL_GENERATORS.map(g => g.id)
}
