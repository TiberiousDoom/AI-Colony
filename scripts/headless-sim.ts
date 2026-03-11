/**
 * Headless simulation runner — runs CompetitionEngine without a browser.
 * Usage: npx tsx scripts/headless-sim.ts [seed] [maxDays]
 */

import { CompetitionEngine } from '../src/simulation/competition-engine.ts'
import { buildCompetitionConfig, getDefaultGameConfig } from '../src/config/game-config.ts'
import { createRandomGenome, getGenomeNeedCount } from '../src/simulation/ai/genome.ts'
import { createRNG } from '../src/utils/seed.ts'
import { TICKS_PER_DAY } from '../src/simulation/simulation-engine.ts'

const seed = parseInt(process.argv[2] ?? '42', 10)
const maxDays = parseInt(process.argv[3] ?? '60', 10)

const gc = getDefaultGameConfig()
gc.seed = seed
gc.aiSelection = { utility: true, bt: true, goap: true, evolutionary: true }

const genomeRng = createRNG(seed + 1000)
const needCount = getGenomeNeedCount(gc.biome)
gc.evolutionaryGenome = createRandomGenome(genomeRng, needCount, gc.biome)

const config = buildCompetitionConfig(gc)
const engine = new CompetitionEngine(config)

console.log(`=== Headless Simulation: seed=${seed}, maxDays=${maxDays}, TICKS_PER_DAY=${TICKS_PER_DAY} ===\n`)

const maxTicks = maxDays * TICKS_PER_DAY
let evoEliminated = false
let printedDetailedScores = false

for (let t = 0; t < maxTicks; t++) {
  engine.tick()
  const state = engine.getState()
  const tick = state.tick

  const evoVillage = state.villages.find(v => v.name === 'Evolutionary')
  if (!evoVillage || evoEliminated) continue

  const alive = evoVillage.villagers.filter(vl => vl.alive)
  const dead = evoVillage.villagers.filter(vl => !vl.alive)

  // Print detailed AI scores at tick 5 and during food crises
  const isFoodCrisis = evoVillage.stockpile.food < 5 && alive.length > 3
  if ((tick === 5 || (isFoodCrisis && !printedDetailedScores)) && tick > 1) {
    if (isFoodCrisis) printedDetailedScores = true
    console.log(`=== DETAILED SCORES at tick ${tick} (${state.season}, time=${state.timeOfDay ?? 'unknown'}, food=${Math.round(evoVillage.stockpile.food)}) ===`)
    for (const vl of alive.slice(0, 3)) {
      const h = vl.needs.get('hunger')?.current ?? 0
      const e = vl.needs.get('energy')?.current ?? 0
      const hp = vl.needs.get('health')?.current ?? 0
      const w = vl.needs.get('warmth')?.current ?? 0
      console.log(`\n  ${vl.name}: h=${Math.round(h)} e=${Math.round(e)} hp=${Math.round(hp)} w=${Math.round(w)} action=${vl.currentAction}`)
      const decision = (vl as any).lastDecision
      if (decision?.scores) {
        const topScores = decision.scores.slice(0, 5)
        for (const s of topScores) {
          console.log(`    ${s.action}: ${typeof s.score === 'number' ? s.score.toFixed(3) : s.score} (${s.reason})`)
        }
      }
      console.log(`  reason: ${decision?.reason ?? 'N/A'}`)
    }
    console.log()
  }

  // Print every 5 ticks for Evo village
  if (tick % 15 === 0 || evoVillage.eliminated) {
    if (alive.length > 0) {
      const actionCounts = new Map<string, number>()
      for (const vl of alive) {
        actionCounts.set(vl.currentAction, (actionCounts.get(vl.currentAction) ?? 0) + 1)
      }
      const actionStr = [...actionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([a, c]) => `${a}:${c}`)
        .join(' ')

      const avgHunger = Math.round(alive.reduce((s, vl) => s + (vl.needs.get('hunger')?.current ?? 0), 0) / alive.length)
      const avgEnergy = Math.round(alive.reduce((s, vl) => s + (vl.needs.get('energy')?.current ?? 0), 0) / alive.length)
      const avgHealth = Math.round(alive.reduce((s, vl) => s + (vl.needs.get('health')?.current ?? 0), 0) / alive.length)

      console.log(`T${tick} ${state.season}/${state.timeOfDay ?? '?'}: Evo ${alive.length}a/${dead.length}d | food=${Math.round(evoVillage.stockpile.food)} | H=${avgHunger} E=${avgEnergy} HP=${avgHealth} | ${actionStr}`)
    }

    if (evoVillage.eliminated) {
      console.log(`\n*** EVOLUTIONARY ELIMINATED at tick ${tick} ***`)
      evoEliminated = true
    }
  }

  if (state.isOver) break
}

const finalState = engine.getState()
console.log(`\n=== FINAL STATE ===`)
for (const v of finalState.villages) {
  const alive = v.villagers.filter(vl => vl.alive).length
  const dead = v.villagers.filter(vl => !vl.alive).length
  const el = v.eliminated ? ' [ELIM]' : ''
  console.log(`${v.name}${el}: ${alive}a/${dead}d | food=${Math.round(v.stockpile.food)} wood=${Math.round(v.stockpile.wood)} | structs=${v.structures.length}`)
}
