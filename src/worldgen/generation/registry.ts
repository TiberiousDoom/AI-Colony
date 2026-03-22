import type { IWorldGenerator } from './generator-interface.ts'
import { LayeredPerlinGenerator } from './layered-perlin.ts'
import { DomainWarpingGenerator } from './domain-warping.ts'
import { MultiPassSculptingGenerator } from './multi-pass-sculpting.ts'
import { SplineNoiseGenerator } from './spline-noise.ts'
import { GrammarHybridGenerator } from './grammar-hybrid.ts'

export const ALL_GENERATORS: IWorldGenerator[] = [
  new LayeredPerlinGenerator(),
  new DomainWarpingGenerator(),
  new MultiPassSculptingGenerator(),
  new SplineNoiseGenerator(),
  new GrammarHybridGenerator(),
]

export function getGeneratorById(id: string): IWorldGenerator | undefined {
  return ALL_GENERATORS.find(g => g.id === id)
}

export function getGeneratorIds(): string[] {
  return ALL_GENERATORS.map(g => g.id)
}
