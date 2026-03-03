# Phase 2: Competition — Implementation Plan

**Version:** 1.1
**Date:** March 3, 2026
**Goal:** Two villages side by side, Utility AI vs Behavior Trees, full comparison.

---

## Overview

Phase 2 transforms AI Colony from a single-village dashboard into a competitive dual-village simulation. This requires:

1. **New gameplay systems** — seasons, warmth, structures, population growth, random events
2. **Second AI system** — Behavior Trees (implementing the existing `IAISystem` interface)
3. **Dual village architecture** — two villages on mirrored identical worlds (same seed), each with its own AI
4. **Side-by-side dashboard** — two-column metrics comparison, village-aware event log
5. **Save/Load system** — serialize simulation snapshots to localStorage for replay

**Key architectural note:** In Phase 2, each village runs on its **own identical copy** of the world (mirrored maps from the same seed). Villages do NOT share a world — resource depletion in Village A's forest does not affect Village B's forest. This ensures a fair comparison where only AI decisions differ. Shared-world competition is Phase 6.

The plan is organized into 14 implementation steps across 5 blocks. Each step lists files to create/modify, the key changes, and the tests to write.

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
Steps 7, 9. Dual village engine with mirrored worlds + event mirroring. The big structural refactor.

### Block D: Dashboard, UI & Persistence
Steps 8, 10. Side-by-side layout, village-aware event log, quick-compare table, save/load.

### Block E: Acceptance & Testing
Steps 11–14. Cross-AI determinism, event mirroring validation, Phase 2 acceptance criteria, regression.

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
- Introduce a `TickContext` object to thread time/season through the action system without changing every function signature: `{ timeOfDay: TimeOfDay, season: Season, structures: Structure[] }`
- Pass `TickContext` to `getEffectiveDuration()`, `canPerform()`, and `complete()` instead of adding individual parameters
- `getEffectiveDuration(ctx)`: apply winter outdoor penalty (×1.5) and night penalty (×1.5) multiplicatively: `ceil(base * winterMult * nightMult)`. A winter night forage = `ceil(3 * 1.5 * 1.5)` = `ceil(6.75)` = 7 ticks
- Add season-aware yield modifiers to `complete()` for forage/fish:
  - Autumn: yield × 1.5 (rounded down)
  - Winter: yield × 0.75 (rounded down)

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

Structures are placed on passable tiles near the campfire (within a settlement radius of ~5 tiles). Each structure occupies one tile but does NOT block movement — villagers can walk through structures to interact with them. This avoids pathfinding complications in a small settlement area.

### Build action design decision

The `build` action needs to communicate *what* to build. Rather than extending `AIDecision` (which would complicate the shared AI interface for Phase 3+ AI systems), we use separate action types: `build_shelter` and `build_storage`. This keeps each action self-contained — the action type IS the intent. Add these to the `VillagerAction` union type.

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

export const STRUCTURE_COSTS: Record<StructureType, StructureCost> = {
  shelter: { wood: 20, stone: 0 },
  storage: { wood: 15, stone: 10 },
}

