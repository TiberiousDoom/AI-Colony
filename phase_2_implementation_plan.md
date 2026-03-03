# Phase 2: Competition — Implementation Plan

**Version:** 1.0
**Date:** March 3, 2026
**Goal:** Two villages side by side, Utility AI vs Behavior Trees, full comparison.

---

## Overview

Phase 2 transforms AI Colony from a single-village dashboard into a competitive dual-village simulation. This requires:

1. **New gameplay systems** — seasons, warmth, structures, population growth, random events
2. **Second AI system** — Behavior Trees (implementing the existing `IAISystem` interface)
3. **Dual village architecture** — two independent villages on the same world seed
4. **Side-by-side dashboard** — two-column metrics comparison, village-aware event log

The plan is organized into 13 implementation steps across 5 blocks. Each step lists files to create/modify, the key changes, and the tests to write.

---

## Current State (Phase 1 Delivered)

| Component | Status | Key Files |
|-----------|--------|-----------|
| Simulation engine | 30 ticks/day, day/night cycle | `simulation-engine.ts` (385 lines) |
| World generation | 64×64 noise-based, 5 tile types | `world.ts` (270 lines) |
| Villager system | 3 needs (hunger, energy, health), 7 actions | `villager.ts` (189 lines) |
| Action system | forage, eat, rest, chop_wood, haul, fish, idle | `actions.ts` (199 lines) |
| Utility AI | Scoring with urgency curves + environmental modifiers | `utility-ai.ts` (202 lines) |
| AI interface | `IAISystem` with `decide()` method | `ai-interface.ts` (33 lines) |
| Pathfinding | A* with Manhattan heuristic | `pathfinding.ts` (188 lines) |
| Store | Zustand with rAF game loop | `simulation-store.ts` (146 lines) |
| Dashboard | 6 KPIs, 4 charts, event log | `MetricsDashboard.tsx` (158 lines) |
| Tests | 10 files, 111 tests, all passing | `tests/` |

**Phase 2 hooks already in code:**
- `NeedType` enum has `Warmth` commented out (line 20 of `villager.ts`)
- `VillagerAction` type already includes `mine_stone`, `build`, `warm_up`, `flee`
- `calculateProsperity()` already accepts `structureCount` and `uniqueStructureTypes` (passed as 0)
- `DailySnapshot.activityBreakdown` already records all action types including Phase 2 ones
- `TileType.FertileSoil` exists for future farm placement
- `AIWorldView` interface is ready for extension

---

## Implementation Blocks

### Block A: Core Gameplay Systems (single village)
Steps 1–5. All changes tested with the existing single-village engine before competition is introduced.

### Block B: Behavior Tree AI
Step 6. Second AI system implementing `IAISystem`. Needs Block A systems to reason about.

### Block C: Competition Architecture
Steps 7–8. Dual village engine + event mirroring. The big structural refactor.

### Block D: Dashboard & UI
Steps 9–10. Side-by-side layout, village-aware event log, quick-compare table.

### Block E: Acceptance & Testing
Steps 11–13. Cross-AI determinism, event mirroring validation, Phase 2 acceptance criteria.

---

## Step 1: Seasonal Cycle

**Goal:** 4-season cycle with mechanical effects on world and actions.

### Design
- Season length: ~7 in-game days each (210 ticks per season, 840 ticks per year)
- Season order: spring → summer → autumn → winter → spring...
- Seasons affect: forest regeneration, action yields, action duration penalties

| Season | Forest Regen | Forage/Fish Yield | Outdoor Duration | Notes |
|--------|-------------|-------------------|------------------|-------|
| Spring | 2× (1.0/tick) | Normal | Normal | Growth bonus |
| Summer | Normal (0.5/tick) | Normal | Normal | Baseline |
| Autumn | Normal | +50% yield | Normal | Harvest bonus |
| Winter | 0 (no regen) | −25% yield | +50% penalty (stacks with night) | Harsh conditions |

### Files to modify

**`src/simulation/simulation-engine.ts`**
- Add `Season` type: `'spring' | 'summer' | 'autumn' | 'winter'`
- Add `season` field to `SimulationState`
- Add `seasonDay` counter (0–6, resets each season transition)
- Compute season transitions at day boundaries (every 7 days)
- Add season-change events to event log
- Pass season to action system for yield/duration modifiers
- Update `tickRegeneration()` call to pass season (for spring boost / winter freeze)

