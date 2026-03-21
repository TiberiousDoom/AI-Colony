/**
 * GenomeLibrary: dropdown/list for selecting saved genomes on the setup screen.
 */

import { useState, useEffect } from 'react'
import { listGenomes, deleteGenome, loadGenome, importGenomeJSON, saveGenome } from '../utils/genome-storage.ts'
import type { GenomeMeta } from '../utils/genome-storage.ts'
import type { Genome } from '../simulation/ai/genome.ts'

interface GenomeLibraryProps {
  selectedGenomeId: string | null
  onSelect: (genome: Genome | null) => void
  biomeFilter?: string
}

export function GenomeLibrary({ selectedGenomeId, onSelect, biomeFilter }: GenomeLibraryProps) {
  const [genomes, setGenomes] = useState<GenomeMeta[]>([])

  useEffect(() => {
    refreshList()
  }, [])

  function refreshList() {
    let all = listGenomes()
    if (biomeFilter) {
      all = all.filter(g => g.biome === biomeFilter)
    }
    setGenomes(all)
  }

  function handleSelect(meta: GenomeMeta) {
    const genome = loadGenome(meta.id)
    onSelect(genome)
  }

  function handleDelete(id: string) {
    deleteGenome(id)
    if (selectedGenomeId === id) onSelect(null)
    refreshList()
  }

  async function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const genome = await importGenomeJSON(file)
        saveGenome(genome, file.name.replace('.json', ''))
        refreshList()
        onSelect(genome)
      } catch (e) {
        console.error('Failed to import genome:', e)
      }
    }
    input.click()
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>Saved Genomes</span>
        <button
          onClick={handleImport}
          style={{
            background: 'transparent',
            border: '1px solid #475569',
            color: '#94a3b8',
            borderRadius: 4,
            padding: '2px 8px',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Import
        </button>
      </div>

      {genomes.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>
          No saved genomes{biomeFilter ? ` for ${biomeFilter}` : ''}. Train one first!
        </div>
      ) : (
        <div style={{ maxHeight: 120, overflow: 'auto' }}>
          {genomes.map(meta => (
            <div
              key={meta.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                marginBottom: 2,
                background: selectedGenomeId === meta.id ? '#1e3a5f' : '#0f172a',
                borderRadius: 4,
                border: `1px solid ${selectedGenomeId === meta.id ? '#3b82f6' : '#334155'}`,
                cursor: 'pointer',
                fontSize: 11,
              }}
              onClick={() => handleSelect(meta)}
            >
              <div>
                <span style={{ color: '#e2e8f0' }}>{meta.name}</span>
                <span style={{ color: '#64748b', marginLeft: 8 }}>
                  Gen {meta.generation} | Fitness: {meta.fitness.toFixed(0)}
                </span>
                <span style={{ color: '#64748b', marginLeft: 8 }}>
                  ({meta.biome})
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(meta.id) }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '0 4px',
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
