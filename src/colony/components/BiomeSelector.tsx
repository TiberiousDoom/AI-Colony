/**
 * BiomeSelector: visual cards for selecting a biome preset on the setup screen.
 */

import { type BiomeType, BIOME_PRESETS } from '../simulation/biomes.ts'

const BIOME_ORDER: BiomeType[] = ['temperate', 'desert', 'tundra', 'island', 'lush']

const BIOME_COLORS: Record<BiomeType, string> = {
  temperate: '#4ade80',
  desert: '#f59e0b',
  tundra: '#60a5fa',
  island: '#06b6d4',
  lush: '#22c55e',
}

const BIOME_SPECIALS: Record<BiomeType, string | null> = {
  temperate: null,
  desert: 'Cooling need',
  tundra: 'Permanent cold, short growing',
  island: 'Fragmented land',
  lush: 'Easy mode',
}

interface BiomeSelectorProps {
  value: BiomeType
  onChange: (biome: BiomeType) => void
}

export function BiomeSelector({ value, onChange }: BiomeSelectorProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {BIOME_ORDER.map(biome => {
        const preset = BIOME_PRESETS[biome]
        const isSelected = biome === value
        const special = BIOME_SPECIALS[biome]
        return (
          <button
            key={biome}
            onClick={() => onChange(biome)}
            style={{
              flex: '1 1 120px',
              minWidth: 110,
              padding: '8px 12px',
              background: isSelected ? '#1e3a5f' : '#0f172a',
              border: `2px solid ${isSelected ? '#3b82f6' : '#334155'}`,
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: BIOME_COLORS[biome],
              }} />
              <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>
                {preset.name}
              </span>
            </div>
            <div style={{ color: '#64748b', fontSize: 10, lineHeight: 1.3 }}>
              {preset.description}
            </div>
            {special && (
              <div style={{ color: BIOME_COLORS[biome], fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
                {special}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
