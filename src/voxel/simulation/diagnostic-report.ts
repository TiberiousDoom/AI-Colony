import type { SimulationMetrics } from './simulation-engine.ts'
import type { LogEntry } from './event-logger.ts'
import type { Agent } from '../agents/agent.ts'

export interface DiagnosticInput {
  name: string
  algorithm: string
  worldSize: number
  seed: number
  totalTicks: number
  metrics: SimulationMetrics
  events: ReadonlyArray<LogEntry>
  agents: ReadonlyArray<Agent>
}

interface AlgorithmData {
  metrics: SimulationMetrics
  events: ReadonlyArray<LogEntry>
  agents: ReadonlyArray<Agent>
}

export interface ComparisonDiagnosticInput {
  name: string
  worldSize: number
  seed: number
  totalTicks: number
  astar: AlgorithmData
  hpastar: AlgorithmData
  flowfield?: AlgorithmData
  dstar?: AlgorithmData
}

function fmtCoord(c: Record<string, unknown>): string {
  return `(${c.x}, ${c.y}, ${c.z})`
}

function fmtEvent(evt: LogEntry): string {
  const d = evt.data
  switch (evt.type) {
    case 'destination_assigned':
      return `Agent #${d.agentId} assigned ${fmtCoord(d.from as Record<string, unknown>)} → ${fmtCoord(d.to as Record<string, unknown>)} (path: ${d.pathLength} steps)`
    case 'destination_reached':
      return `Agent #${d.agentId} arrived at ${fmtCoord(d.position as Record<string, unknown>)} in ${d.ticksTaken} ticks`
    case 'agent_stuck':
      return `Agent #${d.agentId} stuck at ${fmtCoord(d.position as Record<string, unknown>)}`
    case 'agent_waiting':
      return `Agent #${d.agentId} waiting at ${fmtCoord(d.position as Record<string, unknown>)}`
    case 'agent_reroute':
      return `Agent #${d.agentId} rerouting (${d.reason})`
    case 'terrain_change':
      return `Terrain ${d.changeType} at ${fmtCoord(d.pos as Record<string, unknown>)}`
    default:
      return JSON.stringify(d)
  }
}

export function generateDiagnosticReport(input: DiagnosticInput): string {
  const lines: string[] = []

  lines.push('# Diagnostic Report')
  lines.push('')
  lines.push('## 1. Run Configuration')
  lines.push(`- **Scenario:** ${input.name}`)
  lines.push(`- **Algorithm:** ${input.algorithm}`)
  lines.push(`- **World Size:** ${input.worldSize}`)
  lines.push(`- **Seed:** ${input.seed}`)
  lines.push(`- **Total Ticks:** ${input.totalTicks}`)
  lines.push(`- **Agent Count:** ${input.metrics.agentCount}`)
  lines.push('')

  lines.push('## 2. Performance Analysis')
  lines.push(`- **Pathfinding Time (last tick):** ${input.metrics.pathfindingTimeMs.toFixed(3)} ms`)
  lines.push(`- **Trips Completed:** ${input.metrics.tripsCompleted}`)
  lines.push(`- **Budget Overruns:** ${input.metrics.budgetOverruns}`)
  lines.push(`- **Deferred Reroutes:** ${input.metrics.deferredReroutes}`)
  lines.push(`- **Wait Events:** ${input.metrics.waitEvents}`)
  lines.push(`- **Total Wait Ticks:** ${input.metrics.totalWaitTicks}`)
  lines.push(`- **Path Smoothness:** ${input.metrics.pathSmoothness.toFixed(3)} rad`)
  lines.push('')

  lines.push('## 3. Bug Detection / Anomaly Log')
  const errors = input.events.filter(e => e.type === 'error' || e.type === 'anomaly')
  if (errors.length === 0) {
    lines.push('No anomalies detected.')
  } else {
    for (const err of errors) {
      lines.push(`- Tick ${err.tick}: [${err.type}] ${fmtEvent(err)}`)
    }
  }
  lines.push('')

  lines.push('## 4. Plan Compliance Checklist')
  lines.push(`- [${input.metrics.algorithmErrors === 0 ? 'x' : ' '}] No algorithm errors`)
  lines.push(`- [${input.metrics.stuckAgents === 0 ? 'x' : ' '}] No stuck agents at end`)
  lines.push(`- [${input.metrics.budgetOverruns === 0 ? 'x' : ' '}] No budget overruns`)
  lines.push('')

  lines.push('## 5. Agent Behavior Summary')
  lines.push('| Agent | State | Position | Destination |')
  lines.push('|-------|-------|----------|-------------|')
  for (const agent of input.agents) {
    const pos = `(${agent.position.x}, ${agent.position.y}, ${agent.position.z})`
    const dest = agent.destination
      ? `(${agent.destination.x}, ${agent.destination.y}, ${agent.destination.z})`
      : 'none'
    lines.push(`| #${agent.id} | ${agent.state} | ${pos} | ${dest} |`)
  }
  lines.push('')

  lines.push('## 6. Event Timeline')
  const timelineEvents = input.events.slice(0, 100)
  if (timelineEvents.length === 0) {
    lines.push('No events recorded.')
  } else {
    for (const evt of timelineEvents) {
      lines.push(`- **Tick ${evt.tick}** [${evt.type}]: ${fmtEvent(evt)}`)
    }
    if (input.events.length > 100) {
      lines.push(`... and ${input.events.length - 100} more events`)
    }
  }
  lines.push('')

  return lines.join('\n')
}

