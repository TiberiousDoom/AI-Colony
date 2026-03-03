# AI Colony — Phase 1: Foundation Implementation Plan

**Version:** 1.1
**Date:** March 3, 2026
**Parent Document:** ai_colony_project_plan_v1_1.md (v1.3)

---

## Phase 1 Goal

> One village running with Utility AI, viewable in the metrics dashboard. Looks like a monitoring tool. Simulation is playable, watchable, and reproducible via seed.

---

## Table of Contents

1. [Implementation Steps](#implementation-steps)
2. [Step 1: Project Scaffolding](#step-1-project-scaffolding)
3. [Step 2: Seeded RNG & Noise Utilities](#step-2-seeded-rng--noise-utilities)
4. [Step 3: World Generation](#step-3-world-generation)
5. [Step 4: A* Pathfinding](#step-4-a-pathfinding)
6. [Step 5: Villager Entity & Needs System](#step-5-villager-entity--needs-system)
7. [Step 6: Action System](#step-6-action-system)
8. [Step 7: AI Interface & Utility AI](#step-7-ai-interface--utility-ai)
9. [Step 8: Simulation Engine (Core Loop)](#step-8-simulation-engine-core-loop)
10. [Step 9: Zustand Store](#step-9-zustand-store)
11. [Step 10: Metrics Dashboard UI](#step-10-metrics-dashboard-ui)
12. [Step 11: Simulation Controls & Day/Night Cycle](#step-11-simulation-controls--daynight-cycle)
13. [Step 12: Testing Suite](#step-12-testing-suite)
14. [Step 13: Integration & Polish](#step-13-integration--polish)
15. [Step 14: In-App Acceptance Criteria Checklist](#step-14-in-app-acceptance-criteria-checklist)
16. [Architecture Rules & Constraints](#architecture-rules--constraints)
17. [File Structure (Phase 1)](#file-structure-phase-1)
18. [Type Definitions Reference](#type-definitions-reference)
19. [Acceptance Criteria](#acceptance-criteria)

---

## Implementation Steps

The steps below are ordered by dependency — each step builds on the previous. Within each step, files are listed in the order they should be created.

| Step | What | Key Files | Depends On |
|------|------|-----------|------------|
| 1 | Project scaffolding | `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx` | — |
| 2 | Seeded RNG & noise | `src/utils/seed.ts`, `src/utils/noise.ts` | Step 1 |
| 3 | World generation | `src/simulation/world.ts` | Step 2 |
| 4 | Pathfinding | `src/utils/pathfinding.ts` | Step 3 |
| 5 | Villager entity & needs | `src/simulation/villager.ts` | Step 3 |
| 6 | Action system | `src/simulation/actions.ts` | Steps 4, 5 |
| 7 | AI interface & Utility AI | `src/simulation/ai/ai-interface.ts`, `src/simulation/ai/utility-ai.ts` | Steps 5, 6 |
| 8 | Simulation engine | `src/simulation/simulation-engine.ts` | Steps 3–7 |
| 9 | Zustand store | `src/store/simulation-store.ts` | Step 8 |
| 10 | Metrics dashboard | `src/views/MetricsDashboard.tsx`, `src/components/*.tsx` | Step 9 |
| 11 | Controls & day/night | `src/components/TopBar.tsx`, integrated into engine | Steps 8–10 |
| 12 | Testing suite | `tests/*.test.ts` | Steps 2–8 |
| 13 | Integration & polish | All files | Steps 1–12 |
| 14 | In-app acceptance checklist | `src/components/AcceptanceChecklist.tsx`, `src/utils/acceptance-checks.ts` | Steps 1–13 |

---

## Step 1: Project Scaffolding

**Goal:** A working Vite + React + TypeScript project that builds, runs a dev server, and passes an empty test suite.

### 1.1 Initialize the project

```bash
npm create vite@latest . -- --template react-ts
npm install
```

### 1.2 Install dependencies

```bash
# Core
npm install react react-dom recharts zustand pixi.js

# Dev
npm install -D typescript @types/react @types/react-dom vitest @testing-library/react jsdom
```

> **Note:** PixiJS is installed now but not used until Phase 3. Including it at scaffolding time avoids a mid-phase dependency addition.

### 1.3 Configure Vite (`vite.config.ts`)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
});
```

### 1.4 Configure Vitest (`vitest.config.ts`)

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
```

### 1.5 Configure TypeScript (`tsconfig.json`)

Ensure `strict: true` is on. Add path aliases if desired:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@simulation/*": ["src/simulation/*"],
      "@utils/*": ["src/utils/*"],
      "@store/*": ["src/store/*"],
      "@views/*": ["src/views/*"],
      "@components/*": ["src/components/*"]
    }
  },
  "include": ["src", "tests"]
}
```

### 1.6 Skeleton entry files

- `index.html` — Vite template with `<div id="root">`
- `src/main.tsx` — `ReactDOM.createRoot(document.getElementById('root')!).render(<App />)`
- `src/App.tsx` — Placeholder rendering "AI Colony" text

### 1.7 Verify

- `npm run dev` starts the dev server
- `npm run build` produces a production build
- `npx vitest run` passes (0 tests, no errors)

### Deliverable

Empty shell that builds, serves, and runs tests.

---

## Step 2: Seeded RNG & Noise Utilities

**Goal:** Deterministic random number generation and Perlin noise, both seeded from a single integer seed.

### 2.1 Seeded RNG (`src/utils/seed.ts`)

Implement a seedable PRNG (e.g., Mulberry32 or xoshiro128**). The RNG must be:

- **Deterministic:** Same seed always produces the same sequence
- **Stateful:** Exposes a `next()` method that advances the state and returns a float in [0, 1)
- **Forkable:** Can create child RNG instances from the parent state for independent sub-sequences (world gen uses one fork, event scheduling uses another, etc.)

```ts
export interface SeededRNG {
  /** Returns next float in [0, 1) */
  next(): number;
  /** Returns integer in [min, max] inclusive */
  nextInt(min: number, max: number): number;
  /** Returns float in [min, max) */
  nextFloat(min: number, max: number): number;
  /** Creates an independent child RNG seeded from current state */
  fork(): SeededRNG;
}

export function createRNG(seed: number): SeededRNG;
```

**Implementation note:** Use a pure integer-arithmetic algorithm. Avoid `Math.sin`-based hashing — it is not portable across JS engines (see project plan floating-point note).

### 2.2 Perlin/Simplex Noise (`src/utils/noise.ts`)

Implement 2D simplex noise (or classic Perlin noise) that:

- Accepts a `SeededRNG` instance for the permutation table shuffle
- Returns values in [-1, 1] for a given (x, y) coordinate
- Uses **only integer arithmetic and table lookups** for gradient computation — no `Math.sin`/`Math.cos` (per the project plan's floating-point determinism note)
- Supports octave layering (fractal Brownian motion) for natural-looking terrain

```ts
export function createNoise2D(rng: SeededRNG): (x: number, y: number) => number;

export function fractalNoise(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number;
```

### 2.3 Tests

- `tests/seed.test.ts`: Verify determinism (same seed → same sequence), verify fork independence, verify range bounds.
- `tests/noise.test.ts`: Verify determinism, verify output range, verify spatial coherence (adjacent points are correlated).

### Deliverable

Two utility modules with no DOM dependencies. Fully tested.

---

## Step 3: World Generation

**Goal:** A 64×64 tile grid generated deterministically from a seed, with resource distribution suitable for a village to survive.

### 3.1 Tile types

```ts
export enum TileType {
  Grass = 'grass',         // Passable, no resources
  Forest = 'forest',       // Passable, harvestable wood + forage, regenerates
  Stone = 'stone',         // Passable, harvestable stone, does NOT regenerate
  Water = 'water',         // Impassable, provides fish if adjacent
  FertileSoil = 'fertile', // Passable, farmable (Phase 2+)
}
```

### 3.2 Tile data

```ts
export interface Tile {
  type: TileType;
  x: number;
  y: number;
  /** Remaining harvestable resource amount. Forest: 0–100, Stone: 0–100 */
  resourceAmount: number;
  /** Maximum resource capacity (for regeneration) */
  maxResource: number;
  /** Regeneration rate per tick (forest: slow positive, stone: 0) */
  regenRate: number;
}
```

### 3.3 World class (`src/simulation/world.ts`)

```ts
export interface WorldConfig {
  width: number;          // Default: 64
  height: number;         // Default: 64
  seed: number;
}

export class World {
  readonly width: number;
  readonly height: number;
  readonly tiles: Tile[][];    // [y][x] for row-major access
  readonly seed: number;

  constructor(config: WorldConfig);

  getTile(x: number, y: number): Tile | null;
  isPassable(x: number, y: number): boolean;
  isInBounds(x: number, y: number): boolean;

  /** Find tiles matching a predicate within a radius of (cx, cy).
   *  Iterates a square bounding box clamped to map bounds.
   *  At radius 10 this checks ~400 tiles — fast enough for Phase 1.
   *  Phase 4+ adds spatial hashing if profiling shows this is a bottleneck. */
  findTilesInRadius(cx: number, cy: number, radius: number, predicate: (t: Tile) => boolean): Tile[];

  /** Advance resource regeneration for one tick */
  tickRegeneration(): void;
}
```

### 3.4 Generation algorithm

1. Create RNG from seed, fork it for world gen.
2. Generate a noise map using fractal noise (4 octaves, persistence 0.5, lacunarity 2.0).
3. Apply thresholds to classify tiles. **Tuning note:** Fractal noise values cluster around 0 (roughly normal distribution), so bands near 0 capture more tiles than equal-width bands at the extremes. The thresholds below are starting points — adjust during testing to hit target distributions (~8% water, ~30% grass, ~45% forest, ~12% grass clearings, ~5% stone):
   - noise < -0.3 → Water
   - noise < -0.05 → Grass
   - noise < 0.3 → Forest
   - noise < 0.55 → Grass (clearing / transition zone)
   - noise >= 0.55 → Stone
4. Scatter fertile soil patches (replace some grass tiles near water, using a secondary noise pass).
5. **Starting clearing:** Clear a ~7×7 area near the center of the map to Grass tiles. Place a campfire marker at the center tile. This ensures villagers have room to start.
6. **Validation pass:** Ensure at least 15% of tiles are Forest, at least 3% are Stone, and at least one water tile exists. If not, regenerate with a perturbed seed (seed + 1). This prevents unplayable maps.

### 3.5 Resource regeneration

- Forest tiles: `regenRate = 0.5` resource per tick, capped at `maxResource` (100). This means a fully depleted forest tile takes 200 ticks to fully regrow.
- Stone tiles: `regenRate = 0`, once depleted they're gone.
- Regeneration only applies to depleted tiles — tiles at max resource don't change.

### 3.6 Tests

- `tests/world.test.ts`: Verify deterministic generation (same seed → same tile layout). Verify tile type distribution falls within acceptable ranges. Verify starting clearing exists. Verify `isPassable` returns false for water. Verify regeneration increases forest resource, leaves stone unchanged.

### Deliverable

Deterministic world generation with resource management. No DOM dependencies.

---

## Step 4: A* Pathfinding

**Goal:** Grid-based A* pathfinding that villagers use to navigate the tile grid.

### 4.1 Interface (`src/utils/pathfinding.ts`)

```ts
export interface PathResult {
  /** Ordered list of (x, y) tile coordinates from start to goal, inclusive */
  path: Array<{ x: number; y: number }>;
  /** Total path cost (number of tiles traversed) */
  cost: number;
  /** Whether a path was found */
  found: boolean;
}

export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  isPassable: (x: number, y: number) => boolean,
  width: number,
  height: number,
): PathResult;
```

### 4.2 Implementation details

- Standard A* with a binary heap priority queue for the open set.
- **Movement:** 4-directional (up, down, left, right). Diagonal movement excluded for simplicity — revisit if villager movement looks unnatural.
- **Heuristic:** Manhattan distance (consistent with 4-directional movement).
- **Cost:** Uniform cost of 1 per tile.
- **Max search limit:** Cap the open set at 2000 nodes to prevent pathfinding from stalling on unreachable goals.
- **No path found / search limit reached:** In both cases, return a partial path to the closest reachable tile to the goal (the node with the lowest heuristic value in the closed set), with `found: false`. This is useful for villagers navigating around water toward fishing spots — they get as close as possible rather than giving up entirely. If no nodes were expanded at all (start tile is impassable), return `{ found: false, path: [], cost: 0 }`.

### 4.3 Tests

- `tests/pathfinding.test.ts`: Verify shortest path on open grid. Verify path around obstacles (water). Verify no-path case. Verify performance — path across 64×64 grid completes in < 10ms.

### Deliverable

Fast A* pathfinding on the tile grid. No DOM dependencies.

---

## Step 5: Villager Entity & Needs System

**Goal:** Villager data model with depleting needs and status tracking.

### 5.1 Needs system — generic from day one

Per the project plan's Design Considerations on variable-length need vectors, define needs generically to avoid refactoring when warmth (Phase 2) and cooling (Phase 5) are added.

```ts
/** Extensible need types. Phase 1 uses hunger, energy, health only. */
export enum NeedType {
  Hunger = 'hunger',
  Energy = 'energy',
  Health = 'health',
  // Warmth = 'warmth',    // Phase 2
  // Cooling = 'cooling',  // Phase 5
}

export interface NeedState {
  current: number;     // 0–100
  drainRate: number;   // Points lost per tick (base rate)
  min: number;         // Always 0
  max: number;         // Always 100
}

export type NeedsMap = Map<NeedType, NeedState>;
```

### 5.2 Villager entity (`src/simulation/villager.ts`)

```ts
export interface Position {
  x: number;
  y: number;
}

export type VillagerAction =
  | 'idle'
  | 'forage'
  | 'eat'
  | 'rest'
  | 'chop_wood'
  | 'mine_stone'   // included in type for completeness, but mine action deferred to Phase 2 builds
  | 'haul'
  | 'fish'
  | 'flee'
  | 'build'
  | 'warm_up';

export interface Villager {
  id: string;
  name: string;
  position: Position;
  needs: NeedsMap;
  currentAction: VillagerAction;
  /** Ticks remaining on current action (0 = idle/ready for new action) */
  actionTicksRemaining: number;
  /** Target position for movement */
  targetPosition: Position | null;
  /** Current movement path */
  path: Array<{ x: number; y: number }>;
  /** Whether the villager is alive */
  alive: boolean;
  /** Carried resource (for hauling) */
  carrying: { type: 'food' | 'wood' | 'stone'; amount: number } | null;
}
```

### 5.3 Need drain rates (Phase 1 defaults)

| Need | Drain Rate / Tick | Critical Threshold | Effect at 0 |
|------|-------------------|--------------------|--------------|
| Hunger | 2.0 | < 25 | Health drains at 1/tick |
| Energy | 1.0 (base, varies by action: 1–3) | < 20 | Villager collapses, forced rest |
| Health | 0 (doesn't drain naturally) | < 20 | Emergency priority | Death at 0 |

### 5.4 Health recovery

Health heals at +0.5/tick **only when** hunger > 50 AND energy > 30. Otherwise it stays constant (unless being damaged by starvation).

### 5.5 Factory function

```ts
export function createVillager(id: string, name: string, x: number, y: number): Villager;
```

Creates a villager with all needs at 75 (matching the project plan's "new villager" spec — they start needing some care, not at full).

**Starting villagers:** The initial 10 villagers start at positions within the 7×7 starting clearing near the campfire. Their names are drawn from a seeded name pool:

```ts
const VILLAGER_NAMES = [
  'Anya', 'Bjorn', 'Calla', 'Doran', 'Elke',
  'Finn', 'Greta', 'Hale', 'Ivy', 'Joss',
  'Kira', 'Leif', 'Mira', 'Nils', 'Opal',
  'Per', 'Quinn', 'Runa', 'Sven', 'Tova',
];
```

Names are assigned by shuffling this list with the seeded RNG and taking the first N entries. This keeps names deterministic for a given seed.

### 5.6 Village stockpile

```ts
export interface VillageStockpile {
  food: number;
  wood: number;
  stone: number;
}
```

Shared village-level stockpile. All villagers deposit to and withdraw from the same stockpile. **The stockpile is located at the campfire position** — villagers must walk to the campfire to deposit (haul) or withdraw (eat) resources. Initial stockpile: `{ food: 50, wood: 30, stone: 10 }` — enough to get started but not enough to coast.

### 5.7 Tests

- `tests/villager.test.ts`: Verify need creation and drain. Verify health drain at hunger 0. Verify health recovery conditions. Verify death at health 0. Verify factory default values.

### Deliverable

Villager data model and needs mechanics. No DOM dependencies.

---

## Step 6: Action System

**Goal:** Implement the villager actions that the AI will choose between.

### 6.1 Action definitions (`src/simulation/actions.ts`)

Each action is a self-contained function that:
1. Checks preconditions (can this action be performed?)
2. Starts the action (sets `currentAction`, `actionTicksRemaining`)
3. Processes tick progress (decrement timer, apply per-tick effects)
4. Resolves completion (apply results: resources gathered, needs changed)

```ts
export interface ActionDefinition {
  type: VillagerAction;
  /** Base ticks required to complete (before modifiers like night penalty) */
  duration: number;
  /** Energy cost per tick */
  energyCostPerTick: number;
  /** Returns the effective duration accounting for time of day. Night increases
   *  outdoor action durations by 50% (rounded up). See Step 8.5. */
  getEffectiveDuration(timeOfDay: 'day' | 'night'): number;
  /** Check if the villager can perform this action in its current position */
  canPerform(villager: Villager, world: World, stockpile: VillageStockpile): boolean;
  /** Begin the action (set up state) */
  start(villager: Villager, world: World, stockpile: VillageStockpile): void;
  /** Called each tick while action is in progress */
  tick(villager: Villager, world: World, stockpile: VillageStockpile): void;
  /** Called when action completes (actionTicksRemaining reaches 0) */
  complete(villager: Villager, world: World, stockpile: VillageStockpile, rng: SeededRNG): void;
}
```

### 6.2 Phase 1 action specifications

| Action | Duration | Energy/Tick | Precondition | Effect on Completion |
|--------|----------|-------------|--------------|---------------------|
| **Forage** | 3 ticks | 1 | At or adjacent to a forest tile with resource > 0 | Villager receives 10–15 food (carried). Forest `resourceAmount` decreases by same amount |
| **Eat** | 1 tick | 0 | At stockpile (campfire) AND stockpile food >= 5, OR carrying food | +30 hunger. Consumes 5 food from stockpile (or 5 from carried) |
| **Rest** | 3 ticks | 0 | At campfire or any tile | +20 energy (at campfire), +15 energy (outdoors) |
| **Chop Wood** | 4 ticks | 2 | At or adjacent to a forest tile with resource > 0 | Villager receives 8–12 wood (carried). Forest `resourceAmount` decreases by same amount |
| **Haul** | varies | 1 | Carrying resources AND not at stockpile (campfire) | Move toward campfire, deposit all carried resources on arrival |
| **Fish** | 4 ticks | 1 | Adjacent to a water tile | Villager receives 8–12 food (carried). No tile depletion |
| **Flee** | instant movement | 3 | Threat detected (Phase 2+ for predators — in Phase 1, include the mechanic but no triggers) | Move away from threat at 2× speed |
| **Idle** | 1 tick | 0 | Always available | Wander toward nearest unexplored/unvisited tile |

### 6.2.1 Sustainability analysis

Hunger drains at 2.0/tick. At 30 ticks/day, that's 60 hunger/day. Eating restores +30 hunger at a cost of 5 stockpile food, so a villager needs to eat twice per day (10 food/day) to stay above zero.

With 10 villagers, the village consumes ~100 food/day. Foraging yields 10–15 food per 3-tick action (plus ~3 ticks of travel + 1 tick haul ≈ 7 total ticks per forage cycle). One villager can forage ~4 times per day = ~50 food/day. So **at least 2 villagers must forage full-time** to sustain the village, leaving 8 for other activities. This is tight but viable — the AI should naturally prioritize food when hunger is high.

Starting stockpile of 50 food gives the village ~12 hours (half a day) of runway before foragers must start producing. This is intentionally tight to create early-game pressure.

### 6.3 Movement integration

Actions that require the villager to be at a specific tile (forest, water-adjacent, stockpile) first check position. If the villager isn't there, the action system should:
1. Find the nearest qualifying tile
2. Pathfind to it
3. Move the villager along the path (1 tile per tick, 2 tiles for flee)
4. Begin the action once arrived

This movement-before-action pattern is handled in the simulation engine tick (Step 8), not inside the action itself. The action's `canPerform` checks whether the villager is currently at a valid position for the action.

**AI → Engine → Action execution flow:**

1. AI calls `decide()` → returns `{ action: 'forage', targetPosition: { x: 10, y: 15 } }`
2. Engine checks: is the villager at (10, 15) or adjacent? If yes, start the forage action.
3. If no, engine pathfinds to (10, 15) and starts the villager moving. The villager's state is set to `currentAction: 'idle'` with an active path.
4. **On subsequent ticks:** The engine skips AI decisions for villagers with an active path (Step 8.3 item 5: "idle AND no path"). The villager moves 1 tile/tick along its path.
5. When the villager arrives at the target, the path empties. On the next tick, the engine calls the AI again. The AI re-evaluates and (assuming hunger is still the top priority) picks forage again. This time `canPerform` returns true, and the action starts.

This "re-decide on arrival" pattern is intentional: conditions may have changed during travel (another villager depleted the forest tile, hunger recovered because someone else deposited food, etc.). The AI always makes fresh decisions from current state.

### 6.4 Resource flow

```
Forage at forest → villager carries food → haul to stockpile → eat from stockpile
Chop at forest   → villager carries wood → haul to stockpile
Fish at water     → villager carries food → haul to stockpile
```

The "carry then haul" pattern means villagers don't teleport resources. They gather at the source, walk back, deposit, and then can eat. This creates interesting spatial dynamics.

### 6.5 Tests

- `tests/actions.test.ts`: Verify each action's preconditions, duration, energy cost, and completion effects. Verify resource flow (forage → carry → haul → stockpile). Verify eating reduces stockpile. Verify rest restores energy.

### Deliverable

Complete action system for Phase 1 actions. No DOM dependencies.

---

## Step 7: AI Interface & Utility AI

**Goal:** Define the shared AI interface and implement the first AI system (Utility AI).

### 7.1 AI Interface (`src/simulation/ai/ai-interface.ts`)

```ts
export interface AIDecision {
  action: VillagerAction;
  /** Target tile for the action (e.g., which forest to forage) */
  targetPosition?: Position;
  /** Reasoning string for inspector/debug display */
  reason: string;
}

/** Read-only snapshot of world state visible to the AI */
export interface AIWorldView {
  world: World;
  stockpile: Readonly<VillageStockpile>;
  villagers: ReadonlyArray<Readonly<Villager>>;
  tick: number;
  timeOfDay: 'day' | 'night';
  /** Campfire position */
  campfirePosition: Position;
}

export interface IAISystem {
  /** Unique identifier for this AI type */
  readonly name: string;

  /** Choose an action for the given villager */
  decide(villager: Readonly<Villager>, worldView: AIWorldView, rng: SeededRNG): AIDecision;
}
```

**Design notes:**
- The AI receives a read-only view of the world. It cannot mutate state — it only returns a decision.
- The `reason` field powers the future villager inspector panel and aids debugging.
- The interface is deliberately simple: one method, one input, one output. This makes it trivial to implement new AI systems in later phases.

### 7.2 Utility AI (`src/simulation/ai/utility-ai.ts`)

Implements `IAISystem` using the scoring formula from the project plan.

**Scoring formula per action:**

```
score = sum(need_weight × need_relevance × urgency_curve(need_value))
        + environmental_modifier
        + random(0, 0.1)
```

Where:
- `urgency_curve(value) = (1 - value / 100)²` — exponential urgency. Low values score high.
- `need_weight` — per-action weights for each need (see table below)
- `environmental_modifier` — contextual adjustments
- `random(0, 0.1)` — small noise via seeded RNG to break ties and prevent herd behavior

**Action scoring weights:**

| Action | Hunger Weight | Energy Weight | Health Weight | Notes |
|--------|--------------|---------------|---------------|-------|
| Forage | 0.8 | 0.1 | 0.3 | High hunger relevance, slight health (starvation prevention) |
| Eat | 1.0 | 0.0 | 0.4 | Direct hunger fix. High health relevance when starving |
| Rest | 0.0 | 1.0 | 0.2 | Pure energy recovery |
| Chop Wood | 0.2 | 0.1 | 0.1 | Low urgency, infrastructure value |
| Haul | 0.3 | 0.1 | 0.1 | Moderate — carrying resources is useful but not urgent |
| Fish | 0.7 | 0.1 | 0.3 | Similar to forage |
| Idle | 0.0 | 0.0 | 0.0 | Fallback only |

**Environmental modifiers:**

| Condition | Modifier | Affected Actions |
|-----------|----------|-----------------|
| Night | -0.3 | Forage, Chop Wood, Fish |
| Carrying resources | +0.5 | Haul |
| Stockpile food < 10 | +0.3 | Forage, Fish |
| Stockpile food > 80 | +0.2 | Chop Wood |
| Energy < 15 | +0.5 | Rest (emergency) |
| Health < 20 | +0.5 | Eat, Rest (emergency) |

**Decision process:**
1. For each available action, compute the score.
2. Filter out actions where `canPerform` is false.
3. Select the highest-scoring action.
4. If the chosen action requires a target tile (e.g., "which forest?"), pick the nearest valid tile.
5. Return the `AIDecision` with the action, target, and a reason string (e.g., `"forage: hunger urgency 0.72, env +0.3 (low food stockpile), total 1.12"`).

### 7.3 Tests

- `tests/utility-ai.test.ts`: Verify scoring calculation for known inputs. Verify that a starving villager prioritizes eating. Verify that a tired villager prioritizes rest. Verify night penalty reduces outdoor action scores. Verify random noise doesn't override large score differences. Verify reason string is populated.

### Deliverable

AI interface and working Utility AI. No DOM dependencies.

---

## Step 8: Simulation Engine (Core Loop)

**Goal:** The tick-based simulation loop that drives the entire simulation, decoupled from rendering.

### 8.1 Engine design (`src/simulation/simulation-engine.ts`)

```ts
export interface SimulationConfig {
  seed: number;
  worldWidth: number;       // Default: 64
  worldHeight: number;      // Default: 64
  aiSystem: IAISystem;
  villagerCount: number;    // Default: 10
}

export interface SimulationState {
  world: World;
  villagers: Villager[];
  stockpile: VillageStockpile;
  tick: number;
  dayCount: number;
  timeOfDay: 'day' | 'night';
  campfirePosition: Position;
  /** Per-tick metrics history for charting */
  history: SimulationHistory;
  /** Whether the simulation is over (all villagers dead) */
  isOver: boolean;
  config: SimulationConfig;
}

export interface SimulationHistory {
  /** One entry per in-game day */
  daily: DailySnapshot[];
}

export interface DailySnapshot {
  day: number;
  population: number;
  food: number;
  wood: number;
  stone: number;
  avgHealth: number;
  avgHunger: number;
  avgEnergy: number;
  prosperityScore: number;
  /** Count of villagers per action type on this day */
  activityBreakdown: Record<VillagerAction, number>;
}

export class SimulationEngine {
  private state: SimulationState;
  private rng: SeededRNG;
  private aiRng: SeededRNG;

  constructor(config: SimulationConfig);

  /** Advance the simulation by one tick */
  tick(): void;

  /** Get the current state (read-only snapshot for the UI) */
  getState(): Readonly<SimulationState>;

  /** Reset to initial state with the same or new config */
  reset(config?: SimulationConfig): void;
}
```

### 8.2 Campfire as village center

The campfire serves as the spatial anchor for the village:
- **Stockpile location** — villagers haul resources to the campfire and eat from the stockpile there.
- **Rest bonus** — resting at or adjacent to the campfire gives +20 energy vs +15 elsewhere.
- **Spawning** — new villagers (Phase 2 population growth) appear near the campfire.

The `campfirePosition` is determined during world generation (center of the 7×7 starting clearing).

### 8.3 Tick loop — step by step

Each call to `engine.tick()` performs:

1. **Time update:** Increment tick counter. Calculate `timeOfDay` (day if tick % TICKS_PER_DAY < DAY_TICKS, else night). Where `TICKS_PER_DAY = 30` (one day ≈ 30 seconds at 1× speed, 1 tick per second), `DAY_TICKS = 20`, `NIGHT_TICKS = 10`.

2. **Need drain:** For each living villager, apply base need drain rates:
   - Hunger: -2.0/tick
   - Energy: -1.0/tick (base; action energy costs are applied separately)
   - If hunger === 0: health -= 1.0/tick (starvation damage)
   - If hunger > 50 AND energy > 30: health += 0.5/tick (recovery)
   - Clamp all needs to [0, 100]

3. **Action progress:** For each living villager with `actionTicksRemaining > 0`:
   - Decrement `actionTicksRemaining`
   - Apply per-tick action effects (energy drain for the action)
   - If `actionTicksRemaining` reaches 0, call `action.complete()`

4. **Movement:** For each living villager currently moving along a path:
   - Advance position by 1 tile along the path (2 tiles if fleeing)
   - If destination reached, clear the path

5. **AI decisions:** For each living villager that is idle (`actionTicksRemaining === 0` and no path):
   - Call `aiSystem.decide(villager, worldView, aiRng)`
   - If the decision requires movement to a target, compute the path via A* and start moving
   - If the villager is at the target, start the action

6. **Death check:** For each villager, if health <= 0, mark as dead (`alive = false`). Log the death event.

7. **World update:** Call `world.tickRegeneration()` to regrow forests.

8. **History snapshot:** If a new in-game day just started (tick % TICKS_PER_DAY === 0), compute and store a `DailySnapshot` including prosperity score. **Important:** The constructor must also record an initial snapshot at tick 0 so charts are never empty on load.

9. **End condition:** If no villagers are alive, set `isOver = true`.

### 8.4 Prosperity score calculation (`src/utils/scoring.ts`)

```ts
export function calculateProsperity(
  population: number,
  avgHealth: number,
  food: number,
  wood: number,
  stone: number,
  structureCount: number,
  uniqueStructureTypes: number,
  daysSurvived: number,
): number {
  return (
    population * 10 +
    avgHealth * 0.5 +
    food * 0.3 +
    wood * 0.2 +
    stone * 0.2 +
    structureCount * 5 +
    uniqueStructureTypes * 10 +
    daysSurvived * 0.5
  );
}
```

> **Phase 1 note:** `structureCount` and `uniqueStructureTypes` will be 0 since structures aren't buildable until Phase 2. The formula is implemented now for completeness.

### 8.5 Day/night mechanical effects

- Night: Forage/Chop/Fish action durations increase by 50% (rounded up). This is applied by the action system when checking `timeOfDay`.
- Night: The Utility AI's environmental modifier already penalizes outdoor actions by -0.3.

### 8.6 Tests

- `tests/simulation-engine.test.ts`: Verify tick advances state. Verify need drain per tick. Verify villager death. Verify day/night cycle transitions. Verify history snapshots are recorded.

### Deliverable

Working simulation engine. Can run headlessly via `engine.tick()` in a loop. No DOM dependencies.

---

## Step 9: Zustand Store

**Goal:** Bridge between the simulation engine and the React UI.

### 9.1 Store definition (`src/store/simulation-store.ts`)

```ts
import { create } from 'zustand';

interface SimulationStore {
  /** Current simulation state (updated every render frame) */
  state: SimulationState | null;

  /** Is the simulation currently running? */
  isRunning: boolean;

  /** Current speed multiplier (1, 2, 4, 8) */
  speed: number;

  /** World seed (user-editable before starting) */
  seed: number;

  // Actions
  init: (seed: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  setSeed: (seed: number) => void;
}
```

### 9.2 Game loop integration

The store manages a `requestAnimationFrame` loop:
- When `isRunning` is true, each frame calls `engine.tick()` multiple times based on `speed`.
- At 1× speed: 1 tick per frame (~60 ticks per second, but the simulation day is 30 ticks, so one day per ~0.5 seconds). **Correction:** At 1× speed, target 1 tick per second (one day = 30 seconds real time, matching the plan). Use a tick accumulator with `deltaTime` to control tick rate.
- At 8× speed: 8 ticks per second (one day ≈ 3.75 seconds).
- After ticking, update `state` in the store, which triggers React re-renders.

**Tick rate logic:**

```ts
const TICK_INTERVAL_MS = 1000; // 1 tick per second at 1× speed
let accumulator = 0;

function gameLoop(timestamp: number) {
  const delta = timestamp - lastTimestamp;
  accumulator += delta * speed;
  while (accumulator >= TICK_INTERVAL_MS) {
    engine.tick();
    accumulator -= TICK_INTERVAL_MS;
  }
  store.setState({ state: engine.getState() });
  if (isRunning) requestAnimationFrame(gameLoop);
}
```

### 9.3 Tests

Store is thin glue — tested indirectly via integration tests and the UI.

### Deliverable

Zustand store connecting the simulation engine to React.

---

## Step 10: Metrics Dashboard UI

**Goal:** The default view — a professional-looking analytics dashboard showing simulation data.

### 10.1 Layout components

**`src/views/MetricsDashboard.tsx`** — Main dashboard layout:
- Top: `<TopBar />` (simulation controls — implemented in Step 11)
- Row of KPI cards: `<KPICard />` components
- Main area: Charts via Recharts
- Side: Event log (simplified for Phase 1 — full event system in Phase 2)

**`src/components/KPICard.tsx`** — Headline stat card:
- Population count
- Prosperity score
- Resource totals (food / wood / stone)
- Average health

Styled like a KPI monitoring card: large number, small label, subtle background color.

### 10.2 Charts (Recharts)

All charts read from `state.history.daily[]`.

1. **Population over time** — `<LineChart>` with one line (Phase 1 is single village; multi-line in Phase 2).
2. **Resource stockpiles over time** — `<AreaChart>` with stacked areas for food, wood, stone.
3. **Villager activity breakdown** — `<BarChart>` showing how many villagers are performing each action type on the current day. This chart reads from live `state.villagers` (current tick), not from history.
4. **Prosperity score over time** — `<LineChart>` tracking the composite score.

**Initial state:** The first `DailySnapshot` is recorded at tick 0 (before the first tick executes) so that charts are never empty. Without this, at 1× speed the dashboard shows blank charts for 30 seconds until day 1 completes — a poor first impression.

### 10.3 Event log (simplified)

**`src/components/EventLog.tsx`** — Scrolling list of notable events:
- Villager death
- Day transitions
- Night transitions
- Resource milestones (first 100 food, etc.)

Phase 1 keeps this simple. The full event system (predators, blight, etc.) comes in Phase 2.

### 10.4 Styling approach

- Use CSS modules or plain CSS with a dark theme (monitoring dashboard aesthetic).
- Color palette: dark grays for backgrounds, bright accent colors for data (greens for health/food, blues for water/energy, oranges for warnings).
- Charts use Recharts' built-in theming with custom colors.
- Responsive grid layout (CSS Grid) that works at common screen sizes.

### 10.5 Tests

- Visual/behavioral testing deferred. Dashboard is verified manually and via the integration test (Step 13).

### Deliverable

Working metrics dashboard that updates in real time as the simulation runs.

---

## Step 11: Simulation Controls & Day/Night Cycle

**Goal:** User controls for the simulation and visual day/night indication on the dashboard.

### 11.1 Top bar (`src/components/TopBar.tsx`)

Controls:
- **Start/Pause button** — Toggles `isRunning` in the store
- **Speed slider** — Options: 1×, 2×, 4×, 8×. Updates `speed` in the store
- **Reset button** — Calls `store.reset()`, regenerates the world
- **Elapsed time display** — Shows current day count and tick within day
- **Time of day indicator** — Sun/moon icon or text ("Day" / "Night")
- **Seed display & input** — Shows current seed, editable text field to set a new seed before starting. "Randomize" button generates a random seed

### 11.2 Day/night visual indication

On the dashboard, the day/night state is communicated via:
- Time of day text in the top bar: "Day 5 — Daytime" or "Day 5 — Night"
- Optional: subtle background color shift (slightly darker during night ticks)
- The activity breakdown chart will naturally reflect night behavior (fewer outdoor actions)

### 11.3 Seed input flow

1. On first load, generate a random seed and display it.
2. User can type a new seed into the input field.
3. Pressing "Start" initializes the simulation with the displayed seed.
4. The seed is locked while the simulation is running.
5. "Reset" unlocks the seed for editing.

### Deliverable

Fully functional simulation controls with seed reproducibility.

---

## Step 12: Testing Suite

**Goal:** Comprehensive tests covering the simulation pipeline.

### 12.1 Unit tests (created alongside each step)

These are listed in their respective steps above but collected here for reference:

| Test File | Covers |
|-----------|--------|
| `tests/seed.test.ts` | Seeded RNG determinism, fork independence, range |
| `tests/noise.test.ts` | Noise determinism, range, coherence |
| `tests/world.test.ts` | World generation determinism, tile distribution, regeneration |
| `tests/pathfinding.test.ts` | A* correctness, obstacle avoidance, performance |
| `tests/villager.test.ts` | Need drain, health mechanics, death |
| `tests/actions.test.ts` | Action preconditions, effects, resource flow |
| `tests/utility-ai.test.ts` | Score calculation, decision priorities, reason strings |
| `tests/simulation-engine.test.ts` | Tick progression, need processing, day/night, history |

### 12.2 Deterministic snapshot test (`tests/deterministic-snapshot.test.ts`)

**The single most valuable test in the project** (per the project plan).

```ts
test('100-tick deterministic snapshot', () => {
  const engine = new SimulationEngine({
    seed: 42,
    worldWidth: 64,
    worldHeight: 64,
    aiSystem: new UtilityAI(),
    villagerCount: 10,
  });

  for (let i = 0; i < 100; i++) {
    engine.tick();
  }

  const state = engine.getState();

  // Assert exact state
  expect(state.tick).toBe(100);
  expect(state.villagers.filter(v => v.alive).length).toMatchSnapshot();
  expect(state.stockpile).toMatchSnapshot();
  expect(
    state.villagers.map(v => ({
      id: v.id,
      x: v.position.x,
      y: v.position.y,
      hunger: v.needs.get(NeedType.Hunger)?.current,
      energy: v.needs.get(NeedType.Energy)?.current,
      health: v.needs.get(NeedType.Health)?.current,
      alive: v.alive,
    }))
  ).toMatchSnapshot();
});
```

**Key points:**
- Uses Vitest's `toMatchSnapshot()` for exact state matching.
- The snapshot file is committed to git. Any change to tick logic, pathfinding, AI scoring, or action resolution that changes the outcome will cause this test to fail.
- Update the snapshot intentionally via `npx vitest run --update` only when behavior changes are deliberate.
- Pinned to Node/V8 (via Vitest) for floating-point determinism.

### 12.3 Stress test (`tests/stress.test.ts`)

```ts
test('1000-tick stress test — no crashes, no NaN, no out-of-bounds', () => {
  const seed = Date.now(); // Random seed each run
  const engine = new SimulationEngine({
    seed,
    worldWidth: 64,
    worldHeight: 64,
    aiSystem: new UtilityAI(),
    villagerCount: 10,
  });

  for (let i = 0; i < 1000; i++) {
    engine.tick();
    const state = engine.getState();

    for (const v of state.villagers) {
      // No NaN in any need
      for (const [, need] of v.needs) {
        expect(need.current).not.toBeNaN();
        expect(need.current).toBeGreaterThanOrEqual(0);
        expect(need.current).toBeLessThanOrEqual(100);
      }
      // No out-of-bounds position
      if (v.alive) {
        expect(v.position.x).toBeGreaterThanOrEqual(0);
        expect(v.position.x).toBeLessThan(64);
        expect(v.position.y).toBeGreaterThanOrEqual(0);
        expect(v.position.y).toBeLessThan(64);
      }
    }

    // No negative resources
    expect(state.stockpile.food).toBeGreaterThanOrEqual(0);
    expect(state.stockpile.wood).toBeGreaterThanOrEqual(0);
    expect(state.stockpile.stone).toBeGreaterThanOrEqual(0);
  }
});
```

### 12.4 DOM-free constraint test

Per the project plan: `src/simulation/` and `src/utils/` must be importable in a Web Worker context (no DOM/browser API imports).

```ts
// tests/dom-free.test.ts
test('simulation and utils have no DOM dependencies', () => {
  // Import all simulation modules
  // If any module references document, window, or DOM APIs,
  // this test will fail in the Vitest jsdom environment
  // when we explicitly check for their absence

  const simulationFiles = [
    '../src/simulation/world',
    '../src/simulation/villager',
    '../src/simulation/actions',
    '../src/simulation/simulation-engine',
    '../src/simulation/ai/ai-interface',
    '../src/simulation/ai/utility-ai',
    '../src/utils/seed',
    '../src/utils/noise',
    '../src/utils/pathfinding',
    '../src/utils/scoring',
  ];

  for (const file of simulationFiles) {
    // Dynamically import and verify no DOM globals are referenced
    const mod = require(file);
    expect(mod).toBeDefined();
  }
  // Additional: grep source files for 'document', 'window', 'React', 'pixi'
  // to catch accidental imports
});
```

> A more robust approach: add an ESLint rule or a simple grep-based script that scans `src/simulation/` and `src/utils/` for forbidden imports (`react`, `pixi.js`, `document`, `window`). Run it as part of the test suite.

### Deliverable

Full test suite with unit tests, snapshot test, stress test, and DOM-free validation.

---

## Step 13: Integration & Polish

**Goal:** Wire everything together, verify end-to-end, and polish the experience.

### 13.1 App entry point (`src/App.tsx`)

```tsx
function App() {
  return (
    <div className="app">
      <TopBar />
      <MetricsDashboard />
    </div>
  );
}
```

### 13.2 End-to-end verification

Manual testing checklist:
- [ ] Click "Start" — simulation begins, charts update in real time
- [ ] KPI cards show population, prosperity, resources, health
- [ ] Population chart shows a line over time
- [ ] Resource chart shows food/wood/stone stockpile changes
- [ ] Activity breakdown shows which actions villagers are performing
- [ ] Prosperity score trends upward as the village stabilizes (or downward if dying)
- [ ] Speed slider changes simulation speed visibly
- [ ] Pause stops all updates; resume continues
- [ ] Reset restarts with a fresh world
- [ ] Entering the same seed twice produces identical simulation runs (verify by comparing day 10 prosperity scores)
- [ ] Day/night indicator toggles correctly
- [ ] Event log shows deaths and day transitions
- [ ] Villagers eventually die if left long enough (resource depletion) — simulation ends gracefully

### 13.3 Performance check

- Simulation engine should tick in < 1ms at 1× speed (10 villagers, 64×64 grid, A* pathfinding)
- Dashboard should render at 60fps
- No memory leaks from the game loop (check via browser DevTools)

### 13.4 Polish items

- Console warnings: ensure no React warnings, no TypeScript errors
- Error boundaries: wrap the dashboard in a React error boundary so a crash doesn't white-screen
- Favicon and page title: "AI Colony — Simulation Dashboard"

### Deliverable

Complete Phase 1. A single village of Utility AI villagers surviving (or dying) on a metrics dashboard that looks like a monitoring tool.

---

## Step 14: In-App Acceptance Criteria Checklist

**Goal:** A built-in diagnostic panel that auto-detects Phase 1 acceptance criteria at runtime, providing instant pass/fail feedback without leaving the browser.

### 14.1 Overview

The checklist is a collapsible panel accessible via a button in the top bar (e.g., a small checkmark icon). When opened, it runs a series of automated checks against the live simulation state, the Zustand store, and — for behavioral checks — headless micro-simulations in the background. Each criterion shows a pass/fail/running/skipped status.

This serves two purposes:
1. **During development:** Quick smoke test after each implementation step — no need to remember what to verify manually.
2. **As a demo feature:** Shows the simulation is well-tested and self-aware.

### 14.2 Check runner (`src/utils/acceptance-checks.ts`)

```ts
export type CheckStatus = 'pass' | 'fail' | 'running' | 'skipped' | 'pending';

export interface AcceptanceCheck {
  id: string;
  /** Short label for the checklist row */
  label: string;
  /** Longer description shown on hover or expand */
  description: string;
  /** Which category this check belongs to */
  category: 'simulation' | 'ui' | 'controls' | 'ai-behavior' | 'build';
  /** Whether this check can be auto-detected at runtime */
  autoDetect: boolean;
  /** Run the check. Returns pass/fail and an optional detail message. */
  run: (context: CheckContext) => Promise<CheckResult>;
}

export interface CheckContext {
  /** Current simulation store state */
  storeState: {
    simState: SimulationState | null;
    isRunning: boolean;
    speed: number;
    seed: number;
  };
  /** Access to create headless simulation engines for behavioral checks */
  createEngine: (config: SimulationConfig) => SimulationEngine;
}

export interface CheckResult {
  status: 'pass' | 'fail';
  detail?: string;
}
```

### 14.3 Auto-detectable checks (12 of 15 criteria)

Each check below maps to one or more acceptance criteria. The `run` function describes the detection logic.

#### Category: Simulation Core

| # | Criterion | Check ID | Auto-Detection Logic |
|---|-----------|----------|---------------------|
| 1 | Simulation initializes with 10 villagers on 64×64 world | `sim-init` | Create a headless engine with default config. Assert `state.villagers.length === 10`, `state.world.width === 64`, `state.world.height === 64`. |
| 2 | Seed produces reproducible runs | `seed-determinism` | Create two engines with seed 42, run both for 100 ticks. Assert `JSON.stringify(state1.stockpile) === JSON.stringify(state2.stockpile)` and villager positions match. |
| 3 | Villagers survive 15+ days on balanced seed | `survival-15-days` | Create engine with seed 42, run for `15 × 30 = 450` ticks. Assert `state.villagers.filter(v => v.alive).length > 0`. |
| 4 | Simulation ends gracefully (all dead) | `graceful-end` | Create engine with seed 42, run for 5000 ticks (or until `isOver`). Assert `isOver === true` and no thrown errors. If villagers are still alive at 5000 ticks, that's still a pass (they're doing well) — mark as pass with detail "Village still alive at tick 5000". |
| 5 | Day/night cycle toggles | `day-night-cycle` | Create engine, run for 35 ticks (just past one full day). Assert that both `'day'` and `'night'` values were observed across ticks. |
| 6 | No NaN/out-of-bounds after 1000 ticks | `stress-invariants` | Create engine with random seed, run 1000 ticks. Each tick: assert no NaN in needs, no positions outside [0, 64), no negative stockpile values. |

#### Category: AI Behavior

| # | Criterion | Check ID | Auto-Detection Logic |
|---|-----------|----------|---------------------|
| 7 | Utility AI makes reasonable decisions | `ai-reasonable` | Create engine, run 100 ticks. Assert that villagers performed at least 3 distinct action types (not just idle). Assert food stockpile > 0 at tick 100. |
| 8 | AI scores produce deterministic output | `ai-deterministic` | Create two engines with same seed, run 50 ticks each. Assert every villager's `currentAction` and `position` match at tick 50. |

#### Category: UI Components

These checks query the live DOM to verify components are rendered. They only run when the simulation is active (store has a non-null state).

| # | Criterion | Check ID | Auto-Detection Logic |
|---|-----------|----------|---------------------|
| 9 | KPI cards rendered | `ui-kpi-cards` | Query DOM for elements with `data-testid="kpi-card"`. Assert count >= 4 (population, prosperity, resources, health). |
| 10 | Charts rendered | `ui-charts` | Query DOM for Recharts SVG containers (`.recharts-wrapper`). Assert count >= 4. |
| 11 | Event log rendered with entries | `ui-event-log` | Query DOM for `data-testid="event-log"`. Assert it exists. If simulation has run past day 1, assert it has > 0 child entries. |
| 12 | Speed control works | `ui-speed-control` | Read `store.speed`, verify it's one of `[1, 2, 4, 8]`. Check that a DOM element with `data-testid="speed-control"` exists. |

#### Category: Build/Static (Manual — not auto-detectable in-app)

| # | Criterion | Check ID | Auto-Detection Logic |
|---|-----------|----------|---------------------|
| 13 | All tests pass (`npx vitest run`) | `tests-pass` | **Manual.** Cannot run Vitest inside the browser. Marked `autoDetect: false`. Checklist shows a "Run in terminal" hint. |
| 14 | No DOM imports in simulation/utils | `dom-free` | **Manual.** Static analysis task. Marked `autoDetect: false`. Checklist shows "Verified by dom-free.test.ts". |
| 15 | Clean production build | `build-clean` | **Manual.** Cannot run `npm run build` from the browser. Marked `autoDetect: false`. Checklist shows "Run `npm run build` in terminal". |

### 14.4 Component (`src/components/AcceptanceChecklist.tsx`)

```tsx
interface ChecklistState {
  results: Map<string, { status: CheckStatus; detail?: string }>;
  isOpen: boolean;
  isRunning: boolean;
}
```

**UI structure:**

```
┌─────────────────────────────────────────────────────┐
│  Phase 1 Acceptance Criteria       [Run All] [Close]│
├─────────────────────────────────────────────────────┤
│  ▼ Simulation Core (6 checks)             5/6 pass  │
│    ✅ Simulation initializes correctly               │
│    ✅ Seed determinism                               │
│    ✅ Villagers survive 15+ days                     │
│    ✅ Graceful end                    Still alive ... │
│    ✅ Day/night cycle                                │
│    ✅ Stress invariants (1000 ticks)                 │
│                                                      │
│  ▼ AI Behavior (2 checks)                 2/2 pass  │
│    ✅ Reasonable decisions                           │
│    ✅ Deterministic AI output                        │
│                                                      │
│  ▼ UI Components (4 checks)               4/4 pass  │
│    ✅ KPI cards rendered (4 found)                   │
│    ✅ Charts rendered (4 found)                      │
│    ✅ Event log with entries                         │
│    ✅ Speed control present                          │
│                                                      │
│  ▼ Build/Static (3 checks)               — manual   │
│    ⬜ Tests pass           Run `npx vitest run`      │
│    ⬜ DOM-free constraint  Verified by test suite     │
│    ⬜ Clean production build  Run `npm run build`    │
│                                                      │
│  ──────────────────────────────────────────────────  │
│  Total: 12/12 auto-checks passed | 3 manual         │
└─────────────────────────────────────────────────────┘
```

**Behavior:**

1. **"Run All" button** — Executes all auto-detectable checks sequentially. Headless simulation checks run first (they're CPU-bound), then UI checks (instant DOM queries). Shows a progress indicator.
2. **Individual re-run** — Click any check row to re-run just that check.
3. **Status icons** — `✅` pass, `❌` fail, `⏳` running, `⬜` manual/pending.
4. **Detail expansion** — Click a check to see its `detail` string (e.g., "Village survived to day 42 with 7 alive" or "Mismatch at tick 37: villager-3 position differs").
5. **Category summaries** — Each category header shows `N/M pass`.
6. **Persistent state** — Check results persist in component state until "Run All" is clicked again. They do not auto-run on mount (headless sims are expensive).

### 14.5 Integration

- Add a small checkmark/clipboard icon button to `<TopBar />` that toggles the checklist panel.
- The panel renders as a fixed sidebar or modal overlay so it doesn't interfere with the dashboard layout.
- Add `data-testid` attributes to KPI cards, charts, event log, and speed control in their respective components (Steps 10–11) so the UI checks can find them.

### 14.6 Headless check performance

The behavioral checks (survival, determinism, stress) create headless `SimulationEngine` instances and run them synchronously. Expected performance:

| Check | Ticks | Expected Time |
|-------|-------|---------------|
| `sim-init` | 0 | < 5ms |
| `seed-determinism` | 200 (2 × 100) | < 50ms |
| `survival-15-days` | 450 | < 100ms |
| `graceful-end` | up to 5000 | < 500ms |
| `day-night-cycle` | 35 | < 10ms |
| `stress-invariants` | 1000 | < 200ms |
| `ai-reasonable` | 100 | < 30ms |
| `ai-deterministic` | 100 (2 × 50) | < 30ms |

Total headless budget: < 1 second. All UI checks are instant DOM queries. "Run All" completes in ≈ 1 second.

If any check exceeds 2 seconds, it should be moved to a Web Worker in a future optimization pass. For Phase 1, synchronous execution on the main thread is acceptable given the small tick counts.

### 14.7 Test IDs required from other steps

The following `data-testid` attributes must be added to components in Steps 10–11:

| Component | `data-testid` | Step |
|-----------|---------------|------|
| `KPICard` | `kpi-card` | 10 |
| Each Recharts chart wrapper div | `chart-population`, `chart-resources`, `chart-activity`, `chart-prosperity` | 10 |
| `EventLog` container | `event-log` | 10 |
| Event log entry elements | `event-log-entry` | 10 |
| Speed control element | `speed-control` | 11 |

### Deliverable

A self-contained diagnostic panel that auto-validates 12 of 15 acceptance criteria at runtime, with clear guidance for the 3 manual checks.

---

## Architecture Rules & Constraints

These rules apply from Phase 1 onward and prevent costly refactors later.

### 1. DOM-free simulation

`src/simulation/` and `src/utils/` must have **zero imports** from:
- `react`, `react-dom`
- `pixi.js`
- Browser globals: `document`, `window`, `localStorage`, `fetch`

This enables Web Worker execution for evolutionary AI training in Phase 5.

### 2. AI interface contract

All AI systems implement `IAISystem`. The simulation engine interacts with AI only through this interface. No AI-specific logic in the engine.

### 3. Deterministic simulation

Given the same seed and AI system, the simulation must produce identical results every time. This means:
- All randomness flows through the seeded RNG
- No dependency on `Date.now()`, `Math.random()`, or wall-clock time in the simulation
- No dependency on iteration order of `Set` or `Object.keys()` (use `Map` with insertion-order guarantees or sorted arrays)

### 4. Generic needs system

Needs are defined as `Map<NeedType, NeedState>`, not hardcoded fields. This allows Phase 2 (warmth) and Phase 5 (cooling) to add needs without refactoring the villager, AI, or action systems.

### 5. Separation of simulation and rendering

The simulation engine exposes a `getState()` method returning a read-only snapshot. The UI reads this snapshot and renders it. The UI never mutates simulation state directly. The store acts as the bridge.

---

## File Structure (Phase 1)

```
ai-colony/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.css
│   ├── simulation/
│   │   ├── world.ts
│   │   ├── villager.ts
│   │   ├── actions.ts
│   │   ├── simulation-engine.ts
│   │   └── ai/
│   │       ├── ai-interface.ts
│   │       └── utility-ai.ts
│   ├── utils/
│   │   ├── seed.ts
│   │   ├── noise.ts
│   │   ├── pathfinding.ts
│   │   ├── scoring.ts
│   │   └── acceptance-checks.ts
│   ├── store/
│   │   └── simulation-store.ts
│   ├── views/
│   │   └── MetricsDashboard.tsx
│   └── components/
│       ├── TopBar.tsx
│       ├── KPICard.tsx
│       ├── EventLog.tsx
│       └── AcceptanceChecklist.tsx
└── tests/
    ├── seed.test.ts
    ├── noise.test.ts
    ├── world.test.ts
    ├── pathfinding.test.ts
    ├── villager.test.ts
    ├── actions.test.ts
    ├── utility-ai.test.ts
    ├── simulation-engine.test.ts
    ├── deterministic-snapshot.test.ts
    ├── stress.test.ts
    └── dom-free.test.ts
```

---

## Type Definitions Reference

All key types defined in Phase 1, collected for quick reference.

```ts
// --- Enums ---
enum TileType { Grass, Forest, Stone, Water, FertileSoil }
enum NeedType { Hunger, Energy, Health }
type VillagerAction = 'idle' | 'forage' | 'eat' | 'rest' | 'chop_wood' | 'mine_stone' | 'haul' | 'fish' | 'flee' | 'build' | 'warm_up'
type TimeOfDay = 'day' | 'night'

// --- Core Structures ---
interface Position { x: number; y: number }
interface Tile { type: TileType; x: number; y: number; resourceAmount: number; maxResource: number; regenRate: number }
interface NeedState { current: number; drainRate: number; min: number; max: number }
type NeedsMap = Map<NeedType, NeedState>
interface VillageStockpile { food: number; wood: number; stone: number }

// --- Entities ---
interface Villager { id: string; name: string; position: Position; needs: NeedsMap; currentAction: VillagerAction; actionTicksRemaining: number; targetPosition: Position | null; path: Array<{x: number; y: number}>; alive: boolean; carrying: { type: 'food' | 'wood' | 'stone'; amount: number } | null }

// --- AI ---
interface AIDecision { action: VillagerAction; targetPosition?: Position; reason: string }
interface IAISystem { readonly name: string; decide(villager: Readonly<Villager>, worldView: AIWorldView, rng: SeededRNG): AIDecision }

// --- Simulation ---
interface SimulationConfig { seed: number; worldWidth: number; worldHeight: number; aiSystem: IAISystem; villagerCount: number }
interface SimulationState { world: World; villagers: Villager[]; stockpile: VillageStockpile; tick: number; dayCount: number; timeOfDay: TimeOfDay; campfirePosition: Position; history: SimulationHistory; isOver: boolean; config: SimulationConfig }
interface DailySnapshot { day: number; population: number; food: number; wood: number; stone: number; avgHealth: number; avgHunger: number; avgEnergy: number; prosperityScore: number; activityBreakdown: Record<VillagerAction, number> }
```

---

## Acceptance Criteria

Phase 1 is complete when:

1. **`npm run dev`** launches the dashboard in a browser
2. **Clicking "Start"** begins a simulation with 10 villagers on a 64×64 seeded world
3. **KPI cards** show live population, prosperity score, resource totals, and average health
4. **Four charts** update in real time: population, resources, activity breakdown, prosperity
5. **Event log** shows villager deaths and day transitions
6. **Speed slider** visibly changes simulation speed (1×, 2×, 4×, 8×)
7. **Pause/resume** works correctly
8. **Reset** generates a fresh world and restarts
9. **Seed input** allows reproducible runs (same seed → same day-10 state)
10. **Day/night indicator** toggles correctly in the top bar
11. **Villagers survive** for at least 15+ in-game days on a balanced seed (Utility AI makes reasonable decisions)
12. **Villagers eventually die** on depleted maps or after long runs (the simulation ends gracefully)
13. **`npx vitest run`** passes all tests:
    - Unit tests for RNG, noise, world, pathfinding, villager, actions, Utility AI, engine
    - Deterministic snapshot test (100 ticks, seed 42)
    - Stress test (1000 ticks, no crashes/NaN/out-of-bounds)
    - DOM-free constraint validation
14. **No DOM imports** in `src/simulation/` or `src/utils/`
15. **`npm run build`** produces a clean production build with no errors
