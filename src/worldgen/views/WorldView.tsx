import { useEffect, useRef } from 'react'
import { useWorldgenStore } from '../store/worldgen-store.ts'
import { WorldgenRenderer } from '../rendering/worldgen-renderer.ts'
import { ALL_GENERATORS } from '../generation/registry.ts'

export function WorldView() {
  const { results, selectedAlgorithms, vizMode, crossSectionY } = useWorldgenStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const renderersRef = useRef<Map<string, WorldgenRenderer>>(new Map())
  const canvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const animFrameRef = useRef<number>(0)

  const activeGenerators = ALL_GENERATORS.filter(
    g => selectedAlgorithms.includes(g.id) && results.has(g.id),
  )

  useEffect(() => {
    // Clean up old renderers for removed generators
    const activeIds = new Set(activeGenerators.map(g => g.id))
    for (const [id, renderer] of renderersRef.current) {
      if (!activeIds.has(id)) {
        renderer.dispose()
        renderersRef.current.delete(id)
        const canvas = canvasesRef.current.get(id)
        if (canvas && canvas.parentElement) {
          canvas.parentElement.removeChild(canvas)
        }
        canvasesRef.current.delete(id)
      }
    }

    if (!containerRef.current || activeGenerators.length === 0) return

    const container = containerRef.current
    const cols = Math.min(activeGenerators.length, 3)
    const rows = Math.ceil(activeGenerators.length / cols)

    for (const gen of activeGenerators) {
      let canvas = canvasesRef.current.get(gen.id)
      if (!canvas) {
        canvas = document.createElement('canvas')
        canvas.style.borderRadius = '8px'
        canvas.style.border = '1px solid #334155'
        container.appendChild(canvas)
        canvasesRef.current.set(gen.id, canvas)
      }

      const idx = activeGenerators.indexOf(gen)
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const w = Math.floor(container.clientWidth / cols) - 8
      const h = Math.floor((container.clientHeight - 30 * rows) / rows) - 8
      canvas.style.position = 'absolute'
      canvas.style.left = `${col * (w + 8) + 4}px`
      canvas.style.top = `${row * (h + 30 + 8) + 30}px`
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`

      let renderer = renderersRef.current.get(gen.id)
      if (!renderer) {
        renderer = new WorldgenRenderer(canvas)
        renderersRef.current.set(gen.id, renderer)
      }

      renderer.resize(w, h)
      renderer.setCrossSectionY(crossSectionY)
      const result = results.get(gen.id)
      if (result) {
        renderer.rebuildTerrain(result.grid, vizMode, result.biomeMap, result.heightMap)
      }
    }

    // Add labels
    const existingLabels = container.querySelectorAll('.gen-label')
    existingLabels.forEach(l => l.remove())
    for (const gen of activeGenerators) {
      const idx = activeGenerators.indexOf(gen)
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const w = Math.floor(container.clientWidth / cols) - 8
      const h = Math.floor((container.clientHeight - 30 * rows) / rows) - 8

      const label = document.createElement('div')
      label.className = 'gen-label'
      label.textContent = gen.name
      label.style.cssText = `
        position: absolute;
        left: ${col * (w + 8) + 4}px;
        top: ${row * (h + 30 + 8) + 4}px;
        color: #f59e0b;
        font-size: 0.8rem;
        font-weight: 600;
      `
      container.appendChild(label)
    }

    // Animation loop
    function animate() {
      for (const renderer of renderersRef.current.values()) {
        renderer.render()
      }
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [activeGenerators.length, vizMode, results, crossSectionY])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      for (const renderer of renderersRef.current.values()) {
        renderer.dispose()
      }
      renderersRef.current.clear()
      canvasesRef.current.clear()
    }
  }, [])

  if (activeGenerators.length === 0) {
    return (
      <div style={{ padding: '2rem', color: '#94a3b8', textAlign: 'center' }}>
        Generate worlds first to see 3D views.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  )
}