export function canAfford(stockpile: VillageStockpile, type: StructureType): boolean
export function deductCost(stockpile: VillageStockpile, type: StructureType): void
export function findBuildSite(world: World, campfire: Position, structures: Structure[], rng: SeededRNG): Position | null
export function getShelterCapacity(structures: Structure[]): number  // 3 per shelter
export function getStorageBonus(structures: Structure[]): number     // 100 per storage
export function isAtStructure(pos: Position, structures: Structure[], type?: StructureType): boolean
```

### Files to modify

**`src/simulation/villager.ts`**
- Add `'build_shelter' | 'build_storage' | 'mine_stone'` to `VillagerAction` (replace `'build'`)

**`src/simulation/simulation-engine.ts`**
- Add `structures: Structure[]` to `SimulationState`
- Initialize as empty array
- Pass structures via `TickContext` to action system
- Update prosperity recording: count structures and unique types
- Add structure-built events (new event type: `'structure_built'`)
- Storage bonus: apply `getStorageBonus()` as max cap check when depositing resources

**`src/simulation/actions.ts`**
- Add `MINE_STONE_ACTION`: duration 5, energyCost 2, requires adjacent stone tile, yields 6–10 stone via `TickContext`
- Add `BUILD_SHELTER_ACTION`: duration 6, energyCost 2, requires at valid build site + `canAfford(stockpile, 'shelter')`, on complete: deduct 20 wood, create shelter Structure
- Add `BUILD_STORAGE_ACTION`: duration 6, energyCost 2, requires at valid build site + `canAfford(stockpile, 'storage')`, on complete: deduct 15 wood + 10 stone, create storage Structure
- Modify `REST_ACTION.complete()`: check if at shelter for bonus (rest at shelter: +30, at campfire: +20, elsewhere: +15)
- Modify `WARM_UP_ACTION.complete()`: at shelter: +30 warmth (vs +25 at campfire, +20 elsewhere)
- Register `mine_stone`, `build_shelter`, `build_storage` in `ACTION_MAP`

**`src/simulation/ai/utility-ai.ts`**
- Add `mine_stone` scoring (weights: `{ hunger: 0.1, energy: 0.1, health: 0.1 }`, environmental bonus when stone stockpile < 15)
- Add `build_shelter` scoring: high when `population > getShelterCapacity(structures)` AND `canAfford`
- Add `build_storage` scoring: moderate when no storage exists AND stockpile nearing cap AND `canAfford`
- Target position for build: find build site near campfire via `findBuildSite()`
- Target position for mine_stone: find nearest stone tile (similar to `findNearestForest`)

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

## Step 5: Random Events + Flee Action

**Goal:** Periodic events that challenge villages, plus the flee mechanic for predator response.

### Design

Events fire every 5–10 days (seeded RNG determines timing and type). Each event is deterministic for a given seed. Cold snaps fire specifically during autumn (testing winter preparedness).

| Event | Effect | Duration | Severity |
|-------|--------|----------|----------|
| Predator Attack | Villager within 5 tiles takes 20–40 health damage; must flee | Instant | High |
| Blight | Food sources in 5-tile radius destroyed, regrow after 3 days (90 ticks) | 3 days | Medium |
| Cold Snap | Warmth drains at winter rate for 2 days; fires mid-autumn only | 2 days | Medium |

**Flee action design:**
- Duration: 0 (instant movement)
- Movement speed: 2 tiles per tick (vs normal 1 tile/tick) — achieved by pathfinding away from threat and double-stepping the path
- Energy cost: 2/tick while fleeing
- Target: move to tile 8+ tiles from predator position
- AI triggers: when predator event is active and villager is within 5 tiles of predator position
- No resource yield — pure survival action

### New file

**`src/simulation/events.ts`** (new file)
```typescript
export type RandomEventType = 'predator' | 'blight' | 'cold_snap'

export interface RandomEvent {
  type: RandomEventType
  triggerTick: number
  /** Relative offset from campfire where event occurs — applied per-village */
  relativePosition: { dx: number; dy: number }
  radius: number           // Affected area (tiles)
  durationTicks: number    // Ticks remaining (0 for instant events)
  severity: number         // Damage/intensity parameter (e.g. 20-40 for predator)
}

