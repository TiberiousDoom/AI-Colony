/**
 * Export utilities for simulation results.
 * Supports JSON and CSV export formats.
 */

import type { CompetitionState } from '../simulation/competition-engine.ts'
import { getNeed, NeedType } from '../simulation/villager.ts'
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

/** Export detailed diagnostic report for debugging AI behavior */
export function exportDiagnosticJSON(state: CompetitionState): Blob {
  const data = {
    exportedAt: new Date().toISOString(),
    seed: state.config.seed,
    biome: state.config.biome,
    dayCount: state.dayCount,
    season: state.season,
    winner: state.winner,
    globalEvents: state.globalEvents,
    villages: state.villages.map(v => {
      const alive = v.villagers.filter(vl => vl.alive)
      const dead = v.villagers.filter(vl => !vl.alive)

      return {
        id: v.id,
        name: v.name,
        aiType: v.aiSystem.name,
        isEliminated: v.isEliminated,
        eliminationTick: v.eliminationTick,
        eliminationDay: v.eliminationTick !== null ? Math.floor(v.eliminationTick / TIMING.TICKS_PER_DAY) : null,
        eliminationCause: v.eliminationCause,

        // Current state
        populationAlive: alive.length,
        populationDead: dead.length,
        stockpile: v.stockpile,
        structures: v.structures.map(s => s.type),

        // Per-villager diagnostics
        villagers: v.villagers.map(vl => {
          const needs: Record<string, number> = {}
          for (const [type, need] of vl.needs) {
            needs[type] = Math.round(need.current * 10) / 10
          }
          return {
            name: vl.name,
            alive: vl.alive,
            position: vl.position,
            currentAction: vl.currentAction,
            needs,
            statusEffects: vl.statusEffects.map(e => e.type),
            lastDecision: vl.lastDecision?.reason ?? null,
          }
        }),

        // Death timeline: when and likely why each villager died
        deathTimeline: v.events
          .filter(e => e.type === 'death')
          .map(e => ({
            day: e.day,
            tick: e.tick,
            message: e.message,
            // Find what was happening around the death
            nearbyEvents: v.events
              .filter(ne => Math.abs(ne.tick - e.tick) <= TIMING.TICKS_PER_DAY && ne.type !== 'death')
              .map(ne => ({ day: ne.day, type: ne.type, message: ne.message })),
          })),

        // Snapshot history with health/hunger/energy details
        snapshotSummary: v.history.daily.map(snap => ({
          day: Math.round(snap.day * 10) / 10,
          season: snap.season,
          population: snap.population,
          prosperity: Math.round(snap.prosperityScore),
          food: Math.round(snap.food),
          wood: Math.round(snap.wood),
          stone: Math.round(snap.stone),
          avgHealth: Math.round(snap.avgHealth),
          avgHunger: Math.round(snap.avgHunger),
          avgEnergy: Math.round(snap.avgEnergy),
          topActivity: Object.entries(snap.activityBreakdown)
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([action, count]) => `${action}:${count}`),
        })),

        // All village events (compact)
        eventLog: v.events.map(e => ({
          day: e.day,
          type: e.type,
          message: e.message,
        })),
      }
    }),
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