**`src/simulation/world.ts`**
- Modify `tickRegeneration()` to accept season parameter
- Spring: double regen rate
- Winter: skip regeneration entirely

**`src/simulation/actions.ts`**
- Add `Season` to `ActionDefinition.getEffectiveDuration()` signature
- Winter outdoor penalty: multiply duration by 1.5 (stacks with night → `ceil(duration * 1.5 * 1.5)` for winter night)
- Add season-aware yield modifiers to `complete()` for forage/fish:
  - Autumn: yield × 1.5
  - Winter: yield × 0.75

**`src/simulation/ai/ai-interface.ts`**
- Add `season: Season` to `AIWorldView`

**`src/simulation/ai/utility-ai.ts`**
- Add seasonal modifiers to scoring (e.g., autumn stockpiling bonus)

**`src/components/TopBar.tsx`**
- Display current season next to day/time indicator
- Season emoji/icon: 🌱 Spring, ☀ Summer, 🍂 Autumn, ❄ Winter

**`src/simulation/simulation-engine.ts` — `DailySnapshot`**
- Add `season` field to snapshot for chart labeling

### Tests to write

**`tests/season.test.ts`** (new file)
- Season starts at spring
- Season transitions every 7 days (spring → summer at day 7)
- Full cycle: 28 days returns to spring
- Forest regeneration doubled in spring
- Forest regeneration zero in winter
- Forage yields +50% in autumn
- Forage yields −25% in winter
- Outdoor action duration penalty in winter
- Winter night stacks penalties (duration × 2.25)
- Season recorded in daily snapshot
- Season events appear in event log

---

## Step 2: Warmth Need + Winter Mechanics

**Goal:** Villagers need warmth in winter. Warmth drains outdoors, replenished by fire/shelter.

### Design
- Warmth is a 4th need (0–100), starts at 75
- Drain rate: 0 in spring/summer/autumn, 3/tick in winter
- At warmth ≤ 0: health drains 1/tick (like starvation)
- Recovery: campfire (+25), shelter (+30) via `warm_up` action
- Resting at campfire/shelter also passively restores +5 warmth

### Files to modify

**`src/simulation/villager.ts`**
- Uncomment `Warmth = 'warmth'` in NeedType enum
- Add warmth to `createDefaultNeeds()`: `{ current: 75, drainRate: 0, min: 0, max: 100 }`
- Update `tickNeeds()`:
  - Accept `season` parameter
  - Set warmth drain rate dynamically: 3/tick in winter, 0 otherwise
  - Apply warmth drain
  - At warmth ≤ 0: health −= 1.0 (exposure damage, same as starvation)

**`src/simulation/actions.ts`**
- Add `WARM_UP_ACTION`: duration 2, energyCost 0, can perform anywhere, restores +25 warmth (or +30 at campfire/shelter)
- Modify `REST_ACTION.complete()`: also restore +5 warmth if at campfire/shelter in winter
- Register `warm_up` in `ACTION_MAP`

**`src/simulation/simulation-engine.ts`**
- Pass season to `tickNeeds()` calls

**`src/simulation/ai/utility-ai.ts`**
- Add warmth-based scoring:
  - `warm_up` action weighted by warmth urgency in winter
  - Emergency bonus (+0.5) when warmth < 20

### Tests to write

**`tests/warmth.test.ts`** (new file)
- Warmth doesn't drain outside winter
- Warmth drains 3/tick in winter
- Health damage at warmth 0
- warm_up action restores 25 warmth
- warm_up at campfire restores 30 warmth
- Rest at campfire in winter gives +5 warmth
- AI prioritizes warm_up when warmth is critical
- Villager dies from exposure (warmth → health → death)

---

## Step 3: Structures System

**Goal:** Villagers can build shelters and storage buildings that affect gameplay.

### Design

| Structure | Cost | Effect | Capacity |
|-----------|------|--------|----------|
| Shelter | 20 wood | Rest bonus +10, warmth in winter | 3 villagers |
| Storage | 15 wood + 10 stone | +100 max per resource type | N/A |

Structures are placed on passable tiles adjacent to the campfire (within a settlement radius of ~5 tiles). Each structure occupies one tile.

### New file