export class EventScheduler {
  constructor(rng: SeededRNG)
  /** Check if a new event should fire this day. Returns event or null. */
  checkForEvent(dayCount: number, season: Season): RandomEvent | null
  /** Apply per-tick effects of active events to a village's state */
  processActiveEvents(events: RandomEvent[], villagers: Villager[], world: World, campfire: Position): void
  /** Decrement durations, remove expired events */
  tickEvents(events: RandomEvent[]): RandomEvent[]
}
```

### Files to modify

**`src/simulation/simulation-engine.ts`**
- Add `activeEvents: RandomEvent[]` to `SimulationState`
- Create `EventScheduler` instance with forked seeded RNG
- On each tick: process active events (apply effects, decrement duration)
- On day boundary: check for new event via scheduler
- Add event log entries for random events (new type: `'random_event'`)

**`src/simulation/actions.ts`**
- Add `FLEE_ACTION`: duration 0, energyCost 2/tick, can always perform, movement at 2× speed
- Register `flee` in `ACTION_MAP`

**`src/simulation/simulation-engine.ts` (movement phase)**
- When villager's current action is `flee`, pop 2 path nodes per tick instead of 1 (2× movement speed)

**`src/simulation/world.ts`**
- Add `blightTiles: Map<string, number>` tracking `"x,y" → ticksRemaining`
- `applyBlight(cx, cy, radius)`: set all forest tile resources to 0 within radius, add to blight map
- In `tickRegeneration()`: decrement blight timers, restore tiles when timer expires (reset to maxResource)

**`src/simulation/ai/ai-interface.ts`**
- Add `activeEvents: ReadonlyArray<Readonly<RandomEvent>>` to `AIWorldView`

**`src/simulation/ai/utility-ai.ts`**
- Score `flee` highly when predator active within 5 tiles
- Reduce score of outdoor actions near blight zones
- Score `warm_up` more when cold snap active

### Tests to write

**`tests/events.test.ts`** (new file)
- Event scheduler produces deterministic events for same seed
- Predator damages villagers within radius
- Flee action moves villager at 2× speed away from threat
- Blight destroys food sources temporarily
- Blighted tiles recover after 3 days
- Cold snap fires only during autumn
- Cold snap activates warmth drain for 2 days
- Events logged in event log
- Event timing is deterministic across runs
- Multiple events don't stack to degenerate difficulty
- No events before day 5 (grace period for village startup)

---

## Step 6: Behavior Tree AI

**Goal:** Second AI system implementing `IAISystem`, using hierarchical decision trees.

### Design

The behavior tree evaluates top-to-bottom each tick. First matching branch wins.

**Note:** The master plan labels the Emergency branch as "Sequence", but its children are independent emergency conditions (health crisis OR predator threat, not both). This is corrected to Selector below — if health is critical, handle that; otherwise if a threat is near, flee. A Sequence would require BOTH conditions to be true simultaneously, which is not the intent.

```
Root (Selector)
├── Emergency (Selector — corrected from Sequence in master plan)
│   ├── health < 20? → find food/shelter → eat/rest
│   └── predator event active within 5 tiles? → flee
├── Critical Needs (Priority Selector)
│   ├── hunger < 25? → go to stockpile → eat (or forage if stockpile empty)
│   ├── energy < 20? → go to shelter/campfire → rest
│   └── warmth < 25 AND (winter OR cold snap active)? → go to fire/shelter → warm_up
├── Village Tasks (Priority Selector)
│   ├── food stockpile < 30? → find forest → forage → haul
│   ├── wood stockpile < 20? → find forest → chop_wood → haul
│   ├── shelters < ceil(population/3)? → go to build site → build_shelter
│   ├── no storage AND any stockpile > 80? → go to build site → build_storage
│   └── stone stockpile < 10 AND storage needed? → find stone → mine_stone → haul
├── Proactive (Priority Selector)
│   ├── season is autumn? → lower stockpile thresholds (food < 50, wood < 30 instead of 30/20)
│   └── carrying resources? → haul to campfire
└── Idle → rest if energy < 60, otherwise wander toward nearest unexplored tile
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

**Goal:** Run two independent villages on mirrored identical worlds with different AI systems.

### Design

**Mirrored worlds, not shared:** Each village gets its own World instance generated from the same seed. Both worlds are byte-for-byte identical at creation. Resource depletion, blight, and other world mutations happen independently per village. This ensures a perfectly fair comparison — the only variable is the AI system. Shared-world competition is a Phase 6 feature.

The competition engine manages two `VillageState` instances, each containing its own world. Global state (tick, day, season, random event schedule) is shared.

Each village has:
- Its own World (mirrored from same seed)
- Its own villagers, stockpile, structures, growth timer
- Its own AI system
- Its own forked RNG (deterministic per village)
- Same campfire position (center of its own map)

### End conditions (from master plan)

- **Village elimination:** population = 0. Log cause-of-death summary (e.g., "Village A eliminated — starvation during winter, day 47"). Freeze metrics on dashboard but keep visible for comparison.
- **All eliminated:** simulation ends, no winner, show comparative analysis
- **Last village standing:** winner declared, simulation continues for **10 more in-game days** ("victory lap") then ends
- **Simultaneous elimination:** if both hit 0 on same tick, tie — no winner
- **Stalemate detection:** if no village's prosperity changes by >5% over last 30 days, show "Stagnation" warning on dashboard (informational only, doesn't auto-end)
- **Critical population:** when a village is down to 1 villager, log a "critical population" warning
- **Manual stop / time limit:** compare all surviving villages on prosperity score

