/**
 * Headless crafting test — runs CompetitionEngine to verify equipment system.
 * Usage: npx tsx scripts/headless-crafting-test.ts [seed] [maxDays]
 */

import { CompetitionEngine } from '../src/simulation/competition-engine.ts'
import { buildCompetitionConfig, getDefaultGameConfig } from '../src/config/game-config.ts'
import { createRandomGenome, getGenomeNeedCount } from '../src/simulation/ai/genome.ts'
import { createRNG } from '../src/utils/seed.ts'
import { TICKS_PER_DAY } from '../src/simulation/simulation-engine.ts'

function runSeed(seed: number, maxDays: number): void {
  const gc = getDefaultGameConfig()
  gc.seed = seed
  gc.aiSelection = { utility: true, bt: true, goap: true, evolutionary: true }

  const genomeRng = createRNG(seed + 1000)
  const needCount = getGenomeNeedCount(gc.biome)
  gc.evolutionaryGenome = createRandomGenome(genomeRng, needCount, gc.biome)

  const config = buildCompetitionConfig(gc)
  const engine = new CompetitionEngine(config)

  const maxTicks = maxDays * TICKS_PER_DAY

  // Track crafting events
  const craftEvents: Array<{ tick: number; village: string; villager: string; item: string }> = []
  // Track combat with equipment
  let monstersKilled = 0
  let villagerDeaths = 0

  // Snapshot equipment periodically
  const equipSnapshots: Array<{ day: number; village: string; armed: number; armored: number; alive: number }> = []

  for (let t = 0; t < maxTicks; t++) {
    engine.tick()
    const state = engine.getState()
    const tick = state.tick

    // Check for crafting events in village logs
    for (const v of state.villages) {
      if (v.eliminated) continue

      // Check for new craft events
      for (const evt of v.events) {
        if (evt.message.includes('crafted') && evt.day === state.dayCount) {
          const alreadyLogged = craftEvents.some(
            ce => ce.tick === tick && ce.village === v.name && ce.item === evt.message
          )
          if (!alreadyLogged) {
            craftEvents.push({ tick, village: v.name, villager: '', item: evt.message })
          }
        }
      }
    }

    // Every 10 days, snapshot equipment state
    if (tick > 0 && tick % (TICKS_PER_DAY * 10) === 0) {
      for (const v of state.villages) {
        if (v.eliminated) continue
        const alive = v.villagers.filter(vl => vl.alive)
        const armed = alive.filter(vl => vl.equipment.weapon !== null).length
        const armored = alive.filter(vl => vl.equipment.armor !== null).length
        equipSnapshots.push({
          day: state.dayCount,
          village: v.name,
          armed,
          armored,
          alive: alive.length,
        })
      }
    }

    if (state.isOver) break
  }

  const finalState = engine.getState()

  // Print summary
  console.log(`\n========== SEED ${seed} (${maxDays} days) ==========`)

  // Final state
  for (const v of finalState.villages) {
    const alive = v.villagers.filter(vl => vl.alive)
    const dead = v.villagers.filter(vl => !vl.alive).length
    const el = v.eliminated ? ` [ELIM: ${v.eliminationReason ?? '?'}]` : ''
    const armed = alive.filter(vl => vl.equipment.weapon !== null)
    const armored = alive.filter(vl => vl.equipment.armor !== null)

    const weaponTypes = new Map<string, number>()
    const armorTypes = new Map<string, number>()
    for (const vl of alive) {
      if (vl.equipment.weapon) weaponTypes.set(vl.equipment.weapon, (weaponTypes.get(vl.equipment.weapon) ?? 0) + 1)
      if (vl.equipment.armor) armorTypes.set(vl.equipment.armor, (armorTypes.get(vl.equipment.armor) ?? 0) + 1)
    }

    const weaponStr = weaponTypes.size > 0
      ? [...weaponTypes.entries()].map(([t, c]) => `${t.replace(/_/g, ' ')}×${c}`).join(', ')
      : 'none'
    const armorStr = armorTypes.size > 0
      ? [...armorTypes.entries()].map(([t, c]) => `${t.replace(/_/g, ' ')}×${c}`).join(', ')
      : 'none'

    console.log(`  ${v.name}${el}: ${alive.length}a/${dead}d | food=${Math.round(v.stockpile.food)} wood=${Math.round(v.stockpile.wood)} stone=${Math.round(v.stockpile.stone)}`)
    console.log(`    Armed: ${armed.length}/${alive.length} [${weaponStr}]`)
    console.log(`    Armored: ${armored.length}/${alive.length} [${armorStr}]`)
    console.log(`    Structures: ${v.structures.length} (${v.structures.map(s => s.type).join(', ')})`)
  }

  // Crafting timeline
  const uniqueCrafts = new Map<string, number>()
  for (const ce of craftEvents) {
    uniqueCrafts.set(ce.village, (uniqueCrafts.get(ce.village) ?? 0) + 1)
  }
  console.log(`\n  Crafting events by village:`)
  for (const [village, count] of uniqueCrafts) {
    console.log(`    ${village}: ${count} items crafted`)
  }

  // Equipment progression snapshots
  if (equipSnapshots.length > 0) {
    console.log(`\n  Equipment progression (every 10 days):`)
    const days = [...new Set(equipSnapshots.map(s => s.day))].sort((a, b) => a - b)
    for (const day of days) {
      const snaps = equipSnapshots.filter(s => s.day === day)
      const parts = snaps.map(s => `${s.village.slice(0, 4)}: ${s.armed}w/${s.armored}a/${s.alive}pop`)
      console.log(`    Day ${day}: ${parts.join(' | ')}`)
    }
  }

  // Check for problems
  const problems: string[] = []

  // Problem: No village ever crafted anything
  const totalCrafts = [...uniqueCrafts.values()].reduce((a, b) => a + b, 0)
  if (totalCrafts === 0) {
    problems.push('NO CRAFTING occurred in any village')
  }

  // Problem: A village has resources but never crafted
  for (const v of finalState.villages) {
    if (v.eliminated) continue
    const alive = v.villagers.filter(vl => vl.alive)
    const armed = alive.filter(vl => vl.equipment.weapon !== null).length
    if (armed === 0 && v.stockpile.wood >= 10 && alive.length >= 5 && finalState.dayCount > 20) {
      problems.push(`${v.name}: has resources but nobody crafted weapons (${alive.length} alive, ${Math.round(v.stockpile.wood)} wood)`)
    }
  }

  // Problem: All villagers died
  const totalAlive = finalState.villages.reduce((s, v) => s + v.villagers.filter(vl => vl.alive).length, 0)
  if (totalAlive === 0) {
    problems.push('ALL villages eliminated')
  }

  if (problems.length > 0) {
    console.log(`\n  ⚠ PROBLEMS:`)
    for (const p of problems) {
      console.log(`    - ${p}`)
    }
  } else {
    console.log(`\n  ✓ No problems detected`)
  }
}

// Run multiple seeds
const seeds = process.argv[2]
  ? [parseInt(process.argv[2], 10)]
  : [42, 123, 675722, 999, 314159]
const maxDays = parseInt(process.argv[3] ?? '120', 10)

console.log(`Running headless crafting test with ${seeds.length} seed(s), ${maxDays} days each...`)

for (const seed of seeds) {
  runSeed(seed, maxDays)
}

console.log(`\n========== ALL SEEDS COMPLETE ==========`)
