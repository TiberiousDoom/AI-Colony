/**
 * Export utilities for simulation results.
 * Supports JSON and CSV export formats.
 */

import type { CompetitionState } from '../simulation/competition-engine.ts'

/** Export full competition state as JSON */
export function exportRunJSON(state: CompetitionState): Blob {
  const data = {
    exportedAt: new Date().toISOString(),
    config: state.config,
    tick: state.tick,
    dayCount: state.dayCount,
    season: state.season,
    isOver: state.isOver,
    winner: state.winner,
    villages: state.villages.map(v => ({
      id: v.id,
      name: v.name,
      isEliminated: v.isEliminated,
      eliminationTick: v.eliminationTick,
      eliminationCause: v.eliminationCause,
      population: v.villagers.filter(vl => vl.alive).length,
      stockpile: v.stockpile,
      structureCount: v.structures.length,
      structures: v.structures.map(s => ({ type: s.type, x: s.position.x, y: s.position.y })),
      history: v.history,
      events: v.events,
    })),
    globalEvents: state.globalEvents,
  }
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

/** Export daily metrics as CSV */
export function exportMetricsCSV(state: CompetitionState): Blob {
  const headers = ['day']
  for (const v of state.villages) {
    headers.push(
      `${v.id}_population`,
      `${v.id}_prosperity`,
      `${v.id}_food`,
      `${v.id}_wood`,
      `${v.id}_stone`,
    )
  }

  const rows: string[] = [headers.join(',')]

  // Find max history length
  const maxDays = Math.max(...state.villages.map(v => v.history.daily.length))

  for (let d = 0; d < maxDays; d++) {
    const row: (string | number)[] = [d + 1]
    for (const v of state.villages) {
      const snap = v.history.daily[d]
      if (snap) {
        row.push(snap.population, snap.prosperityScore, snap.food, snap.wood, snap.stone)
      } else {
        row.push('', '', '', '', '')
      }
    }
    rows.push(row.join(','))
  }

  return new Blob([rows.join('\n')], { type: 'text/csv' })
}

/** Export the prosperity chart as a PNG image */
export async function exportChartPNG(): Promise<Blob | null> {
  const svgEl = document.querySelector('.recharts-wrapper svg') as SVGSVGElement | null
  if (!svgEl) return null

  const serializer = new XMLSerializer()
  const svgString = serializer.serializeToString(svgEl)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const { width, height } = svgEl.getBoundingClientRect()

  return new Promise<Blob | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width * 2   // 2x for retina
      canvas.height = height * 2
      const ctx = canvas.getContext('2d')!
      ctx.scale(2, 2)
      ctx.fillStyle = '#0f172a'  // dark background matching the app
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        resolve(blob)
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/** Trigger browser download of a blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