### New file

**`src/simulation/competition-engine.ts`** (new file)
```typescript
export interface VillageConfig {
  id: string
  name: string
  aiSystem: IAISystem
  villagerCount: number
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
  world: World                    // Each village has its OWN mirrored world
  villagers: Villager[]
  stockpile: VillageStockpile
  structures: Structure[]
  aiSystem: IAISystem
  campfirePosition: Position
  history: SimulationHistory
  events: SimulationEvent[]       // Per-village events (deaths, births, structures)
  isEliminated: boolean
  eliminationTick: number | null
  eliminationCause: string | null // e.g. "starvation during winter"
}

export interface CompetitionState {
  villages: VillageState[]
  tick: number
  dayCount: number
  timeOfDay: TimeOfDay
  season: Season
  seasonDay: number
  activeEvents: RandomEvent[]     // Global random events (mirrored to all villages)
  globalEvents: SimulationEvent[] // Season changes, random events, stagnation warnings
  isOver: boolean
  winner: string | null           // Village id, or null for tie/all-eliminated
  victoryLapRemaining: number     // Days remaining in victory lap (0 if not in lap)
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
- Extract shared tick logic into reusable helper functions: `tickVillagerNeeds()`, `tickVillagerActions()`, `tickVillagerMovement()`, `tickAIDecisions()`, `tickPopulationGrowth()`
- Both `SimulationEngine` and `CompetitionEngine` call these shared helpers

**`src/simulation/world.ts`**
- No changes needed — each village creates its own `new World({ width, height, seed })` which already produces identical worlds for the same seed

**`src/store/simulation-store.ts`**
- Major refactor: store now holds `CompetitionState` instead of `SimulationState`
- Game loop ticks `CompetitionEngine`
- `init()` creates CompetitionEngine with two villages (Utility AI vs BT)
- Maintain backward compatibility: accept `mode: 'single' | 'competition'` (optional, default competition)

**`src/simulation/ai/ai-interface.ts`**
- Add `villageId: string` to `AIWorldView` so AI knows which village it belongs to

**`src/simulation/simulation-engine.ts` — SimulationEvent type**
- Expand to: `'death' | 'birth' | 'day_start' | 'night_start' | 'season_change' | 'milestone' | 'structure_built' | 'random_event' | 'village_eliminated' | 'critical_population' | 'stagnation_warning'`

### Tests to write

**`tests/competition-engine.test.ts`** (new file)
- Two villages initialized with mirrored worlds from same seed
- Worlds are identical at tick 0 (same tile data)
- Each village has its own villagers and stockpile
- Villages don't interfere with each other's worlds or stockpiles
- Resource depletion in Village A doesn't affect Village B's world
- Both villages experience same time/season progression
- Village elimination when all villagers die, with cause-of-death
- Simulation ends when all villages eliminated
- Last village standing triggers victory lap (10 days)
- Simultaneous elimination results in tie
- Stalemate detection after 30 days of <5% prosperity change
- Critical population warning at 1 villager
- Deterministic: same seed produces identical competition state

---

## Step 8: Side-by-Side Dashboard, Quick-Compare & Event Log

**Goal:** Two-column metrics comparison with per-village KPIs, overlaid charts, quick-compare strip, and village-aware event log.

### Design

The dashboard presents both villages in a unified view:
- **KPI cards:** Two rows — one per village, color-coded
- **Charts:** Both villages overlaid on shared charts with dual lines/areas and legend
- **Quick-compare table:** Bottom strip with one row per village, leader highlighted per metric
- **Event log:** Combined log with village name prefix, color-coded per village, filter tabs
- **Color coding:** Village A = blue (#3b82f6), Village B = orange (#f97316), global = neutral gray

### New file

**`src/components/QuickCompare.tsx`** (new file)
```typescript
export function QuickCompare({ villages }: { villages: VillageState[] }) {
  // Render comparison table
  // Metrics: Population, Prosperity, Food, Wood, Stone, Structures, Avg Health
  // Color-code the leader for each metric (bold + slight background tint)
  // Show eliminated villages grayed out with elimination day
}
```

### Files to modify

**`src/views/MetricsDashboard.tsx`**
- Accept `CompetitionState` instead of `SimulationState`
- Render two rows of KPIs (one per village, color-coded left border)
- Overlay both villages' data on shared charts (dual lines for population, dual stacked areas for resources, grouped bars for activity, dual lines for prosperity)
- Add village color indicators and legends
- Add QuickCompare component below charts
- Grid layout: KPIs | charts + event log | quick-compare strip
- Handle eliminated village: gray out its KPIs, freeze its chart data

**`src/components/KPICard.tsx`**
- Support optional `villageColor` prop for left border accent
- Support optional `eliminated` prop to gray out

**`src/components/EventLog.tsx`**
- Add `villageId` filter tabs (All | Village A | Village B)
- Color-code messages by source village (use village color for text/border)
- Global events (season changes, random events) shown in neutral gray
- Village-specific events prefixed with village name

**`src/components/TopBar.tsx`**
- Show matchup: "Utility AI vs Behavior Tree"
- Season indicator shared between both
- Show winner/victory lap status when applicable

**`src/store/simulation-store.ts`**
- Expose `CompetitionState` to components
- `init()` creates `CompetitionEngine` with Utility AI vs BT

---

## Step 9: Event Mirroring

**Goal:** Random events happen simultaneously to both villages for fair comparison.

### Design

Events are scheduled globally (not per-village) by a single `EventScheduler` with a shared RNG fork. When an event fires:
- Both villages receive the event on the same tick
- Event parameters (severity, duration) are identical
- Event position is specified as a relative offset from campfire (e.g., "5 tiles north, 3 tiles east"). Each village's world applies the same relative offset from its own campfire, so the event affects the equivalent position on each mirrored map.
- Since worlds are mirrored (identical), the equivalent position has the same tile type.

### Files to modify

**`src/simulation/events.ts`**
- `EventScheduler` generates events with `relativePosition: { dx, dy }` (offset from campfire)
- `resolveEventPosition(event, campfirePosition): Position` — convert relative to absolute
- Keep event definitions world-agnostic (positions are relative)

**`src/simulation/competition-engine.ts`**
- Single `EventScheduler` for the competition (shared RNG)
- On event fire: push same event to each village's `activeEvents`
- Each village processes the event against its own world independently

### Tests to write

**`tests/event-mirroring.test.ts`** (new file)
- Both villages receive predator on same tick
- Event severity identical across villages
- Event position relative to each village's campfire resolves to equivalent tile
- Blight affects equivalent relative positions on each mirrored world
- Cold snap affects both villages simultaneously
- Event sequence deterministic for same seed
- Switching AI types doesn't change event timing or parameters

---

## Step 10: Save/Load System

**Goal:** Serialize simulation state for persistence and deterministic replay.

### Design

The master plan specifies simulation snapshots as a Phase 2 feature. Key requirements:
- Serialize full `CompetitionState` to JSON
- Save to `localStorage` with user-provided label or auto-generated name (seed + timestamp)
- Load a snapshot to resume from that exact point
- Storage budget: 5 MB total localStorage cap
- Show storage usage in UI, allow deletion of old snapshots
- **RNG state must be captured** so that loading and pressing play produces identical results
- **AI state excluded** — BT and Utility AI are pure functions of world state, so they re-evaluate correctly after load

### New file

**`src/utils/serialization.ts`** (new file)
```typescript
export interface SimulationSnapshot {
  version: number                // Schema version for forward compat
  label: string                  // User-provided or auto-generated
  timestamp: number              // Date.now() when saved
  seed: number
  competitionState: SerializedCompetitionState
  rngState: number[]             // Captured RNG internal state for each fork
}