**`src/simulation/structures.ts`** (new file)
```typescript
export type StructureType = 'shelter' | 'storage'

export interface Structure {
  id: string
  type: StructureType
  position: Position
  builtTick: number
}

export interface StructureCost {
  wood: number
  stone: number
}

export const STRUCTURE_COSTS: Record<StructureType, StructureCost>
export const STRUCTURE_EFFECTS: Record<StructureType, {...}>

export function canAfford(stockpile, type): boolean
export function deductCost(stockpile, type): void
export function findBuildSite(world, campfire, structures, rng): Position | null
export function getShelterCapacity(structures): number
export function getStorageBonus(structures): number
export function isAtStructure(pos, structures, type): boolean
```

### Files to modify

**`src/simulation/simulation-engine.ts`**
- Add `structures: Structure[]` to `SimulationState`
- Initialize as empty array
- Pass structures to action system
- Update prosperity recording: count structures and unique types
- Add structure-built events

**`src/simulation/villager.ts`**
- Add `mine_stone` to the set of actions with implementation

**`src/simulation/actions.ts`**
- Add `MINE_STONE_ACTION`: duration 5, energyCost 2, requires adjacent stone tile, yields 6-10 stone
- Add `BUILD_ACTION`: duration 6, energyCost 2, requires at build site, consumes resources from stockpile, creates structure
- Modify `REST_ACTION`: check if at shelter for +10 energy bonus (rest at shelter: +30, at campfire: +20, elsewhere: +15)
- Modify warm_up: check if at shelter for warmth bonus
- Register `mine_stone` and `build` in `ACTION_MAP`

**`src/simulation/ai/utility-ai.ts`**
- Add mine_stone scoring (like chop_wood but for stone need)
- Add build scoring: consider shelter need (population / 3 > shelter count), storage need (stockpile near cap)
- Target position: find build site near campfire

**`src/simulation/ai/ai-interface.ts`**
- Add `structures: ReadonlyArray<Readonly<Structure>>` to `AIWorldView`

**`src/utils/scoring.ts`**
- No changes needed — already accepts structureCount and uniqueStructureTypes

### Tests to write

**`tests/structures.test.ts`** (new file)
- canAfford correctly checks wood/stone
- deductCost removes resources from stockpile
- findBuildSite returns valid passable tile near campfire
- findBuildSite returns null when no space
- mine_stone action yields 6–10 stone from stone tiles
- build action creates shelter (costs 20 wood)
- build action creates storage (costs 15 wood + 10 stone)
- Rest at shelter gives +30 energy (vs +20 at campfire)
- Shelter provides warmth restoration in winter
- Storage increases max stockpile
- Structure appears in SimulationState.structures
- Prosperity score increases with structures
- Structure variety bonus works (2 unique types > 2 shelters)

---

## Step 4: Population Growth

**Goal:** Villages can grow when food and shelter conditions are met.

### Design
- Growth conditions: food stockpile > 50 AND at least one shelter with capacity
- Growth rate: one new villager every 12–15 in-game days (when conditions met)
- New villager starts with all needs at 75
- Shelter capacity: 3 per shelter
- Max population = 3 × shelter count (soft cap — no growth beyond this)
- Growth counter tracks days since last birth; resets when conditions unmet

### Files to modify

**`src/simulation/simulation-engine.ts`**
- Add `growthTimer: number` to engine internal state (days since last growth check)
- On each day boundary, check growth conditions:
  - `stockpile.food > 50`
  - `shelterCapacity > currentPopulation`
  - `growthTimer >= 12` (use RNG for 12–15 range)
- Spawn new villager near campfire
- Add birth event to event log
- Reset growth timer

**`src/simulation/villager.ts`**
- No changes needed — `createVillager()` already handles creation
- Ensure name pool handles >20 villagers gracefully (modulo or generate names)

### Tests to write

**`tests/population.test.ts`** (new file)
- No growth without shelter
- No growth when food ≤ 50
- Growth triggers after 12+ days with conditions met
- New villager starts with needs at 75
- Max population capped by shelter capacity
- Growth stops when shelters full
- Growth resumes when new shelter built
- Population event logged
- Growth timer resets when conditions break
- New villager placed near campfire (within clearing)

---

## Step 5: Random Events System

**Goal:** Periodic events that challenge both villages simultaneously.