function getMetricValue(label: string, m: SimulationMetrics): string {
  switch (label) {
    case 'Pathfinding Time (last tick)': return `${m.pathfindingTimeMs.toFixed(3)} ms`
    case 'Trips Completed': return `${m.tripsCompleted}`
    case 'Budget Overruns': return `${m.budgetOverruns}`
    case 'Deferred Reroutes': return `${m.deferredReroutes}`
    case 'Wait Events': return `${m.waitEvents}`
    case 'Total Wait Ticks': return `${m.totalWaitTicks}`
    case 'Stuck Agents': return `${m.stuckAgents}`
    case 'Algorithm Errors': return `${m.algorithmErrors}`
    case 'Path Smoothness': return `${m.pathSmoothness.toFixed(3)} rad`
    default: return ''
  }
}

function formatMetricsRow(label: string, algorithms: SimulationMetrics[]): string {
  const values = algorithms.map(m => getMetricValue(label, m))
  return `| ${label} | ${values.join(' | ')} |`
}

function formatAgentTable(label: string, agents: ReadonlyArray<Agent>): string {
  const lines: string[] = []
  lines.push(`### ${label}`)
  lines.push('| Agent | State | Position | Destination |')
  lines.push('|-------|-------|----------|-------------|')
  for (const agent of agents) {
    const pos = `(${agent.position.x}, ${agent.position.y}, ${agent.position.z})`
    const dest = agent.destination
      ? `(${agent.destination.x}, ${agent.destination.y}, ${agent.destination.z})`
      : 'none'
    lines.push(`| #${agent.id} | ${agent.state} | ${pos} | ${dest} |`)
  }
  return lines.join('\n')
}

function formatTimeline(label: string, events: ReadonlyArray<LogEntry>, limit: number): string {
  const lines: string[] = []
  lines.push(`### ${label}`)
  const shown = events.slice(-limit)
  if (shown.length === 0) {
    lines.push('No events recorded.')
  } else {
    if (events.length > limit) {
      lines.push(`_(showing last ${limit} of ${events.length} events)_`)
    }
    for (const evt of shown) {
      lines.push(`- **Tick ${evt.tick}** [${evt.type}]: ${fmtEvent(evt)}`)
    }
  }
  return lines.join('\n')
}

