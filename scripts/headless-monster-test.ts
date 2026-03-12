/**
 * Headless simulation to test the monster combat system.
 * Runs a 100-day simulation with Utility AI vs Behavior Tree AI
 * and reports monster encounters, combat stats, and village health.
 */

import { CompetitionEngine } from '../src/simulation/competition-engine.ts'
import { UtilityAI } from '../src/simulation/ai/utility-ai.ts'
import { BehaviorTreeAI } from '../src/simulation/ai/behavior-tree-ai.ts'
import { TICKS_PER_DAY } from '../src/simulation/simulation-engine.ts'

const DAYS = 100
const TOTAL_TICKS = DAYS * TICKS_PER_DAY

const engine = new CompetitionEngine({
  seed: 123,
  worldWidth: 64,
  worldHeight: 64,
  villages: [
    { id: 'utility', name: 'Utility Village', aiSystem: new UtilityAI(), villagerCount: 10 },
    { id: 'bt', name: 'BT Village', aiSystem: new BehaviorTreeAI(), villagerCount: 10 },
  ],
  timeLimit: DAYS,
  eventFrequencyMultiplier: 0.8, // slightly more frequent events
})

interface VillageStats {
  name: string
  monstersKilled: number
  totalMonstersSpawned: number
  raidCount: number
  attackActions: number
  fleeActions: number
  deaths: number
  finalPop: number
  finalFood: number
  finalWood: number
}

const stats: Record<string, VillageStats> = {
  utility: { name: 'Utility Village', monstersKilled: 0, totalMonstersSpawned: 0, raidCount: 0, attackActions: 0, fleeActions: 0, deaths: 0, finalPop: 0, finalFood: 0, finalWood: 0 },
  bt: { name: 'BT Village', monstersKilled: 0, totalMonstersSpawned: 0, raidCount: 0, attackActions: 0, fleeActions: 0, deaths: 0, finalPop: 0, finalFood: 0, finalWood: 0 },
}

let lastDayReported = -1

console.log(`Running ${DAYS}-day headless simulation with monster combat system...\n`)

for (let t = 0; t < TOTAL_TICKS; t++) {
  engine.tick()
  const state = engine.getState()

  // Report every 10 days
  const currentDay = state.dayCount
  if (currentDay > 0 && currentDay % 10 === 0 && currentDay !== lastDayReported) {
    lastDayReported = currentDay
    console.log(`--- Day ${currentDay} ---`)
    for (const village of state.villages) {
      const alive = village.villagers.filter(v => v.alive).length
      const monsters = village.monsters.length
      const attacking = village.villagers.filter(v => v.alive && v.currentAction === 'attack').length
      const fleeing = village.villagers.filter(v => v.alive && v.currentAction === 'flee').length
      console.log(`  ${village.name}: pop=${alive}, monsters=${monsters}, killed=${village.monstersKilled}, attacking=${attacking}, fleeing=${fleeing}, food=${Math.floor(village.stockpile.food)}, wood=${Math.floor(village.stockpile.wood)}`)
    }
  }

  // Track combat actions
  for (const village of state.villages) {
    const s = stats[village.id]
    for (const v of village.villagers) {
      if (v.alive && v.currentAction === 'attack') s.attackActions++
      if (v.alive && v.currentAction === 'flee') s.fleeActions++
    }
  }
}

// Final report
const state = engine.getState()
console.log(`\n${'='.repeat(60)}`)
console.log(`FINAL REPORT — Day ${state.dayCount}`)
console.log(`${'='.repeat(60)}`)
console.log(`Winner: ${state.winner ?? 'None (tie)'}`)
console.log(`Season: ${state.season}`)

for (const village of state.villages) {
  const s = stats[village.id]
  const alive = village.villagers.filter(v => v.alive).length
  const totalDeaths = village.villagers.filter(v => !v.alive).length
  const monsterEvents = village.events.filter(e => e.type === 'monster_killed')
  const raidEvents = village.events.filter(e => e.message.includes('raid'))

  console.log(`\n${village.name} (${village.isEliminated ? 'ELIMINATED' : 'alive'}):`)
  console.log(`  Population: ${alive}/${village.villagers.length} (${totalDeaths} deaths)`)
  console.log(`  Stockpile: food=${Math.floor(village.stockpile.food)}, wood=${Math.floor(village.stockpile.wood)}, stone=${Math.floor(village.stockpile.stone)}`)
  console.log(`  Structures: ${village.structures.map(s => s.type).join(', ') || 'none'}`)
  console.log(`  Monsters: ${village.monsters.length} active, ${village.monstersKilled} killed`)
  console.log(`  Raids: ${raidEvents.length}`)
  console.log(`  Combat ticks: ${s.attackActions} attack, ${s.fleeActions} flee`)

  if (village.isEliminated) {
    console.log(`  Eliminated: ${village.eliminationCause}`)
  }

  // Show prosperity history
  const hist = village.history.daily
  if (hist.length > 0) {
    console.log(`  Prosperity: ${hist[hist.length - 1].prosperityScore.toFixed(1)} (peak: ${Math.max(...hist.map(h => h.prosperityScore)).toFixed(1)})`)
  }
}

// Monster event timeline
console.log(`\n--- Monster Event Timeline ---`)
for (const village of state.villages) {
  const monsterEvents = village.events.filter(e => e.type === 'monster_killed' || e.message.includes('raid') || e.message.includes('monster'))
  if (monsterEvents.length > 0) {
    console.log(`\n${village.name}:`)
    for (const e of monsterEvents.slice(0, 30)) {
      console.log(`  Day ${e.day}: ${e.message}`)
    }
    if (monsterEvents.length > 30) {
      console.log(`  ... and ${monsterEvents.length - 30} more`)
    }
  }
}

console.log(`\nSimulation complete.`)