### Design

Events fire every 5–10 days (seeded RNG determines timing and type). Each event is deterministic for a given seed.

| Event | Effect | Duration | Severity |
|-------|--------|----------|----------|
| Predator Attack | Villager within 5 tiles takes 20–40 health damage, must flee | Instant | High |
| Blight | Food sources in 5-tile radius destroyed, regrow after 3 days | 3 days | Medium |
| Cold Snap | Warmth drains at winter rate for 2 days (even outside winter) | 2 days | Medium |

### New file

**`src/simulation/events.ts`** (new file)
```typescript
export type RandomEventType = 'predator' | 'blight' | 'cold_snap'

export interface RandomEvent {
  type: RandomEventType
  triggerTick: number
  position: Position       // World position where event occurs
  radius: number           // Affected area
  duration: number         // Ticks remaining (0 for instant events)
  severity: number         // Damage/intensity parameter
}

export interface EventScheduler {
  scheduleNextEvent(currentTick: number, rng: SeededRNG): RandomEvent
  processActiveEvents(state: SimulationState): void
  getActiveEvents(): RandomEvent[]
}
```

### Files to modify

**`src/simulation/simulation-engine.ts`**
- Add `activeEvents: RandomEvent[]` to `SimulationState`
- Create `EventScheduler` instance with seeded RNG
- On each tick: process active events (decrement duration, apply effects)
- On day boundary: chance to schedule new event
- Add event log entries for random events

**`src/simulation/villager.ts`**
- No direct changes — damage applied by event system via existing health need

**`src/simulation/world.ts`**
- Add `blightTile(x, y, duration)` method — temporarily sets resource to 0
- Track blight timers per tile, restore after duration

**`src/simulation/ai/ai-interface.ts`**
- Add `activeEvents: ReadonlyArray<Readonly<RandomEvent>>` to `AIWorldView`

**`src/simulation/ai/utility-ai.ts`**
- React to active events: flee from predator position, avoid blighted areas

### Tests to write

**`tests/events.test.ts`** (new file)
- Event scheduler produces deterministic events for same seed
- Predator damages villagers within radius
- Blight destroys food sources temporarily
- Blighted tiles recover after 3 days
- Cold snap activates warmth drain
- Cold snap ends after 2 days
- Events logged in event log
- Event timing is deterministic across runs
- Multiple events don't stack degenerate

---

## Step 6: Behavior Tree AI

**Goal:** Second AI system implementing `IAISystem`, using hierarchical decision trees.

### Design

The behavior tree evaluates top-to-bottom each tick. First matching branch wins.

```
Root (Selector)
├── Emergency (Sequence)
│   ├── health < 20? → find food/shelter → eat/rest
│   └── threat within 5 tiles? → flee
├── Critical Needs (Priority Selector)
│   ├── hunger < 25? → go to stockpile → eat (or forage if empty)
│   ├── energy < 20? → go to shelter/campfire → rest
│   └── warmth < 25 AND winter? → go to fire/shelter → warm_up
├── Village Tasks (Priority Selector)
│   ├── food stockpile < 30? → find forest → forage → haul
│   ├── wood stockpile < 20? → find forest → chop → haul
│   ├── shelters < population/3? → gather materials → build shelter
│   ├── no storage AND resources near cap? → build storage
│   └── no watchtower AND population > 5? → build watchtower (Phase 4, skip)
├── Proactive (Priority Selector)
│   ├── season is autumn? → stockpile bias (+50% to thresholds)
│   └── fertile soil available AND no farm? → (Phase 4, skip)
└── Idle → wander toward unexplored / rest if energy < 60
```

### New files

**`src/simulation/ai/behavior-tree.ts`** (new file)

Core BT node types:
```typescript
type BTStatus = 'success' | 'failure' | 'running'

interface BTNode {
  tick(context: BTContext): BTStatus
}

class Selector implements BTNode     // Try children until one succeeds
class Sequence implements BTNode     // Run children in order, fail on first failure
class Condition implements BTNode    // Check a predicate
class ActionNode implements BTNode   // Return an AI decision
```

**`src/simulation/ai/behavior-tree-ai.ts`** (new file)
```typescript
export class BehaviorTreeAI implements IAISystem {
  readonly name = 'Behavior Tree'
  private tree: BTNode

  constructor() {
    this.tree = buildVillagerTree()
  }

  decide(villager, worldView, rng): AIDecision {
    // Evaluate tree, return decision from first successful action node
  }
}
```

