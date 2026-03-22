import { create } from 'zustand'
import type { GenerationResult } from '../generation/generator-interface.ts'
import { createDefaultConfig } from '../generation/generator-interface.ts'
import { ALL_GENERATORS } from '../generation/registry.ts'
import type { VisualizationMode } from '../rendering/worldgen-renderer.ts'
import { analyzeNavigability, type NavigabilityResult } from '../analysis/navigability.ts'
import { createRNG } from '../../shared/seed.ts'

export type WorldgenView = 'dashboard' | 'world' | 'tuner'

interface WorldgenStore {
  seed: number
  selectedAlgorithms: string[]
  results: Map<string, GenerationResult>
  activeView: WorldgenView
  vizMode: VisualizationMode
  crossSectionY: number // -1 = disabled
  navResults: Map<string, NavigabilityResult>
  paramOverrides: Record<string, Record<string, number>>
  isGenerating: boolean

  setSeed: (seed: number) => void
  setSelectedAlgorithms: (ids: string[]) => void
  toggleAlgorithm: (id: string) => void
  setActiveView: (view: WorldgenView) => void
  setVizMode: (mode: VisualizationMode) => void
  setCrossSectionY: (y: number) => void
  setParam: (algorithmId: string, param: string, value: number) => void
  generateAll: () => void
  generateOne: (algorithmId: string) => void
  analyzeNav: (algorithmId: string) => void
}

export const useWorldgenStore = create<WorldgenStore>((set, get) => ({
  seed: 42,
  selectedAlgorithms: ALL_GENERATORS.map(g => g.id),
  results: new Map(),
  activeView: 'dashboard',
  vizMode: 'natural',
  crossSectionY: -1,
  navResults: new Map(),
  paramOverrides: {},
  isGenerating: false,

  setSeed(seed: number) {
    set({ seed })
  },

  setSelectedAlgorithms(ids: string[]) {
    set({ selectedAlgorithms: ids })
  },

  toggleAlgorithm(id: string) {
    const { selectedAlgorithms } = get()
    if (selectedAlgorithms.includes(id)) {
      set({ selectedAlgorithms: selectedAlgorithms.filter(a => a !== id) })
    } else {
      set({ selectedAlgorithms: [...selectedAlgorithms, id] })
    }
  },

  setActiveView(view: WorldgenView) {
    set({ activeView: view })
  },

  setVizMode(mode: VisualizationMode) {
    set({ vizMode: mode })
  },

  setCrossSectionY(y: number) {
    set({ crossSectionY: y })
  },

  setParam(algorithmId: string, param: string, value: number) {
    const { paramOverrides } = get()
    set({
      paramOverrides: {
        ...paramOverrides,
        [algorithmId]: { ...paramOverrides[algorithmId], [param]: value },
      },
    })
  },

  generateAll() {
    const { seed, selectedAlgorithms, paramOverrides } = get()
    set({ isGenerating: true })

    const results = new Map<string, GenerationResult>()
    for (const gen of ALL_GENERATORS) {
      if (!selectedAlgorithms.includes(gen.id)) continue
      const config = createDefaultConfig(seed)
      config.params = { ...gen.getDefaultParams(), ...paramOverrides[gen.id] }
      const result = gen.generate(config)
      results.set(gen.id, result)
    }

    set({ results, navResults: new Map(), isGenerating: false })
  },

  generateOne(algorithmId: string) {
    const { seed, paramOverrides, results } = get()
    const gen = ALL_GENERATORS.find(g => g.id === algorithmId)
    if (!gen) return

    const config = createDefaultConfig(seed)
    config.params = { ...gen.getDefaultParams(), ...paramOverrides[algorithmId] }
    const result = gen.generate(config)

    const newResults = new Map(results)
    newResults.set(algorithmId, result)
    set({ results: newResults })
  },

  analyzeNav(algorithmId: string) {
    const { results, navResults, seed } = get()
    const result = results.get(algorithmId)
    if (!result) return
    const rng = createRNG(seed + 9999)
    const nav = analyzeNavigability(result.grid, result.heightMap, rng, 32)
    const newNav = new Map(navResults)
    newNav.set(algorithmId, nav)
    set({ navResults: newNav })
  },
}))
