/**
 * Custom scenario editor — create scenarios via a simple UI.
 *
 * Provides a grid where users can place blocks, set agent spawn/destination
 * pairs, and save/load scenarios as JSON.
 */

import { useState, useRef } from 'react'
import { BlockType } from '../world/block-types.ts'
import type { CustomScenarioJSON } from '../simulation/scenarios/custom-scenario.ts'

const BLOCK_PALETTE: { type: BlockType; label: string; color: string }[] = [
  { type: BlockType.Air, label: 'Air', color: '#1e293b' },
  { type: BlockType.Solid, label: 'Solid', color: '#64748b' },
  { type: BlockType.Ladder, label: 'Ladder', color: '#a78bfa' },
  { type: BlockType.Stair, label: 'Stair', color: '#f59e0b' },
  { type: BlockType.Platform, label: 'Platform', color: '#38bdf8' },
]

interface AgentDef {
  spawn: { x: number; y: number; z: number }
  destination: { x: number; y: number; z: number }
}

interface ScenarioEditorProps {
  onSave: (json: string) => void
  onClose: () => void
}

export function ScenarioEditor({ onSave, onClose }: ScenarioEditorProps) {
  const [name, setName] = useState('Custom Scenario')
  const [worldSize, setWorldSize] = useState(16)
  const [totalTicks, setTotalTicks] = useState(500)
  const [seed, setSeed] = useState(1)
  const [selectedBlock, setSelectedBlock] = useState(BlockType.Solid)
  const [viewY, setViewY] = useState(0)
  const [blocks, setBlocks] = useState<Map<string, BlockType>>(new Map())
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [placingAgent, setPlacingAgent] = useState<'spawn' | 'dest' | null>(null)
  const [pendingSpawn, setPendingSpawn] = useState<{ x: number; y: number; z: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const cellSize = Math.min(24, Math.floor(400 / worldSize))

  function handleCellClick(x: number, z: number) {
    const y = viewY
    const key = `${x},${y},${z}`

    if (placingAgent === 'spawn') {
      setPendingSpawn({ x, y, z })
      setPlacingAgent('dest')
      return
    }

    if (placingAgent === 'dest' && pendingSpawn) {
      setAgents(prev => [...prev, { spawn: pendingSpawn, destination: { x, y, z } }])
      setPendingSpawn(null)
      setPlacingAgent(null)
      return
    }

    if (selectedBlock === BlockType.Air) {
      setBlocks(prev => { const m = new Map(prev); m.delete(key); return m })
    } else {
      setBlocks(prev => new Map(prev).set(key, selectedBlock))
    }
  }

  function getCellColor(x: number, z: number): string {
    const key = `${x},${viewY},${z}`
    const block = blocks.get(key)
    if (block !== undefined) {
      return BLOCK_PALETTE.find(p => p.type === block)?.color ?? '#1e293b'
    }
    return '#0f172a'
  }

  function exportJSON(): string {
    const blockArray: CustomScenarioJSON['blocks'] = []
    for (const [key, type] of blocks) {
      const [x, y, z] = key.split(',').map(Number)
      blockArray.push({ x, y, z, type })
    }

    const data: CustomScenarioJSON = {
      name,
      worldSize,
      seed,
      totalTicks,
      blocks: blockArray,
      agents: agents.map(a => ({
        spawn: { ...a.spawn },
        destination: { ...a.destination },
      })),
    }

    return JSON.stringify(data, null, 2)
  }

  function handleSave() {
    onSave(exportJSON())
  }

  function handleDownload() {
    const json = exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleLoad() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data: CustomScenarioJSON = JSON.parse(reader.result as string)
        setName(data.name)
        setWorldSize(data.worldSize)
        setSeed(data.seed)
        setTotalTicks(data.totalTicks)
        const newBlocks = new Map<string, BlockType>()
        for (const b of data.blocks) {
          newBlocks.set(`${b.x},${b.y},${b.z}`, b.type as BlockType)
        }
        setBlocks(newBlocks)
        setAgents(data.agents ?? [])
      } catch {
        // ignore parse errors
      }
    }
    reader.readAsText(file)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#1e293b', borderRadius: 8, padding: 20, maxWidth: 700,
        maxHeight: '90vh', overflow: 'auto', color: '#e2e8f0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Scenario Editor</h2>
          <button onClick={onClose} style={closeBtnStyle}>X</button>
        </div>

        {/* Config */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', fontSize: 12 }}>
          <label>Name: <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></label>
          <label>Size: <input type="number" value={worldSize} onChange={e => setWorldSize(Number(e.target.value))} style={{ ...inputStyle, width: 50 }} /></label>
          <label>Ticks: <input type="number" value={totalTicks} onChange={e => setTotalTicks(Number(e.target.value))} style={{ ...inputStyle, width: 60 }} /></label>
          <label>Seed: <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} style={{ ...inputStyle, width: 60 }} /></label>
        </div>

        {/* Y-level selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12 }}>
          <span style={{ color: '#94a3b8' }}>Y Level:</span>
          <button onClick={() => setViewY(Math.max(0, viewY - 1))} style={smallBtnStyle}>-</button>
          <span style={{ fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{viewY}</span>
          <button onClick={() => setViewY(viewY + 1)} style={smallBtnStyle}>+</button>
        </div>

        {/* Block palette */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {BLOCK_PALETTE.map(p => (
            <button
              key={p.type}
              onClick={() => { setPlacingAgent(null); setSelectedBlock(p.type) }}
              style={{
                padding: '4px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                border: selectedBlock === p.type && !placingAgent ? '2px solid #60a5fa' : '1px solid #334155',
                background: p.color, color: '#e2e8f0',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPlacingAgent('spawn')}
            style={{
              ...smallBtnStyle,
              border: placingAgent ? '2px solid #22c55e' : '1px solid #334155',
              background: '#166534',
            }}
          >
            {placingAgent === 'spawn' ? 'Click Spawn...' : placingAgent === 'dest' ? 'Click Dest...' : '+ Agent'}
          </button>
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${worldSize}, ${cellSize}px)`,
          gap: 1, background: '#334155', marginBottom: 12,
        }}>
          {Array.from({ length: worldSize }, (_, z) =>
            Array.from({ length: worldSize }, (_, x) => (
              <div
                key={`${x},${z}`}
                onClick={() => handleCellClick(x, z)}
                style={{
                  width: cellSize, height: cellSize, cursor: 'pointer',
                  background: getCellColor(x, z),
                }}
              />
            )),
          )}
        </div>

        {/* Agents list */}
        {agents.length > 0 && (
          <div style={{ fontSize: 11, marginBottom: 12 }}>
            <div style={{ color: '#94a3b8', marginBottom: 4 }}>Agents ({agents.length}):</div>
            {agents.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>#{i + 1}: ({a.spawn.x},{a.spawn.y},{a.spawn.z}) → ({a.destination.x},{a.destination.y},{a.destination.z})</span>
                <button onClick={() => setAgents(prev => prev.filter((_, j) => j !== i))} style={{ ...smallBtnStyle, fontSize: 10, padding: '1px 4px' }}>x</button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} style={actionBtnStyle}>Run Scenario</button>
          <button onClick={handleDownload} style={{ ...actionBtnStyle, background: '#334155' }}>Download JSON</button>
          <button onClick={handleLoad} style={{ ...actionBtnStyle, background: '#334155' }}>Load JSON</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '2px 6px', borderRadius: 4, border: '1px solid #334155',
  background: '#0f172a', color: '#e2e8f0', fontSize: 12, width: 120,
}

const smallBtnStyle: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, border: '1px solid #334155',
  background: '#334155', color: '#e2e8f0', cursor: 'pointer', fontSize: 12,
}

const actionBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 4, border: '1px solid #334155',
  background: '#1e3a5f', color: '#e2e8f0', cursor: 'pointer', fontSize: 13,
}

const closeBtnStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 4, border: 'none',
  background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 16,
}