### Tests to write

**`tests/behavior-tree.test.ts`** (new file)
- Selector returns first successful child
- Selector returns failure if all children fail
- Sequence runs all children, fails on first failure
- Condition node checks predicate correctly
- BT prioritizes emergency (health < 20) over everything
- BT prioritizes hunger (< 25) over village tasks
- BT prioritizes energy (< 20) when critically tired
- BT triggers forage when food stockpile < 30
- BT triggers chop when wood stockpile < 20
- BT triggers build shelter when population > shelter capacity
- BT triggers warmth behavior in winter
- BT biases stockpiling in autumn
- BT produces deterministic decisions for same state
- BT fallback to idle/wander when nothing urgent

---

## Step 7: Dual Village Architecture

**Goal:** Run two independent villages on the same world seed with different AI systems.

### Design

The competition engine manages two `VillageState` instances sharing a single world. Each village has:
- Its own villagers, stockpile, structures, growth timer
- Its own AI system
- Its own forked RNG (deterministic per village)

The world is shared (same tile grid, same resource pool). Both villages see the same world but harvest from different positions.

**Important:** Each village gets its own starting position. Village A starts at (21, 21), Village B at (42, 42) — both within the 64×64 grid with their own 7×7 clearings.

### New file

**`src/simulation/competition-engine.ts`** (new file)
```typescript
export interface VillageConfig {
  id: string
  name: string
  aiSystem: IAISystem
  villagerCount: number
  startPosition: Position
}

export interface CompetitionConfig {
  seed: number
  worldWidth: number
  worldHeight: number
  villages: VillageConfig[]
}

export interface VillageState {
  id: string
  name: string
  villagers: Villager[]
  stockpile: VillageStockpile
  structures: Structure[]
  aiSystem: IAISystem
  campfirePosition: Position
  history: SimulationHistory
  events: SimulationEvent[]
  isEliminated: boolean
  eliminationTick: number | null
}

export interface CompetitionState {
  world: World
  villages: VillageState[]
  tick: number
  dayCount: number
  timeOfDay: TimeOfDay
  season: Season
  seasonDay: number
  activeEvents: RandomEvent[]
  isOver: boolean
  config: CompetitionConfig
}

export class CompetitionEngine {
  constructor(config: CompetitionConfig)
  tick(): void
  getState(): Readonly<CompetitionState>
  reset(config?: CompetitionConfig): void
}
```

### Files to modify

**`src/simulation/simulation-engine.ts`**
- Keep the single-village engine working (for acceptance checks, tests, backward compat)
- Extract shared tick logic into helper functions that both engines can use

**`src/simulation/world.ts`**
- Add support for multiple clearings at different positions
- `generateWorld()` accepts array of clearing positions

**`src/store/simulation-store.ts`**
- Major refactor: store now holds `CompetitionState` instead of `SimulationState`
- Game loop ticks `CompetitionEngine`
- Maintain backward compatibility for single-village mode (optional)
- Add village selection for AI type assignment

**`src/simulation/ai/ai-interface.ts`**
- Add `villageId: string` to `AIWorldView` so AI knows which village it belongs to

### Tests to write

**`tests/competition-engine.test.ts`** (new file)
- Two villages initialized on same world
- Each village has its own villagers and stockpile
- Villages don't interfere with each other's stockpiles
- Both villages experience same time/season progression
- Village elimination when all villagers die
- Simulation ends when all villages eliminated
- Last village standing declared winner
- World shared between villages (same tile data)
- Each village has distinct starting position and clearing
- Deterministic: same seed produces identical competition state

---

## Step 8: Event Mirroring

**Goal:** Random events happen simultaneously to both villages for fair comparison.

### Design

Events are scheduled globally (not per-village). When an event fires:
- Both villages receive the event on the same tick
- Event parameters (severity, duration) are identical
- Event position is translated relative to each village's campfire (offset by same relative vector)
- This ensures both villages face identical challenges at the same time

### Files to modify

**`src/simulation/events.ts`**
- `EventScheduler` generates events with relative positions (offset from campfire)
- When processing, apply the offset to each village's campfire independently
- Expose `mirrorEventToVillage(event, campfirePosition): RandomEvent` function