export function generateComparisonReport(input: ComparisonDiagnosticInput): string {
  const lines: string[] = []
  const { astar, hpastar, flowfield, dstar } = input
  const hasFlowField = !!flowfield
  const hasDStar = !!dstar

  // Build algorithm list
  const algoNames = ['A*', 'HPA*']
  const algoData: AlgorithmData[] = [astar, hpastar]
  if (hasFlowField) {
    algoNames.push('FlowField')
    algoData.push(flowfield)
  }
  if (hasDStar) {
    algoNames.push('D* Lite')
    algoData.push(dstar)
  }

  lines.push('# Comparison Diagnostic Report')
  lines.push('')

  // 1. Run Configuration
  lines.push('## 1. Run Configuration')
  lines.push(`- **Scenario:** ${input.name}`)
  lines.push(`- **World Size:** ${input.worldSize}`)
  lines.push(`- **Seed:** ${input.seed}`)
  lines.push(`- **Total Ticks:** ${input.totalTicks}`)
  lines.push(`- **Agent Count:** ${astar.metrics.agentCount}`)
  lines.push(`- **Algorithms:** ${algoNames.join(', ')}`)
  lines.push('')

  // 2. Performance Comparison
  lines.push('## 2. Performance Comparison')
  const headerCols = algoNames.map(n => ` ${n} `).join('|')
  const separatorCols = algoNames.map(() => '------').join('|')
  lines.push(`| Metric | ${headerCols} |`)
  lines.push(`|--------|${separatorCols}|`)
  const metricLabels = [
    'Pathfinding Time (last tick)',
    'Trips Completed',
    'Budget Overruns',
    'Deferred Reroutes',
    'Wait Events',
    'Total Wait Ticks',
    'Stuck Agents',
    'Algorithm Errors',
    'Path Smoothness',
  ]
  for (const label of metricLabels) {
    lines.push(formatMetricsRow(label, algoData.map(d => d.metrics)))
  }
  lines.push('')

  // 3. Bug Detection
  lines.push('## 3. Bug Detection / Anomaly Log')
  let anyErrors = false
  for (let i = 0; i < algoNames.length; i++) {
    const errors = algoData[i].events.filter(e => e.type === 'error' || e.type === 'anomaly')
    if (errors.length > 0) {
      anyErrors = true
      lines.push(`**${algoNames[i]}:**`)
      for (const err of errors) lines.push(`- Tick ${err.tick}: ${fmtEvent(err)}`)
    }
  }
  if (!anyErrors) {
    lines.push('No anomalies detected on any side.')
  }
  lines.push('')

  // 4. Plan Compliance
  lines.push('## 4. Plan Compliance Checklist')
  const noErrors = algoData.every(d => d.metrics.algorithmErrors === 0)
  const noStuck = algoData.every(d => d.metrics.stuckAgents === 0)
  const noBudget = algoData.every(d => d.metrics.budgetOverruns === 0)
  lines.push(`- [${noErrors ? 'x' : ' '}] No algorithm errors`)
  lines.push(`- [${noStuck ? 'x' : ' '}] No stuck agents at end`)
  lines.push(`- [${noBudget ? 'x' : ' '}] No budget overruns`)
  lines.push('')

  // 5. Agent Behavior Summary
  lines.push('## 5. Agent Behavior Summary')
  for (let i = 0; i < algoNames.length; i++) {
    lines.push(formatAgentTable(algoNames[i], algoData[i].agents))
    lines.push('')
  }

  // 6. Event Timeline (last 25 each to keep report manageable with 4 algos)
  const timelineLimit = hasDStar ? 25 : (hasFlowField ? 30 : 50)
  lines.push('## 6. Event Timeline')
  for (let i = 0; i < algoNames.length; i++) {
    lines.push(formatTimeline(algoNames[i], algoData[i].events, timelineLimit))
    lines.push('')
  }

  // 7. Algorithm Ranking Table
  if (algoNames.length >= 2) {
    lines.push('## 7. Algorithm Ranking')
    lines.push('')
    lines.push('| Category | Winner | Value |')
    lines.push('|----------|--------|-------|')

    // Most trips completed (higher is better)
    const tripWinner = algoData
      .map((d, i) => ({ name: algoNames[i], val: d.metrics.tripsCompleted }))
      .sort((a, b) => b.val - a.val)[0]
    lines.push(`| Trips Completed | ${tripWinner.name} | ${tripWinner.val} |`)

    // Fewest wait events (lower is better)
    const waitWinner = algoData
      .map((d, i) => ({ name: algoNames[i], val: d.metrics.waitEvents }))
      .sort((a, b) => a.val - b.val)[0]
    lines.push(`| Fewest Wait Events | ${waitWinner.name} | ${waitWinner.val} |`)

    // Best path smoothness (lower is better — less angle change)
    const smoothWinner = algoData
      .map((d, i) => ({ name: algoNames[i], val: d.metrics.pathSmoothness }))
      .sort((a, b) => a.val - b.val)[0]
    lines.push(`| Best Path Smoothness | ${smoothWinner.name} | ${smoothWinner.val.toFixed(3)} rad |`)

    // Fewest errors (lower is better)
    const errorWinner = algoData
      .map((d, i) => ({ name: algoNames[i], val: d.metrics.algorithmErrors }))
      .sort((a, b) => a.val - b.val)[0]
    lines.push(`| Fewest Errors | ${errorWinner.name} | ${errorWinner.val} |`)

    // Fewest stuck agents
    const stuckWinner = algoData
      .map((d, i) => ({ name: algoNames[i], val: d.metrics.stuckAgents }))
      .sort((a, b) => a.val - b.val)[0]
    lines.push(`| Fewest Stuck Agents | ${stuckWinner.name} | ${stuckWinner.val} |`)

    lines.push('')
  }

  return lines.join('\n')
}
