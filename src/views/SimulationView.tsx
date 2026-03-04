/**
 * SimulationView: PixiJS-based dual village renderer.
 * Creates a single PixiJS Application with two VillageRenderer viewports.
 * The render loop runs on rAF, reading store.getState() directly (decoupled from React).
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Application } from 'pixi.js'
import { useSimulationStore } from '../store/simulation-store.ts'
import { SpriteManager } from '../rendering/sprite-manager.ts'
import { VillageRenderer } from '../rendering/village-renderer.ts'
import { VillagerInspector } from '../components/VillagerInspector.tsx'
import { VILLAGE_COLORS } from '../rendering/palette.ts'
import type { Villager } from '../simulation/villager.ts'
import type { VillageState } from '../simulation/competition-engine.ts'

interface SelectedVillager {
  villagerId: string
  villageId: string
  villageIndex: number
}

export function SimulationView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const spriteManagerRef = useRef<SpriteManager | null>(null)
  const renderersRef = useRef<VillageRenderer[]>([])
  const rafRef = useRef<number>(0)
  const [loading, setLoading] = useState(true)
  const [contextLost, setContextLost] = useState(false)
  const [selection, setSelection] = useState<SelectedVillager | null>(null)
  const lastTickRef = useRef(0)

  // Track focused viewport (0 = left, 1 = right)
  const focusedViewportRef = useRef(0)

  const initPixi = useCallback(async () => {
    if (!containerRef.current) return
    if (appRef.current) return // Already initialized

    const app = new Application()
    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    await app.init({
      width,
      height,
      background: 0x0a0e1a,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    container.appendChild(app.canvas)
    appRef.current = app

    // Context loss handling
    const canvas = app.canvas as HTMLCanvasElement
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      setContextLost(true)
      cancelAnimationFrame(rafRef.current)
    })
    canvas.addEventListener('webglcontextrestored', () => {
      setContextLost(false)
    })

    // Initialize sprite manager
    const spriteManager = new SpriteManager()
    spriteManager.init(app.renderer)
    spriteManagerRef.current = spriteManager

    // Get initial state to create renderers
    const state = useSimulationStore.getState().competitionState
    if (state && state.villages.length >= 2) {
      const halfWidth = Math.floor(width / 2)
      for (let i = 0; i < 2; i++) {
        const village = state.villages[i]
        const color = VILLAGE_COLORS[village.id] ?? (i === 0 ? 0x3b82f6 : 0xf97316)
        const renderer = new VillageRenderer(spriteManager, color, village.world.width, village.world.height)
        renderer.init(i * halfWidth, halfWidth, height)
        app.stage.addChild(renderer.rootContainer)
        renderersRef.current.push(renderer)
      }
    }

    setLoading(false)
    startRenderLoop()
  }, [])

  const startRenderLoop = useCallback(() => {
    let lastTime = performance.now()

    function renderFrame() {
      const now = performance.now()
      const deltaMs = now - lastTime
      lastTime = now

      const store = useSimulationStore.getState()
      const state = store.competitionState
      if (!state || state.villages.length < 2) {
        rafRef.current = requestAnimationFrame(renderFrame)
        return
      }

      // Compute tickProgress from accumulator
      const currentTick = state.tick
      const tickProgress = currentTick !== lastTickRef.current ? 0 : Math.min(1, deltaMs / 100)
      lastTickRef.current = currentTick

      for (let i = 0; i < Math.min(2, renderersRef.current.length); i++) {
        renderersRef.current[i].render(
          state.villages[i],
          state.timeOfDay,
          state.season,
          tickProgress,
          deltaMs,
          currentTick,
        )
      }

      appRef.current?.render()
      rafRef.current = requestAnimationFrame(renderFrame)
    }

    rafRef.current = requestAnimationFrame(renderFrame)
  }, [])

  // Initialize on mount
  useEffect(() => {
    initPixi()

    return () => {
      cancelAnimationFrame(rafRef.current)
      for (const r of renderersRef.current) r.destroy()
      renderersRef.current = []
      spriteManagerRef.current?.destroy()
      spriteManagerRef.current = null
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
      }
    }
  }, [initPixi])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !appRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      appRef.current.renderer.resize(w, h)
      const half = Math.floor(w / 2)
      renderersRef.current.forEach((r, i) => r.resize(i * half, half, h))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Mouse/pointer event handling
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const half = rect.width / 2
    const viewportIdx = x < half ? 0 : 1
    focusedViewportRef.current = viewportIdx

    // Left click = select villager
    if (e.button === 0) {
      const localX = x - viewportIdx * half
      const localY = e.clientY - rect.top
      const renderer = renderersRef.current[viewportIdx]
      if (renderer) {
        const villagerId = renderer.hitTest(localX, localY)
        const state = useSimulationStore.getState().competitionState
        if (villagerId && state) {
          const village = state.villages[viewportIdx]
          setSelection({ villagerId, villageId: village.id, villageIndex: viewportIdx })
          renderer.setSelectedVillager(villagerId)
        } else {
          setSelection(null)
          renderer.setSelectedVillager(null)
        }
      }
    }
  }, [])

  // Drag to pan
  const draggingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })

  const handlePointerMoveForPan = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dx = e.clientX - lastPointerRef.current.x
    const dy = e.clientY - lastPointerRef.current.y
    lastPointerRef.current = { x: e.clientX, y: e.clientY }

    const renderer = renderersRef.current[focusedViewportRef.current]
    if (renderer) {
      renderer.camera.pan(dx, dy)
    }
  }, [])

  const handlePointerDownForPan = useCallback((e: React.PointerEvent) => {
    if (e.button === 2 || e.button === 1) {
      draggingRef.current = true
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      e.preventDefault()
    }
  }, [])

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  // Wheel to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const half = rect.width / 2
    const viewportIdx = x < half ? 0 : 1
    const localX = x - viewportIdx * half
    const localY = e.clientY - rect.top

    const renderer = renderersRef.current[viewportIdx]
    if (renderer) {
      renderer.camera.zoomAt(localX, localY, e.deltaY, half, rect.height)
    }
  }, [])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const renderer = renderersRef.current[focusedViewportRef.current]
      if (!renderer) return

      const PAN_SPEED = 40
      switch (e.key) {
        case 'ArrowLeft': renderer.camera.pan(PAN_SPEED, 0); break
        case 'ArrowRight': renderer.camera.pan(-PAN_SPEED, 0); break
        case 'ArrowUp': renderer.camera.pan(0, PAN_SPEED); break
        case 'ArrowDown': renderer.camera.pan(0, -PAN_SPEED); break
        case '+': case '=': renderer.camera.zoom = Math.min(renderer.camera.maxZoom, renderer.camera.zoom * 1.2); break
        case '-': renderer.camera.zoom = Math.max(renderer.camera.minZoom, renderer.camera.zoom / 1.2); break
        case 'Escape':
          setSelection(null)
          renderer.setSelectedVillager(null)
          break
        case '[': case ']': {
          // Cycle selected villager
          const ids = renderer.getVillagerIds()
          if (ids.length === 0) break
          const currentIdx = selection ? ids.indexOf(selection.villagerId) : -1
          const nextIdx = e.key === ']'
            ? (currentIdx + 1) % ids.length
            : (currentIdx - 1 + ids.length) % ids.length
          const nextId = ids[nextIdx]
          const state = useSimulationStore.getState().competitionState
          if (state) {
            setSelection({ villagerId: nextId, villageId: state.villages[focusedViewportRef.current].id, villageIndex: focusedViewportRef.current })
            renderer.setSelectedVillager(nextId)
          }
          break
        }
        case 'Tab':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            useSimulationStore.getState().setViewMode('metrics')
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selection])

  // Get selected villager data for inspector
  const state = useSimulationStore(s => s.competitionState)
  let selectedVillager: Villager | null = null
  let selectedVillage: VillageState | null = null
  if (selection && state) {
    selectedVillage = state.villages[selection.villageIndex] ?? null
    selectedVillager = selectedVillage?.villagers.find(v => v.id === selection.villagerId) ?? null
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#94a3b8', fontSize: 14, zIndex: 10, background: '#0a0e1a',
        }}>
          Loading simulation view...
        </div>
      )}

      {contextLost && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#f87171', fontSize: 14, zIndex: 20, background: '#0a0e1aee', cursor: 'pointer',
          }}
          onClick={() => {
            setContextLost(false)
            // Re-init
            for (const r of renderersRef.current) r.destroy()
            renderersRef.current = []
            if (appRef.current) {
              appRef.current.destroy(true, { children: true })
              appRef.current = null
            }
            setLoading(true)
            initPixi()
          }}
        >
          WebGL context lost — click to restore
        </div>
      )}

      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        onPointerDown={(e) => { handlePointerDown(e); handlePointerDownForPan(e) }}
        onPointerMove={handlePointerMoveForPan}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Village labels */}
      {state && state.villages.length >= 2 && !loading && (
        <>
          <div style={{ position: 'absolute', top: 8, left: 12, color: '#3b82f6', fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
            {state.villages[0].name}
          </div>
          <div style={{ position: 'absolute', top: 8, right: 12, color: '#f97316', fontSize: 12, fontWeight: 600, opacity: 0.7, textAlign: 'right' }}>
            {state.villages[1].name}
          </div>
        </>
      )}

      {/* Inspector */}
      {selectedVillager && selectedVillage && (
        <VillagerInspector
          villager={selectedVillager}
          villageName={selectedVillage.name}
          villageColor={selectedVillage.id === 'utility' ? '#3b82f6' : '#f97316'}
          aiName={selectedVillage.aiSystem.name}
          scores={selectedVillager.lastDecision?.scores}
          onClose={() => {
            setSelection(null)
            renderersRef.current[selection!.villageIndex]?.setSelectedVillager(null)
          }}
        />
      )}
    </div>
  )
}
