import { useEffect, useRef, useCallback } from 'react'
import { useVoxelStore, type EditMode } from '../store/voxel-store.ts'
import { VoxelRenderer } from '../rendering/voxel-renderer.ts'

const EDIT_MODES: { mode: EditMode; label: string }[] = [
  { mode: 'select', label: 'Select' },
  { mode: 'addSolid', label: '+ Solid' },
  { mode: 'removeSolid', label: '- Remove' },
  { mode: 'addLadder', label: '+ Ladder' },
  { mode: 'addStair', label: '+ Stair' },
]

export function VoxelSandbox() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<VoxelRenderer | null>(null)
  const animFrameRef = useRef<number>(0)
  const terrainBuiltRef = useRef<number>(-1)

  const engine = useVoxelStore(s => s.engine)
  const isRunning = useVoxelStore(s => s.isRunning)
  const metrics = useVoxelStore(s => s.metrics)
  const agents = useVoxelStore(s => s.agents)
  const selectedAgentId = useVoxelStore(s => s.selectedAgentId)
  const editMode = useVoxelStore(s => s.editMode)
  const seed = useVoxelStore(s => s.seed)
  const worldVersion = useVoxelStore(s => s.worldVersion)

  const init = useVoxelStore(s => s.init)
  const start = useVoxelStore(s => s.start)
  const pause = useVoxelStore(s => s.pause)
  const reset = useVoxelStore(s => s.reset)
  const setSeed = useVoxelStore(s => s.setSeed)
  const setEditMode = useVoxelStore(s => s.setEditMode)
  const selectAgent = useVoxelStore(s => s.selectAgent)
  const addAgent = useVoxelStore(s => s.addAgent)
  const assignAgentDestination = useVoxelStore(s => s.assignAgentDestination)
  const editTerrain = useVoxelStore(s => s.editTerrain)

  // Initialize engine on mount, stop simulation on unmount
  useEffect(() => {
    if (!engine) init()
    return () => { pause() }
  }, [engine, init, pause])

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const vr = new VoxelRenderer(canvas)
    rendererRef.current = vr

    const resize = () => {
      const parent = canvas.parentElement
      if (parent) vr.resize(parent.clientWidth, parent.clientHeight)
    }
    resize()
    window.addEventListener('resize', resize)

    // Render loop
    const loop = () => {
      animFrameRef.current = requestAnimationFrame(loop)
      vr.render()
    }
    loop()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animFrameRef.current)
      vr.dispose()
      rendererRef.current = null
    }
  }, [])

  // Rebuild terrain when engine changes or world version bumps
  useEffect(() => {
    const vr = rendererRef.current
    if (!vr || !engine) return
    if (terrainBuiltRef.current === worldVersion) return
    terrainBuiltRef.current = worldVersion
    vr.rebuildTerrain(engine.grid)
  }, [engine, worldVersion])

  // Update agents each frame
  useEffect(() => {
    const vr = rendererRef.current
    if (!vr) return
    vr.updateAgents(agents, selectedAgentId)
  }, [agents, selectedAgentId])

  // Canvas click handler
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const vr = rendererRef.current
    const canvas = canvasRef.current
    if (!vr || !canvas || !engine) return

    const hit = vr.raycast(e.clientX, e.clientY, canvas)
    if (!hit) return

    if (editMode === 'select') {
      // Check if clicking on an agent position
      const clickedAgent = agents.find(
        a => a.position.x === hit.voxel.x &&
             a.position.y === hit.voxel.y &&
             a.position.z === hit.voxel.z
      )
      if (clickedAgent) {
        selectAgent(clickedAgent.id)
      } else if (selectedAgentId !== null) {
        // Assign destination to the face (walkable surface)
        assignAgentDestination(selectedAgentId, hit.face)
      }
    } else if (editMode === 'removeSolid') {
      editTerrain(hit.voxel)
    } else {
      editTerrain(hit.face)
    }
  }, [editMode, agents, selectedAgentId, engine, selectAgent, assignAgentDestination, editTerrain])

  return (
    <div style={{ display: 'flex', height: '100%', background: '#0f172a' }}>
      {/* 3D Viewport */}
      <div style={{ flex: 1, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onClick={handleCanvasClick}
        />
        {/* Edit mode toolbar overlay */}
        <div style={{
          position: 'absolute', top: 8, left: 8,
          display: 'flex', gap: 4, background: 'rgba(15,23,42,0.85)',
          padding: 6, borderRadius: 6,
        }}>
          {EDIT_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => setEditMode(mode)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: editMode === mode ? '2px solid #4488ff' : '1px solid #334155',
                background: editMode === mode ? '#1e3a5f' : '#1e293b',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard Panel */}
      <div style={{
        width: 280, padding: 12, overflowY: 'auto',
        background: '#1e293b', color: '#e2e8f0',
        borderLeft: '1px solid #334155', fontSize: 13,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#94a3b8' }}>Voxel Sandbox</h3>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6 }}>
          {!isRunning ? (
            <button onClick={start} style={btnStyle}>Play</button>
          ) : (
            <button onClick={pause} style={btnStyle}>Pause</button>
          )}
          <button onClick={reset} style={btnStyle}>Reset</button>
        </div>

        {/* Seed */}
        <div>
          <label style={labelStyle}>Seed</label>
          <input
            type="number"
            value={seed}
            onChange={e => setSeed(Number(e.target.value))}
            style={inputStyle}
          />
        </div>

        {/* Metrics */}
        {metrics && (
          <div>
            <label style={labelStyle}>Metrics</label>
            <div style={metricRow}>Tick: {metrics.tick}</div>
            <div style={metricRow}>Agents: {metrics.agentCount}</div>
            <div style={metricRow}>Stuck: {metrics.stuckAgents}</div>
            <div style={metricRow}>Path ms: {metrics.pathfindingTimeMs.toFixed(2)}</div>
            <div style={metricRow}>Errors: {metrics.algorithmErrors}</div>
            <div style={metricRow}>Budget overruns: {metrics.budgetOverruns}</div>
            <div style={metricRow}>Deferred reroutes: {metrics.deferredReroutes}</div>
          </div>
        )}

        {/* Agent List */}
        <div>
          <label style={labelStyle}>Agents</label>
          <button onClick={() => {
            if (engine) {
              const cx = Math.floor(engine.grid.worldSize / 2) + Math.floor(Math.random() * 5)
              const cz = Math.floor(engine.grid.worldSize / 2) + Math.floor(Math.random() * 5)
              // addAgent internally checks isWalkable; try each y from top down
              for (let y = engine.grid.worldSize - 1; y >= 0; y--) {
                addAgent({ x: cx, y, z: cz })
                if (agents.length < useVoxelStore.getState().agents.length) break
              }
            }
          }} style={{ ...btnStyle, fontSize: 11, marginBottom: 4 }}>
            + Add Agent
          </button>
          {agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => selectAgent(agent.id === selectedAgentId ? null : agent.id)}
              style={{
                padding: '4px 8px', marginBottom: 2, borderRadius: 4, cursor: 'pointer',
                background: agent.id === selectedAgentId ? '#1e3a5f' : '#0f172a',
                border: agent.id === selectedAgentId ? '1px solid #4488ff' : '1px solid transparent',
              }}
            >
              <div>Agent #{agent.id} — {agent.state}</div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                ({agent.position.x}, {agent.position.y}, {agent.position.z})
              </div>
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
          <strong>Controls:</strong><br />
          Left-drag: orbit<br />
          Right-drag: pan<br />
          Scroll: zoom<br />
          Click block: select/edit<br />
          Select agent, then click terrain to set destination
        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 4, border: '1px solid #334155',
  background: '#334155', color: '#e2e8f0', cursor: 'pointer', fontSize: 13,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: '#64748b',
  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '4px 8px', borderRadius: 4,
  border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
  fontSize: 13,
}

const metricRow: React.CSSProperties = {
  padding: '2px 0', borderBottom: '1px solid #1e293b',
}
