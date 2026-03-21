/**
 * SetupScreen: pre-simulation configuration UI.
 */

import { useState, useRef } from 'react'
import {
  type GameConfig, type WorldSize, type ResourceLevel, type EventFrequency,
  getDefaultGameConfig, validateAISelection, decodeConfigString,
} from '../config/game-config.ts'
import type { BiomeType } from '../simulation/biomes.ts'
import type { Genome } from '../simulation/ai/genome.ts'
import { useSimulationStore } from '../store/simulation-store.ts'
import { BiomeSelector } from '../components/BiomeSelector.tsx'
import { GenomeLibrary } from '../components/GenomeLibrary.tsx'
import { TrainingView } from './TrainingView.tsx'
import { useTraining } from '../training/useTraining.ts'
import { getDefaultTrainingConfig } from '../training/trainer.ts'
import { saveGenome } from '../utils/genome-storage.ts'

const SECTION_STYLE: React.CSSProperties = {
  marginBottom: 16,
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  color: '#94a3b8',
  fontSize: 12,
  marginBottom: 4,
  fontWeight: 600,
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

function RadioGroup<T extends string | number>({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  name: string
}) {
  return (
    <div style={ROW_STYLE}>
      {options.map(opt => (
        <label key={String(opt.value)} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: value === opt.value ? '#60a5fa' : '#94a3b8',
          cursor: 'pointer', fontSize: 13,
        }}>
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            style={{ accentColor: '#3b82f6' }}
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

export function SetupScreen() {
  const startWithConfig = useSimulationStore(s => s.startWithConfig)
  const [config, setConfig] = useState<GameConfig>(getDefaultGameConfig)
  const [configString, setConfigString] = useState('')
  const [selectedGenome, setSelectedGenome] = useState<Genome | null>(null)
  const [showTraining, setShowTraining] = useState(false)
  const trainingStartTime = useRef(0)

  const { trainingState, isTraining, startTraining, stopTraining, trainedGenome } = useTraining()

  const isValid = validateAISelection(config.aiSelection) &&
    (!config.aiSelection.evolutionary || selectedGenome !== null)

  function handleAIToggle(key: 'utility' | 'bt' | 'goap' | 'evolutionary') {
    setConfig(prev => ({
      ...prev,
      aiSelection: { ...prev.aiSelection, [key]: !prev.aiSelection[key] },
    }))
  }

  function handleRandomSeed() {
    setConfig(prev => ({ ...prev, seed: Math.floor(Math.random() * 1000000) }))
  }

  function handlePasteConfig() {
    if (!configString.trim()) return
    const parsed = decodeConfigString(configString.trim())
    setConfig(prev => ({ ...prev, ...parsed }))
    setConfigString('')
  }

  function handleStartTraining() {
    const tc = getDefaultTrainingConfig()
    tc.biome = config.biome
    tc.worldSize = config.worldSize
    tc.seed = config.seed
    trainingStartTime.current = Date.now()
    startTraining(tc)
    setShowTraining(true)
  }

  function handleTrainingClose() {
    const genome = trainedGenome
    if (genome) {
      saveGenome(genome)
      setSelectedGenome(genome)
      setConfig(prev => ({ ...prev, evolutionaryGenome: genome }))
    }
    setShowTraining(false)
  }

  function handleGenomeSelect(genome: Genome | null) {
    setSelectedGenome(genome)
    setConfig(prev => ({ ...prev, evolutionaryGenome: genome ?? undefined }))
  }

  function handleStart() {
    if (!isValid) return
    startWithConfig(config)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', background: '#0f172a',
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 12, padding: 32,
        width: 520, maxWidth: '90vw', border: '1px solid #334155',
        maxHeight: '90vh', overflow: 'auto',
      }}>
        <h2 style={{ color: '#e2e8f0', margin: '0 0 20px', fontSize: 20 }}>
          AI Colony Setup
        </h2>

        {/* AI Selection */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>AI Systems (min 2)</span>
          <div style={ROW_STYLE}>
            {([
              ['utility', 'Utility AI'],
              ['bt', 'Behavior Tree'],
              ['goap', 'GOAP'],
              ['evolutionary', 'Evolutionary'],
            ] as const).map(([key, label]) => (
              <label key={key} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                color: config.aiSelection[key] ? '#60a5fa' : '#94a3b8',
                cursor: 'pointer', fontSize: 13,
              }}>
                <input
                  type="checkbox"
                  checked={config.aiSelection[key]}
                  onChange={() => handleAIToggle(key)}
                  style={{ accentColor: '#3b82f6' }}
                />
                {label}
              </label>
            ))}
          </div>
          {!validateAISelection(config.aiSelection) && (
            <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>
              Select at least 2 AI systems
            </div>
          )}
        </div>

        {/* Evolutionary AI Training & Genome Selection */}
        {config.aiSelection.evolutionary && (
          <div style={{ ...SECTION_STYLE, background: '#0f172a', padding: 12, borderRadius: 8, border: '1px solid #334155' }}>
            <span style={LABEL_STYLE}>Evolutionary AI Genome</span>
            {selectedGenome ? (
              <div style={{ color: '#4ade80', fontSize: 12, marginBottom: 8 }}>
                Selected: Gen {selectedGenome.generation} | Fitness: {selectedGenome.fitness.toFixed(0)} | {selectedGenome.trainedBiome}
              </div>
            ) : (
              <div style={{ color: '#f59e0b', fontSize: 12, marginBottom: 8 }}>
                No genome selected. Train one or select from library.
              </div>
            )}
            <button
              onClick={handleStartTraining}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Train New Genome
            </button>
            <GenomeLibrary
              selectedGenomeId={selectedGenome?.id ?? null}
              onSelect={handleGenomeSelect}
              biomeFilter={config.biome}
            />
          </div>
        )}

        {/* Biome Selection */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>Biome</span>
          <BiomeSelector
            value={config.biome}
            onChange={(biome: BiomeType) => setConfig(prev => ({ ...prev, biome }))}
          />
        </div>

        {/* World Size */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>World Size</span>
          <RadioGroup
            name="worldSize"
            value={config.worldSize}
            onChange={(v) => setConfig(prev => ({ ...prev, worldSize: v as WorldSize }))}
            options={[
              { value: 'small', label: 'Small (48x48)' },
              { value: 'medium', label: 'Medium (64x64)' },
              { value: 'large', label: 'Large (80x80)' },
            ]}
          />
        </div>

        {/* Starting Villagers */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>Starting Villagers</span>
          <RadioGroup
            name="villagers"
            value={config.startingVillagers}
            onChange={(v) => setConfig(prev => ({ ...prev, startingVillagers: v as 5 | 10 | 15 }))}
            options={[
              { value: 5, label: '5' },
              { value: 10, label: '10' },
              { value: 15, label: '15' },
            ]}
          />
        </div>

        {/* Starting Resources */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>Starting Resources</span>
          <RadioGroup
            name="resources"
            value={config.startingResources}
            onChange={(v) => setConfig(prev => ({ ...prev, startingResources: v as ResourceLevel }))}
            options={[
              { value: 'scarce', label: 'Scarce (0.5x)' },
              { value: 'normal', label: 'Normal' },
              { value: 'abundant', label: 'Abundant (2x)' },
            ]}
          />
        </div>

        {/* Event Frequency */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>Event Frequency</span>
          <RadioGroup
            name="events"
            value={config.eventFrequency}
            onChange={(v) => setConfig(prev => ({ ...prev, eventFrequency: v as EventFrequency }))}
            options={[
              { value: 'calm', label: 'Calm' },
              { value: 'normal', label: 'Normal' },
              { value: 'intense', label: 'Intense' },
            ]}
          />
        </div>

        {/* Time Limit */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>Time Limit (days)</span>
          <RadioGroup
            name="timeLimit"
            value={config.timeLimit ?? 0}
            onChange={(v) => setConfig(prev => ({ ...prev, timeLimit: v === 0 ? null : v }))}
            options={[
              { value: 0, label: 'Unlimited' },
              { value: 30, label: '30' },
              { value: 60, label: '60' },
              { value: 90, label: '90' },
            ]}
          />
        </div>

        {/* Seed */}
        <div style={SECTION_STYLE}>
          <span style={LABEL_STYLE}>Seed</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={config.seed}
              onChange={e => setConfig(prev => ({ ...prev, seed: parseInt(e.target.value, 10) || 0 }))}
              style={{
                background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
                color: '#e2e8f0', padding: '4px 8px', fontSize: 13, width: 140,
              }}
            />
            <button onClick={handleRandomSeed} style={{
              background: '#334155', border: 'none', borderRadius: 4,
              color: '#94a3b8', padding: '4px 10px', cursor: 'pointer', fontSize: 12,
            }}>
              Randomize
            </button>
          </div>
        </div>

        {/* Paste Config */}
        <div style={{ ...SECTION_STYLE, borderTop: '1px solid #334155', paddingTop: 12 }}>
          <span style={{ ...LABEL_STYLE, fontSize: 11 }}>Paste Config String</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={configString}
              onChange={e => setConfigString(e.target.value)}
              placeholder="seed=12345&size=medium&..."
              style={{
                background: '#0f172a', border: '1px solid #334155', borderRadius: 4,
                color: '#e2e8f0', padding: '4px 8px', fontSize: 11, flex: 1,
              }}
            />
            <button onClick={handlePasteConfig} style={{
              background: '#334155', border: 'none', borderRadius: 4,
              color: '#94a3b8', padding: '4px 10px', cursor: 'pointer', fontSize: 11,
            }}>
              Apply
            </button>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={!isValid}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 6,
            background: isValid ? '#3b82f6' : '#1e3a5f',
            color: isValid ? '#fff' : '#64748b',
            border: 'none', cursor: isValid ? 'pointer' : 'not-allowed',
            fontSize: 15, fontWeight: 600, marginTop: 8,
          }}
        >
          Start Simulation
        </button>
      </div>

      {/* Training Overlay */}
      {showTraining && trainingState && (
        <TrainingView
          state={trainingState}
          isTraining={isTraining}
          onStop={stopTraining}
          onClose={handleTrainingClose}
          startTime={trainingStartTime.current}
        />
      )}
    </div>
  )
}
