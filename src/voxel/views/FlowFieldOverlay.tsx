/**
 * Flow field debug overlay — renders flow vectors, layer boundaries,
 * and transition points as an HTML overlay on top of the comparison panel.
 *
 * Uses a canvas element with 2D rendering for the vector arrows.
 * Each cell shows a small arrow indicating the flow direction.
 */

import { useRef, useEffect, useCallback } from 'react'
import type { FlowField } from '../pathfinding/flow-field-dijkstra.ts'

interface FlowFieldOverlayProps {
  field: FlowField | null
  layerId: number
  worldSize: number
  width: number
  height: number
}

const LAYER_COLORS = [
  '#60a5fa', '#34d399', '#f59e0b', '#a78bfa',
  '#fb7185', '#38bdf8', '#4ade80', '#facc15',
]

export function FlowFieldOverlay({ field, layerId, worldSize, width, height }: FlowFieldOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !field) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cellW = width / worldSize
    const cellH = height / worldSize

    ctx.clearRect(0, 0, width, height)

    const layer = field.layers.get(layerId)
    if (!layer) return

    const color = LAYER_COLORS[layerId % LAYER_COLORS.length]

    for (let x = 0; x < worldSize; x++) {
      for (let z = 0; z < worldSize; z++) {
        const ci = x * worldSize + z
        const cost = layer.costGrid[ci]
        if (!isFinite(cost)) continue

        const fi = (x * worldSize + z) * 2
        const dx = layer.flowGrid[fi]
        const dz = layer.flowGrid[fi + 1]

        const cx = x * cellW + cellW / 2
        const cz = z * cellH + cellH / 2

        // Transition point marker
        if (dx === 127 && dz === 127) {
          ctx.fillStyle = '#ef4444'
          ctx.beginPath()
          ctx.arc(cx, cz, cellW * 0.3, 0, Math.PI * 2)
          ctx.fill()
          continue
        }

        // Skip zero vectors (destination or unreachable)
        if (dx === 0 && dz === 0) {
          // Destination marker
          if (cost === 0) {
            ctx.fillStyle = '#22c55e'
            ctx.beginPath()
            ctx.arc(cx, cz, cellW * 0.4, 0, Math.PI * 2)
            ctx.fill()
          }
          continue
        }

        // Draw arrow
        const arrowLen = cellW * 0.35
        const ex = cx + dx * arrowLen
        const ez = cz + dz * arrowLen

        // Fade color by cost
        const maxCost = worldSize * 2
        const alpha = Math.max(0.2, 1 - cost / maxCost)

        ctx.strokeStyle = color
        ctx.globalAlpha = alpha
        ctx.lineWidth = 1

        ctx.beginPath()
        ctx.moveTo(cx, cz)
        ctx.lineTo(ex, ez)
        ctx.stroke()

        // Arrowhead
        const headLen = cellW * 0.15
        const angle = Math.atan2(dz, dx)
        ctx.beginPath()
        ctx.moveTo(ex, ez)
        ctx.lineTo(
          ex - headLen * Math.cos(angle - 0.5),
          ez - headLen * Math.sin(angle - 0.5),
        )
        ctx.moveTo(ex, ez)
        ctx.lineTo(
          ex - headLen * Math.cos(angle + 0.5),
          ez - headLen * Math.sin(angle + 0.5),
        )
        ctx.stroke()

        ctx.globalAlpha = 1
      }
    }
  }, [field, layerId, worldSize, width, height])

  useEffect(() => {
    draw()
  }, [draw])

  if (!field) return null

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        opacity: 0.7,
      }}
    />
  )
}