**`src/simulation/competition-engine.ts`**
- Single event scheduler for the competition
- Mirror each event to all villages
- Both villages process the same events on the same tick

### Tests to write

**`tests/event-mirroring.test.ts`** (new file)
- Both villages receive predator on same tick
- Event severity identical across villages
- Event position relative to each village's campfire
- Blight affects equivalent relative positions
- Cold snap affects both villages simultaneously
- Event sequence deterministic for same seed

---

## Step 9: Side-by-Side Dashboard

**Goal:** Two-column metrics comparison with per-village KPIs and charts.

### Design

The dashboard splits into two columns (Village A | Village B), each showing:
- KPI cards (population, prosperity, food, wood, stone, avg health, structures)
- Charts (population, resources, activity, prosperity) — overlaid or side-by-side
- Color coding: Village A = blue (#3b82f6), Village B = orange (#f97316)

Bottom strip: quick-compare table showing key metrics in a single row per village.

### Files to modify

**`src/views/MetricsDashboard.tsx`**
- Accept `CompetitionState` instead of `SimulationState`
- Render two columns of KPIs
- Overlay both villages' data on shared charts (dual lines/areas with legends)
- Add village color indicators

**`src/components/KPICard.tsx`**
- Support optional comparison value (Village B's value shown smaller beneath)

**`src/components/EventLog.tsx`**
- Color-code events by village
- Add village name prefix to each event message
- Global events (season changes) shown without village prefix

**`src/components/TopBar.tsx`**
- Show both village AI names (e.g., "Utility AI vs Behavior Tree")
- Season indicator shared between both

**`src/components/QuickCompare.tsx`** (new file)
- Bottom strip table: rows = metrics (pop, prosperity, food, wood, stone, structures, days survived)
- Columns = Village A, Village B
- Highlight leader per metric

**`src/store/simulation-store.ts`**
- Expose competition state to components
- Init creates CompetitionEngine with two villages

---

## Step 10: Quick-Compare & Event Log Updates

**Goal:** Bottom comparison strip and per-village event log.

### Files to create

**`src/components/QuickCompare.tsx`** (new file)
```typescript
export function QuickCompare({ villages }: { villages: VillageState[] }) {
  // Render comparison table
  // Metrics: Population, Prosperity, Food, Wood, Stone, Structures, Days
  // Color-code the leader for each metric
}
```

### Files to modify

**`src/views/MetricsDashboard.tsx`**
- Add QuickCompare component below charts
- Grid layout: charts | event log above, quick-compare strip below

**`src/components/EventLog.tsx`**
- Add `villageId` filter tabs (All | Village A | Village B)
- Color-code messages by source village
- Global events (season, random events) shown in neutral color

---

## Step 11: Cross-AI Determinism Test

**Goal:** Verify that both AI systems react to the same world — only decisions differ.

### Design
Run identical seed with:
1. Two Utility AI villages → verify identical world + event sequence
2. One Utility AI + one BT village → verify world generation and event sequence are identical to the double-Utility run

This proves that the comparison is fair: both AIs face the same world and events.

### Tests to write

**`tests/cross-ai-determinism.test.ts`** (new file)
- Same seed produces identical world for both villages
- Event sequence identical regardless of AI type
- Switching AI types doesn't alter event timing or parameters
- World state (tiles, resources) deterministic for same seed
- Only villager positions and actions differ between AI types

---

## Step 12: Phase 2 Acceptance Criteria

**Goal:** Automated acceptance checks for all Phase 2 features.

### New acceptance checks to add to `src/utils/acceptance-checks.ts`

**Simulation checks:**
- [ ] Season transitions correctly (7-day cycle)
- [ ] Warmth system active in winter
- [ ] Structures can be built and affect gameplay
- [ ] Population growth triggers with food + shelter
- [ ] Random events fire and resolve correctly

**AI checks:**
- [ ] Behavior Tree AI produces valid decisions
- [ ] BT and Utility AI show distinct behavior patterns
- [ ] Both AI systems survive 15+ days

**Competition checks:**
- [ ] Two villages run simultaneously
- [ ] Events mirrored fairly across villages
- [ ] Prosperity divergence visible (villages perform differently)

**UI checks:**
- [ ] Side-by-side KPI cards for both villages
- [ ] Charts show dual-village data
- [ ] Quick-compare table rendered
- [ ] Event log shows village-coded entries

---

## Step 13: Test Suite Updates

Update existing tests for Phase 2 compatibility and add regression tests.

### Existing test files to update

**`tests/simulation-engine.test.ts`**
- Update for season field in state
- Update for structures array in state
- Verify backward compatibility of single-village engine

**`tests/actions.test.ts`**
- Add tests for mine_stone action
- Add tests for build action
- Update duration tests for seasonal penalties
- Update yield tests for seasonal modifiers

**`tests/villager.test.ts`**
- Add warmth need to creation tests
- Update tickNeeds tests for warmth drain in winter
- Test exposure damage mechanics

**`tests/utility-ai.test.ts`**
- Add tests for warmth-related decisions
- Add tests for build decisions
- Add tests for mine_stone decisions
- Test seasonal awareness (autumn stockpiling)

**`tests/dom-free.test.ts`**
- Add new files to DOM-free validation: `structures.ts`, `events.ts`, `behavior-tree.ts`, `behavior-tree-ai.ts`, `competition-engine.ts`

---

## Dependency Graph

```
Step 1: Seasonal Cycle
  ↓
Step 2: Warmth + Winter  ←  depends on seasons
  ↓
Step 3: Structures  ←  depends on warmth (shelter provides warmth)
  ↓
Step 4: Population Growth  ←  depends on structures (shelter capacity)
  ↓
Step 5: Random Events  ←  depends on seasons (cold snap), structures (shelter)
  ↓
Step 6: Behavior Tree AI  ←  depends on ALL above (needs all systems to reason about)
  ↓
Step 7: Dual Village Architecture  ←  depends on BT (needs both AIs)
  ↓
Step 8: Event Mirroring  ←  depends on dual village + events
  ↓
Step 9: Side-by-Side Dashboard  ←  depends on dual village
  ↓
Step 10: Quick-Compare + Event Log  ←  depends on dashboard
  ↓
Steps 11-13: Testing + Acceptance  ←  depends on everything
```

---

## New File Summary

| File | Purpose | Approx Size |
|------|---------|-------------|
| `src/simulation/structures.ts` | Structure types, costs, effects, placement | ~120 lines |
| `src/simulation/events.ts` | Random event system, scheduler, mirroring | ~180 lines |
| `src/simulation/ai/behavior-tree.ts` | BT node types (Selector, Sequence, Condition, Action) | ~150 lines |
| `src/simulation/ai/behavior-tree-ai.ts` | BT AI implementing IAISystem | ~200 lines |
| `src/simulation/competition-engine.ts` | Dual village engine | ~300 lines |
| `src/components/QuickCompare.tsx` | Comparison table component | ~80 lines |
| `tests/season.test.ts` | Season cycle tests | ~100 lines |
| `tests/warmth.test.ts` | Warmth/winter tests | ~80 lines |
| `tests/structures.test.ts` | Structure building/effects tests | ~120 lines |
| `tests/population.test.ts` | Population growth tests | ~80 lines |
| `tests/events.test.ts` | Random event tests | ~100 lines |
| `tests/behavior-tree.test.ts` | BT node and AI tests | ~120 lines |
| `tests/competition-engine.test.ts` | Dual village tests | ~100 lines |
| `tests/event-mirroring.test.ts` | Fair event distribution tests | ~80 lines |
| `tests/cross-ai-determinism.test.ts` | Cross-AI comparison fairness | ~60 lines |

**Total new files:** 15
**Total estimated new code:** ~1,870 lines
**Files to modify:** ~15 existing files

---

## Milestone Deliverable

> Two villages competing on the dashboard. Clear divergence visible in metrics. Event log tells the story. Population growth and winter survival create meaningful strategic differentiation.

When Phase 2 is complete:
- User clicks Start and sees two villages (Utility AI vs Behavior Tree) running side-by-side
- Dashboard shows diverging prosperity curves, different resource strategies
- Event log narrates the story: births, deaths, seasons, random events — color-coded by village
- Quick-compare table shows who's winning at a glance
- Winter creates real danger (warmth system), shelters matter, population growth rewards planning
- Random events (predators, blight, cold snaps) test resilience
- All 111+ existing tests still pass, ~100+ new tests added