// Serialize World (tiles + blight map), Villagers, Stockpile, Structures, Events, History
export function serializeState(engine: CompetitionEngine): SimulationSnapshot
export function deserializeState(snapshot: SimulationSnapshot): CompetitionEngine

// localStorage management
export function saveSnapshot(snapshot: SimulationSnapshot): void
export function loadSnapshot(label: string): SimulationSnapshot | null
export function listSnapshots(): Array<{ label: string; timestamp: number; sizeBytes: number }>
export function deleteSnapshot(label: string): void
export function getStorageUsage(): { usedBytes: number; capBytes: number }
```

**RNG state capture:** The `SeededRNG` interface needs a way to capture and restore internal state. Add `getState(): number` and `static fromState(state: number): SeededRNG` to `seed.ts`. Since Mulberry32 uses a single 32-bit integer as state, this is trivial.

**Serialization of Map/Set:** `NeedsMap` is a `Map<NeedType, NeedState>`. Serialize as an array of `[key, value]` pairs. Reconstruct on load.

### Files to modify

**`src/utils/seed.ts`**
- Add `getState(): number` to `SeededRNG` — returns current internal state integer
- Add `createRNGFromState(state: number): SeededRNG` — restores from captured state
- Ensure all forked RNGs can also capture/restore state

**`src/simulation/competition-engine.ts`**
- Expose `getRNGStates(): Record<string, number>` — capture all RNG forks
- Accept optional `rngStates` in constructor for restoration

**`src/store/simulation-store.ts`**
- Add `saveSnapshot(label?: string): void`
- Add `loadSnapshot(label: string): void`
- Add `getSnapshots(): SnapshotInfo[]`
- Add `deleteSnapshot(label: string): void`

**`src/components/TopBar.tsx`**
- Add Save button (opens label input or auto-saves)
- Add Load dropdown (list saved snapshots, click to load)
- Show storage usage indicator

### Tests to write

**`tests/serialization.test.ts`** (new file)
- Round-trip: serialize → deserialize → state is identical
- RNG state restored correctly: resumed simulation matches original
- Deterministic replay: save at tick 100, load, run 100 more ticks — identical to continuous run of 200 ticks
- NeedsMap serialization handles Map correctly
- World tiles and blight state serialized correctly
- Storage cap enforced (reject save when over 5 MB)
- Snapshot listing and deletion works
- Schema version included for forward compatibility
- Snapshot label auto-generated from seed + timestamp

---

## Step 11: Cross-AI Determinism Test

**Goal:** Verify that both AI systems react to the same world — only decisions differ.

### Design
Run identical seed with:
1. Two Utility AI villages → verify identical world generation + event sequence
2. One Utility AI + one BT village → verify world generation and event sequence are identical to the double-Utility run

This proves that the comparison is fair: both AIs face the same starting world and events. World state diverges over time (different harvesting patterns), but initial world and event schedule are always identical.

### Tests to write

**`tests/cross-ai-determinism.test.ts`** (new file)
- Same seed produces identical worlds for both villages at tick 0
- Event schedule (types, timing, relative positions) identical regardless of AI type
- Switching AI types doesn't alter event timing or parameters
- World state at tick 0 is byte-for-byte identical across villages
- After 100 ticks: only villager positions, actions, stockpiles, and world resources differ
- Season/time progression identical for both villages

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

**Persistence checks:**
- [ ] Save snapshot to localStorage
- [ ] Load snapshot and resume produces identical results to continuous run
- [ ] Storage usage displayed correctly

**UI checks:**
- [ ] Side-by-side KPI cards for both villages
- [ ] Charts show dual-village data
- [ ] Quick-compare table rendered
- [ ] Event log shows village-coded entries
- [ ] Save/Load controls in top bar

---

## Step 13: Phase 1 Regression + Snapshot Update

**Goal:** Ensure all Phase 1 tests still pass with Phase 2 changes.

### Key concern

Adding warmth as a 4th need changes the deterministic snapshot. Every test that asserts exact state (snapshot tests, determinism tests) will break when we add the warmth field. This needs explicit handling:

- Update the Phase 1 deterministic snapshot test expected values
- Update `createDefaultNeeds()` tests to expect 4 needs instead of 3
- Update any tests that count needs or iterate needs

This step should be done incrementally during Steps 1–3 (each time a new need or state field is added), but verified holistically at the end.

---

## Step 14: Test Suite Updates

Update existing tests for Phase 2 compatibility and add regression tests.

### Existing test files to update

**`tests/simulation-engine.test.ts`**
- Update for season field in state
- Update for structures array in state
- Verify backward compatibility of single-village engine

**`tests/actions.test.ts`**
- Add tests for mine_stone action
- Add tests for build_shelter and build_storage actions
- Add tests for flee action (2× movement speed)
- Add tests for warm_up action
- Update duration tests for seasonal penalties (TickContext)
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
- Add new files to DOM-free validation: `structures.ts`, `events.ts`, `behavior-tree.ts`, `behavior-tree-ai.ts`, `competition-engine.ts`, `serialization.ts`

**`tests/villager.test.ts`** (additional)
- Name pool handles >20 villagers gracefully (population growth can exceed name pool size)
- Verify unique IDs for all villagers including spawned ones

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
Step 5: Random Events + Flee  ←  depends on seasons (cold snap), structures (shelter)
  ↓
Step 6: Behavior Tree AI  ←  depends on ALL above (needs all systems to reason about)
  ↓
Step 7: Dual Village (mirrored worlds)  ←  depends on BT (needs both AIs)
  ├─→ Step 8: Dashboard + Quick-Compare  ←  depends on dual village
  └─→ Step 9: Event Mirroring  ←  depends on dual village + events
  ↓
Step 10: Save/Load  ←  depends on competition engine being stable
  ↓
Steps 11-14: Testing + Acceptance + Regression  ←  depends on everything
```

