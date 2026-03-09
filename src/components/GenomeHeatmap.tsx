/**
 * GenomeHeatmap: visualizes genome action weights as a colored grid.
 * Rows = actions, Columns = needs. Color: blue (0.0) → white (0.5) → red (1.0).
 */

import { useRef, useEffect } from 'react'
import type { Genome } from '../simulation/ai/genome.ts'
import { ACTION_LIST } from '../simulation/ai/genome.ts'
import { NeedType } from '../simulation/villager.ts'

const NEED_LABELS = ['Hunger', 'Energy', 'Health', 'Warmth', 'Cooling']

function weightToColor(w: number): string {
  // 0.0 = blue (#3b82f6), 0.5 = white (#ffffff), 1.0 = red (#ef4444)
  const clamped = Math.max(0, Math.min(1, w))
  if (clamped <= 0.5) {
    const t = clamped / 0.5
    const r = Math.round(59 + (255 - 59) * t)
    const g = Math.round(130 + (255 - 130) * t)
    const b = Math.round(246 + (255 - 246) * t)
    return `rgb(${r},${g},${b})`
  } else {
    const t = (clamped - 0.5) / 0.5
    const r = Math.round(255 - (255 - 239) * t)
    const g = Math.round(255 - (255 - 68) * t)
    const b = Math.round(255 - (255 - 68) * t)
    return `rgb(${r},${g},${b})`
  }
}

interface GenomeHeatmapProps {
  genome: Genome
  width?: number
}

export function GenomeHeatmap({ genome, width = 280 }: GenomeHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const needCount = genome.needCount
  const actionCount = ACTION_LIST.length

  const cellW = Math.floor((width - 80) / needCount)
  const cellH = 14
  const labelW = 80
  const headerH = 20
  const canvasW = labelW + cellW * needCount
  const canvasH = headerH + cellH * actionCount

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasW, canvasH)
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, canvasW, canvasH)

    // Header labels (needs)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    for (let n = 0; n < needCount; n++) {
      ctx.fillText(NEED_LABELS[n] ?? `N${n}`, labelW + n * cellW + cellW / 2, 14)
    }

    // Action rows
    for (let a = 0; a < actionCount; a++) {
      // Action label
      ctx.fillStyle = '#94a3b8'
      ctx.textAlign = 'right'
      ctx.font = '9px monospace'
      const label = ACTION_LIST[a].replace('build_', 'b:').slice(0, 10)
      ctx.fillText(label, labelW - 4, headerH + a * cellH + 11)

      // Weight cells
      for (let n = 0; n < needCount; n++) {
        const idx = a * needCount + n
        const weight = genome.actionWeights[idx] ?? 0
        ctx.fillStyle = weightToColor(weight)
        ctx.fillRect(labelW + n * cellW + 1, headerH + a * cellH + 1, cellW - 2, cellH - 2)
      }
    }
  }, [genome, canvasW, canvasH, needCount, actionCount, cellW, cellH])

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>
        Genome Weights (Gen {genome.generation} | Fitness: {genome.fitness.toFixed(0)})
      </div>
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        style={{ borderRadius: 4, border: '1px solid #334155' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 10, color: '#64748b' }}>
        <span style={{ color: '#3b82f6' }}>0.0</span>
        <span>—</span>
        <span style={{ color: '#ffffff' }}>0.5</span>
        <span>—</span>
        <span style={{ color: '#ef4444' }}>1.0</span>
      </div>
    </div>
  )
}
