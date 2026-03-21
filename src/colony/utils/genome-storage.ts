/**
 * Genome persistence: save/load trained genomes to localStorage.
 * Genomes are stored separately from simulation snapshots.
 */

import {
  type Genome,
  type BiomeType,
  serializeGenome,
  deserializeGenome,
} from '../simulation/ai/genome.ts'

const GENOME_PREFIX = 'ai-colony-genome-'

export interface GenomeMeta {
  id: string
  name: string
  biome: BiomeType
  generation: number
  fitness: number
  needCount: number
  savedAt: string
}

interface StoredGenome {
  meta: GenomeMeta
  genome: ReturnType<typeof serializeGenome>
}

/** Save a genome to localStorage */
export function saveGenome(genome: Genome, name?: string): void {
  const meta: GenomeMeta = {
    id: genome.id,
    name: name ?? `${genome.trainedBiome}-gen${genome.generation}`,
    biome: genome.trainedBiome,
    generation: genome.generation,
    fitness: genome.fitness,
    needCount: genome.needCount,
    savedAt: new Date().toISOString(),
  }

  const stored: StoredGenome = {
    meta,
    genome: serializeGenome(genome) as ReturnType<typeof serializeGenome>,
  }

  localStorage.setItem(GENOME_PREFIX + genome.id, JSON.stringify(stored))
}

/** List all saved genome metadata */
export function listGenomes(): GenomeMeta[] {
  const metas: GenomeMeta[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(GENOME_PREFIX)) {
      try {
        const stored: StoredGenome = JSON.parse(localStorage.getItem(key)!)
        metas.push(stored.meta)
      } catch { /* skip corrupted */ }
    }
  }
  return metas.sort((a, b) => b.fitness - a.fitness)
}

/** Load a genome by ID */
export function loadGenome(id: string): Genome | null {
  const raw = localStorage.getItem(GENOME_PREFIX + id)
  if (!raw) return null
  try {
    const stored: StoredGenome = JSON.parse(raw)
    return deserializeGenome(stored.genome as unknown as Record<string, unknown>)
  } catch {
    return null
  }
}

/** Delete a genome by ID */
export function deleteGenome(id: string): void {
  localStorage.removeItem(GENOME_PREFIX + id)
}

/** Export a genome as a downloadable JSON file */
export function exportGenomeJSON(genome: Genome): Blob {
  const data = serializeGenome(genome)
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

/** Import a genome from a JSON file */
export async function importGenomeJSON(file: File): Promise<Genome> {
  const text = await file.text()
  const data = JSON.parse(text) as Record<string, unknown>
  return deserializeGenome(data)
}
