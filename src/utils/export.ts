/**
 * Export utilities for simulation results.
 * Supports JSON and CSV export formats.
 */

import type { CompetitionState } from '../simulation/competition-engine.ts'
import { TIMING } from '../config/game-constants.ts'

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

/** Export detailed diagnostic report as human-readable text */
export function exportDiagnosticText(state: CompetitionState): Blob {
  const lines: string[] = []
  const hr = '='.repeat(72)
  const hr2 = '-'.repeat(72)

  lines.push(hr)
  lines.push('AI COLONY — DIAGNOSTIC REPORT')
  lines.push(hr)
  lines.push(`Exported:  ${new Date().toISOString()}`)
  lines.push(`Seed:      ${state.config.seed}`)
  lines.push(`Biome:     ${state.config.biome}`)
  lines.push(`Day:       ${state.dayCount}`)
  lines.push(`Season:    ${state.season}`)
  lines.push(`Winner:    ${state.winner ?? 'none'}`)
  lines.push('')

  if (state.globalEvents.length > 0) {
    lines.push('GLOBAL EVENTS')
    lines.push(hr2)
    for (const e of state.globalEvents) {
      lines.push(`  Day ${e.day}  [${e.type}]  ${e.message}`)
    }
    lines.push('')
  }

  for (const v of state.villages) {
    const alive = v.villagers.filter(vl => vl.alive)
    const dead = v.villagers.filter(vl => !vl.alive)

    lines.push(hr)
    lines.push(`VILLAGE: ${v.name}  (${v.aiSystem.name} AI)`)
    lines.push(hr)
    lines.push(`Status:       ${v.isEliminated ? 'ELIMINATED' : 'Active'}`)
    if (v.eliminationTick !== null) {
      lines.push(`Eliminated:   tick ${v.eliminationTick} (day ${Math.floor(v.eliminationTick / TIMING.TICKS_PER_DAY)})`)
      lines.push(`Cause:        ${v.eliminationCause ?? 'unknown'}`)
    }
    lines.push(`Population:   ${alive.length} alive, ${dead.length} dead`)
    lines.push(`Stockpile:    food=${v.stockpile.food}  wood=${v.stockpile.wood}  stone=${v.stockpile.stone}`)
    lines.push(`Structures:   ${v.structures.length > 0 ? v.structures.map(s => s.type).join(', ') : 'none'}`)
    lines.push('')

    // Per-villager diagnostics
    lines.push('  VILLAGERS')
    lines.push('  ' + hr2)
    for (const vl of v.villagers) {
      const needs: string[] = []
      for (const [type, need] of vl.needs) {
        needs.push(`${type}=${Math.round(need.current * 10) / 10}`)
      }
      const status = vl.alive ? 'alive' : 'DEAD'
      const effects = vl.statusEffects.length > 0 ? `  effects=[${vl.statusEffects.map(e => e.type).join(',')}]` : ''
      const decision = vl.lastDecision?.reason ? `  last="${vl.lastDecision.reason}"` : ''
      lines.push(`  ${vl.name.padEnd(12)} [${status}]  action=${vl.currentAction}  ${needs.join('  ')}${effects}${decision}`)
    }
    lines.push('')

    // Death timeline
    const deaths = v.events.filter(e => e.type === 'death')
    if (deaths.length > 0) {
      lines.push('  DEATH TIMELINE')
      lines.push('  ' + hr2)
      for (const e of deaths) {
        lines.push(`  Day ${e.day} (tick ${e.tick}): ${e.message}`)
        const nearby = v.events
          .filter(ne => Math.abs(ne.tick - e.tick) <= TIMING.TICKS_PER_DAY && ne.type !== 'death')
          .slice(0, 5)
        for (const ne of nearby) {
          lines.push(`    > [${ne.type}] ${ne.message}`)
        }
      }
      lines.push('')
    }

    // Snapshot history
    if (v.history.daily.length > 0) {
      lines.push('  DAILY SNAPSHOTS')
      lines.push('  ' + hr2)
      lines.push('  Day    Season   Pop  Prosp  Food  Wood  Stone  AvgHP  AvgHng  AvgNrg  Top Activity')
      lines.push('  ' + '-'.repeat(95))
      for (const snap of v.history.daily) {
        const top = Object.entries(snap.activityBreakdown)
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([action, count]) => `${action}:${count}`)
          .join(' ')
        lines.push(
          `  ${String(Math.round(snap.day * 10) / 10).padEnd(6)} ` +
          `${snap.season.padEnd(8)} ` +
          `${String(snap.population).padStart(3)}  ` +
          `${String(Math.round(snap.prosperityScore)).padStart(5)}  ` +
          `${String(Math.round(snap.food)).padStart(4)}  ` +
          `${String(Math.round(snap.wood)).padStart(4)}  ` +
          `${String(Math.round(snap.stone)).padStart(5)}  ` +
          `${String(Math.round(snap.avgHealth)).padStart(5)}  ` +
          `${String(Math.round(snap.avgHunger)).padStart(6)}  ` +
          `${String(Math.round(snap.avgEnergy)).padStart(6)}  ` +
          top,
        )
      }
      lines.push('')
    }

    // Event log
    if (v.events.length > 0) {
      lines.push('  EVENT LOG')
      lines.push('  ' + hr2)
      for (const e of v.events) {
        lines.push(`  Day ${e.day}  [${e.type}]  ${e.message}`)
      }
      lines.push('')
    }
  }

  return new Blob([lines.join('\n')], { type: 'text/plain' })
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
  const maxSnapshots = Math.max(...state.villages.map(v => v.history.daily.length))

  for (let d = 0; d < maxSnapshots; d++) {
    const firstSnap = state.villages.find(v => v.history.daily[d])?.history.daily[d]
    const row: (string | number)[] = [firstSnap ? Number(firstSnap.day.toFixed(2)) : d]
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