Note: Steps 8 (dashboard) and 9 (event mirroring) are independent of each other and can be parallelized. Step 10 (save/load) depends on the competition engine being stable.

---

## New File Summary

| File | Purpose | Approx Size |
|------|---------|-------------|
| `src/simulation/structures.ts` | Structure types, costs, effects, placement | ~120 lines |
| `src/simulation/events.ts` | Random event system, scheduler, flee support | ~200 lines |
| `src/simulation/ai/behavior-tree.ts` | BT node types (Selector, Sequence, Condition, Action) | ~150 lines |
| `src/simulation/ai/behavior-tree-ai.ts` | BT AI implementing IAISystem | ~220 lines |
| `src/simulation/competition-engine.ts` | Dual village engine with mirrored worlds | ~350 lines |
| `src/utils/serialization.ts` | Save/load snapshots to localStorage | ~180 lines |
| `src/components/QuickCompare.tsx` | Comparison table component | ~80 lines |
| `tests/season.test.ts` | Season cycle tests | ~100 lines |
| `tests/warmth.test.ts` | Warmth/winter tests | ~80 lines |
| `tests/structures.test.ts` | Structure building/effects tests | ~120 lines |
| `tests/population.test.ts` | Population growth tests | ~80 lines |
| `tests/events.test.ts` | Random event + flee tests | ~120 lines |
| `tests/behavior-tree.test.ts` | BT node and AI tests | ~120 lines |
| `tests/competition-engine.test.ts` | Dual village + end conditions tests | ~130 lines |
| `tests/event-mirroring.test.ts` | Fair event distribution tests | ~80 lines |
| `tests/cross-ai-determinism.test.ts` | Cross-AI comparison fairness | ~70 lines |
| `tests/serialization.test.ts` | Save/load round-trip + deterministic replay | ~100 lines |

**Total new files:** 17
**Total estimated new code:** ~2,300 lines
**Files to modify:** ~15 existing files

---

## Milestone Deliverable

> Two villages competing on the dashboard. Clear divergence visible in metrics. Event log tells the story. Population growth and winter survival create meaningful strategic differentiation.

When Phase 2 is complete:
- User clicks Start and sees two villages (Utility AI vs Behavior Tree) running side-by-side on mirrored identical worlds
- Dashboard shows diverging prosperity curves, different resource strategies
- Event log narrates the story: births, deaths, seasons, random events — color-coded by village
- Quick-compare table shows who's winning at a glance
- Winter creates real danger (warmth system), shelters matter, population growth rewards planning
- Random events (predators, blight, cold snaps) test resilience — mirrored fairly to both villages
- Population growth from food surplus + shelter capacity creates strategic differentiation
- Structures (shelters, storage) are meaningful investments that affect survival
- Save/load snapshots let users rewind to key moments and replay
- End conditions: village elimination with cause-of-death, victory lap, stalemate detection
- All 111+ existing tests still pass, ~120 new tests added
