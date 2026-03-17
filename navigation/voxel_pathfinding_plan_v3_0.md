# Voxel Pathfinding Sandbox — Project Plan

**Version:** 3.0
**Date:** March 16, 2026

---

## Quick Start

**What:** Browser-based 3D voxel pathfinding testbed. Multiple agents navigate a dynamic voxel world (blocks mined/placed in real time). Five algorithms run side-by-side on identical worlds for direct comparison. R&D pipeline for Shovel Monster's NPC navigation.

**Tech:** TypeScript, Three.js, React, Zustand, Vite, Vitest. Entirely client-side.

**The five algorithms:**
1. **Grid A*** — Baseline. Full recompute on every change. Simple, correct, slow at scale.
2. **HPA*** — Hierarchical. Chunk-level coarse graph + local A*. Fast re-routing for localized changes.
3. **Flow Fields** — Shared vector field per destination. Great when many agents share goals.
4. **D* Lite** — Incremental replanning. Repairs paths in-place when terrain changes. Gold standard for dynamic environments.
5. **Hybrid** — Production system combining HPA* (long range) + D* Lite (local) + flow fields (high traffic) with predictive intent broadcasting.

**Core interface:** `IPathfinder` with `NavigationHandle` abstraction — agents poll `getNextVoxel()` each tick regardless of underlying algorithm. Movement is 6-directional (cardinal + up/down); string-pulling smoother handles diagonal shortcuts.

**Phase 1 scope:** Voxel world, Grid A*, one agent, manual terrain editing, metrics dashboard, deterministic simulation.

---

## Project Summary

A browser-based 3D voxel pathfinding testbed where multiple agents navigate a dynamic voxel world while terrain changes in real time — blocks are mined, placed, and destroyed mid-navigation. Different pathfinding algorithms run side-by-side on identical worlds, letting you directly compare how each handles path invalidation, re-routing, vertical movement, and multi-agent congestion. The project serves as a direct R&D pipeline for solving Shovel Monster's NPC navigation problems and replacing Unity's NavMesh with a voxel-native solution.

---

## Core Problem Being Solved

Unity's NavMesh is designed for static environments. In a voxel game where terrain changes constantly (mining, building, explosions), the NavMesh must be rebuilt, which causes agents to freeze, path through non-existent terrain, or fail to find routes entirely. The solution is pathfinding that operates directly on the voxel grid — the same data structure that defines the world — so path invalidation and recalculation are instantaneous and localized.

---

## Technical Stack

- **Rendering:** Three.js (3D voxel rendering with instanced meshes)
- **UI/Dashboard:** React + Recharts (metrics, algorithm comparison, inspector panels)
- **Language:** TypeScript
- **Voxel Size:** 1 unit cubes
- **World Size:** 32x32x32 per sandbox for interactive views, 64x64x64 for headless benchmarks
- **Build Tool:** Vite
- **State Management:** Zustand
- **Testing:** Vitest for unit tests, seeded scenarios for regression
- **No backend required** — entirely client-side

### A Note on World Size

The interactive sandbox uses 32x32x32 to keep frame rates smooth during real-time rendering with multiple side-by-side canvases. However, at 32,768 total voxels (much less walkable space), Grid A* is fast enough that HPA*'s overhead may actually make it slower for most queries. The performance differences that justify hierarchical and flow field approaches only emerge at scale.

All headless benchmarks (scenario runner, automated comparisons, CSV exports) run at 64x64x64 minimum. This ensures the data driving algorithm recommendations for Shovel Monster reflects realistic world sizes, not toy problems where the baseline wins by default. The benchmark world size is configurable up to 128x128x128 for stress testing.

### Simulation Tick Rate

The simulation runs at **20 ticks per second at 1x speed**. This is the fundamental time unit that all other timing values reference.

At 1x speed, one tick = 50 ms real time. At 8x speed, one tick = 6.25 ms real time (the simulation advances 8 ticks per 50 ms wall clock time, but rendering can skip frames if needed — the simulation is authoritative, the renderer interpolates).

Why 20 TPS: it's fast enough for smooth-looking movement (agents move at 1 voxel per tick = 20 voxels/sec, which at typical camera zoom is visually fluid), slow enough to leave headroom for pathfinding computation within a frame budget, and matches common game server tick rates (Minecraft runs at 20 TPS, which is a useful reference for voxel-scale movement).

Concrete timing for key parameters at 1x speed:

- Agent moves 1 voxel every 50 ms (1 voxel/tick × 20 TPS = 20 voxels/sec)
- Ladder climbing: 0.5 voxels/tick = 10 voxels/sec (one block every 100 ms)
- "Wait 5 ticks before re-route" = 250 ms of visible hesitation — noticeable but not frustrating
- "Path reservation lookahead: 3 ticks" = 150 ms into the future (3 voxels of planned movement)
- At 8x speed, the simulation advances 160 ticks per second — pathfinding budget per tick is tighter

### Simulation Determinism

For side-by-side comparison to be valid, the same seed must produce identical simulation behavior across runs. The project commits to **determinism within Chrome (V8)** with the following constraints:

- All game-critical math uses integer arithmetic or fixed-precision operations. Voxel coordinates are integers. Movement between voxels is tracked as integer progress counters (e.g., "this agent is 3/5 of the way through the current voxel transition"), not floating-point interpolation. Floating-point is used only for rendering interpolation (visual position between voxels) and never feeds back into simulation state
- The seeded RNG (see `seed.ts`) is a deterministic PRNG (e.g., xoshiro128) that produces identical sequences for identical seeds. All random decisions (destination assignment, event scheduling, tiebreaking) draw from this RNG in a fixed order
- **Agent processing order:** Agents are processed in ascending `agentId` order every tick. This ensures the PRNG draw sequence is identical across runs regardless of agent creation/destruction patterns. Data structures that track agents must not introduce iteration-order non-determinism (use arrays sorted by ID, not Maps where deletion + re-insertion changes order)
- Pathfinding tiebreakers use deterministic criteria (agent ID, then voxel coordinate lexicographic order), never system time or hash map iteration order
- Since all game-critical math uses integer arithmetic (voxel coordinates, tick counters, PRNG state), simulation determinism holds across JavaScript engines — not just V8. The xoshiro128 PRNG operates on 32-bit integers via JavaScript's bitwise operators, which produce identical signed 32-bit results in all engines. Benchmark timings (wall-clock measurements) are engine-specific, but simulation state at any given tick is engine-independent

For Shovel Monster, the same integer-math approach transfers directly — Unity's C# `int` and `long` types are deterministic across platforms, so the simulation logic will be reproducible in the Unity port.

---

## Views & Layout

### 1. Metrics Dashboard (Default View — "Stealth Mode")

Same philosophy as AI Colony — the default view is a professional-looking analytics dashboard.

**Layout:**

- **Top Bar:** Simulation controls (play, pause, speed 1x–8x, reset), elapsed time, active scenario, world seed
- **Headline Cards:** One per algorithm — agents active, paths computed, average path time, re-routes triggered
- **Main Charts:**
  - Path computation time over simulation ticks (line chart, one line per algorithm)
  - Re-route frequency (bar chart — how often each algorithm needs to recalculate)
  - Path efficiency (actual distance traveled vs optimal straight-line distance)
  - Agent throughput (agents successfully reaching destinations per minute)
  - Failed paths (paths that couldn't be found — critical metric)
  - Memory usage per algorithm (line chart — heap snapshots sampled every N ticks)
- **Side Panel — Event Log:** Timestamped log of terrain changes, path invalidations, agent arrivals, and failures
- **Bottom Strip:** Quick-compare table — algorithms as rows, key stats as columns

### 2. 3D Sandbox View (Toggle)

Three.js rendering of the voxel world with agents navigating in real time.

**Layout:**

- **Top Bar:** Same controls as dashboard (shared)
- **Main Area:** Side-by-side Three.js canvases, one per algorithm. Same world geometry, same terrain changes, different pathfinding. Camera controls: orbit, pan, zoom (independent per view). Wireframe toggle to see inside terrain
- **Agent Inspector:** Click any agent to see:
  - Current path (rendered as colored line through voxels, with smoothed preview line overlaid)
  - Path state (navigating, re-routing, waiting, stuck, falling)
  - Algorithm-specific debug info (open list size, nodes explored, chunk boundaries)
  - Time spent computing current path
  - Memory footprint of this agent's pathfinding state
- **Terrain Tools:** Manual block placement/removal (click to mine, shift+click to place). Terrain editing is available in both dashboard and sandbox views — the dashboard exposes a simplified block coordinate input panel (x, y, z + mine/place buttons), while the sandbox view uses direct mouse interaction. All terrain changes are mirrored across all algorithm views regardless of which view initiated them
- **Path Visualization Overlay:** Toggle to show explored nodes (heatmap), chunk boundaries, flow field vectors, or hierarchical graph edges depending on the active algorithm

### 3. Scenario Runner (Pre-built Stress Tests)

A library of repeatable test scenarios that exercise specific navigation challenges. Each scenario defines terrain geometry, agent spawns, destinations, and terrain change events with concrete parameters. See the Scenario Definitions section for full specifications.

Scenarios can be run interactively (32x32x32, rendered) or as headless benchmarks (64x64x64, fast-forward, results exported to CSV). All numeric parameters scale proportionally with world size — a bridge that spans 16 blocks at 32x32x32 spans 32 blocks at 64x64x64.

---

## World Design

### Voxel Grid

- 32x32x32 grid for interactive sandbox, 64x64x64 for headless benchmarks (configurable up to 128x128x128)
- Each voxel: solid or air, with type metadata (dirt, stone, ladder, stair, platform)
- Voxels stored in chunks of 8x8x8 for efficient updates and spatial queries
- Chunk-level dirty flags for targeted path invalidation

### Block Types

- **Solid:** Impassable, can be mined. Agents walk on top surface
- **Air:** Passable, agents can move through
- **Ladder:** Vertical traversal — agents can climb up/down at reduced speed
- **Stair:** Diagonal traversal — agents move up one block while moving forward one block
- **Platform/Scaffold:** Walkable surface but can be destroyed easily (lower durability). Introduced in Phase 3 alongside the Stairwell and Construction Zone scenarios that depend on it

### Agent Model

Agents occupy a **1×2×1 voxel volume** (1 wide, 2 tall, 1 deep). This matches the standard Minecraft-style humanoid: one block footprint, two blocks of vertical clearance required.

This is a fundamental constraint that affects every system:

- **Pathfinding neighbor generation:** Movement is **6-directional** (±X, ±Z on the same Y level, plus up/down via ladders/stairs/step-ups/drops). Diagonal movement on the grid is not supported — it would require swept-volume clearance checks at both intermediate corner positions for a 2-tall agent, adding significant complexity for minimal gain. Diagonal shortcuts are instead handled by the string-pulling path smoother, which verifies full clearance along the smoothed line. A voxel is walkable only if it has a solid block below AND the voxel at that position AND the voxel one above it are both air (or non-solid). An agent can't walk under a 1-block overhang
- **Step-up:** An agent can step up 1 block (move to a voxel that is 1 Y higher) if ALL of the following are true: (1) the destination has a solid block below it, (2) the destination voxel and the voxel above it are both air (2-tall clearance at destination), AND (3) the voxel above the agent's current head position (origin Y+2) is air — otherwise the agent's head clips into the ceiling as it rises. This is a **4-voxel check**: destination floor (solid), destination+0 (air), destination+1 (air), origin+2 (air)
- **Ladders:** The agent's 2-tall hitbox must have clearance at every rung. A ladder in a 1-wide vertical shaft works; a ladder under a low ceiling doesn't
- **Stair traversal:** Moving diagonally upward requires air at both the destination voxel and the voxel above it
- **String-pulling walkability ray:** Must verify 2-tall clearance at every intermediate position, not just 1

The agent height is configurable (stored in `movement-rules.ts`) to allow experimentation with 1-tall agents (for testing, or for modeling small creatures in Shovel Monster), but the default and all scenario parameters assume height 2.

### Gravity & Physics

- Agents are affected by gravity — if the block under them is removed, they fall
- **Blocks are static** — only agents are affected by gravity. Removing a support block does not cause blocks above it to fall (no sand/gravel-style cascading physics). This is a deliberate scope limitation; block physics would be a significant additional system with its own propagation rules, tick ordering, and cascading invalidation concerns. If block physics are needed for Shovel Monster, they should be specified and implemented as a separate system that feeds terrain change events into the pathfinding invalidation pipeline
- Falling agents take a "landing" pause (3 ticks = 150 ms at 1x) before re-pathing (simulates recovery)
- Agents cannot walk on air — must have solid or platform block below
- Agents can step up one block height without stairs (standard Minecraft-style movement)
- Agents can drop down up to 3 blocks without taking damage (configurable)
- Jumps: agents can cross a 1-block horizontal gap if same height or 1 block down

### Terrain Changes

All terrain changes are mirrored simultaneously across all algorithm sandboxes.

- **Mining:** Remove a block. Any paths through or on top of this block are immediately invalidated. Adjacent chunks marked dirty. If the removed block was providing headroom clearance for a walkable surface below, that surface may also become unwalkable (relevant for 2-tall agents)
- **Building:** Add a block. Any paths through this voxel are invalidated. May open new paths on top of the new block. May also block paths that passed through the voxel above (headroom violation for 2-tall agents)
- **Collapse:** Remove a connected group of blocks (simulates cave-in or explosion). Mass invalidation event
- **Scheduled Events:** Pre-scripted terrain changes that fire at specific simulation ticks (for repeatable scenarios)
- **Random Events:** Configurable probability of random block removal/addition per tick (for stress testing)

### Agent Attributes

Each agent has:

- **Position:** Current voxel coordinates (integer) plus a tick-based progress counter for movement between voxels (integer, 0 to move_duration). Floating-point interpolation is derived from progress for rendering only and never feeds back into simulation state
- **Height:** Number of voxels tall (default: 2). Used by all pathfinding algorithms for clearance checks
- **Destination:** Target voxel coordinates
- **Path:** Ordered list of voxels to traverse (raw pathfinder output)
- **Smoothed Path:** Post-processed path with string-pulling applied (see Path Smoothing section). Used for visual interpolation and movement; raw path retained for debugging
- **State:** Idle, Navigating, Re-routing, Waiting, Falling, Stuck. **Destination invalidation:** If an agent's destination voxel becomes solid (a block is placed there), the agent does not immediately enter Stuck state. Instead, it automatically retargets to the nearest walkable voxel to the original destination (BFS outward from the destination until a walkable voxel is found). This prevents unnecessary Stuck states — an NPC going to a blocked doorway stands next to it rather than freezing
- **Speed:** Voxels per tick (default 1.0, reduced on ladders to 0.5, stairs to 0.7)
- **Path Age:** How many ticks since current path was computed (for staleness detection)
- **Priority:** Determines yielding behavior in congestion (see Multi-Agent Behavior)

---

## Pathfinder Interface

The `IPathfinder` interface is the central contract that all five algorithms implement. It must accommodate fundamentally different navigation models: path-based algorithms (A*, HPA*, D* Lite) return an explicit list of waypoints, while flow fields return a movement direction at the agent's current position. The interface unifies these through a `NavigationHandle` abstraction.

### Interface Definition

```
interface TerrainChangeEvent {
  chunkCoords: ChunkCoord[];         // affected chunks (for algorithms needing only chunk-level granularity)
  changedVoxels: VoxelCoord[];       // specific voxels that changed (for algorithms needing precision, e.g. D* Lite edge cost updates)
  changeType: 'remove' | 'add';     // whether blocks were removed or added — lets D* Lite update edge costs directionally
  tick: number;                      // simulation tick when the change occurred
}

interface IPathfinder {
  // Request navigation from start to destination.
  // Returns a NavigationHandle that the agent polls each tick.
  // May return null if no path exists.
  // maxComputeMs: optional per-request time budget in milliseconds.
  // If the pathfinder exceeds this budget, it yields and returns a
  // NavigationHandle in "computing" state that resumes next tick.
  // This prevents frame hitches from day one and is essential for
  // the Hybrid's D* Lite timeout fallback.
  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number,
    maxComputeMs?: number
  ): NavigationHandle | null;

  // Notify the pathfinder that terrain has changed.
  // Provides both chunk-level and voxel-level granularity:
  // - Algorithms that only need chunk-level info (HPA*) use chunkCoords
  // - Algorithms that need voxel precision (D* Lite) use changedVoxels directly
  //   without re-scanning entire chunks
  // - changeType lets algorithms update edge costs directionally
  invalidateRegion(event: TerrainChangeEvent): void;

  // Release all state for a given agent's navigation.
  // Called when agent dies, arrives, or switches destination.
  releaseNavigation(handle: NavigationHandle): void;

  // Return current memory usage in bytes for dashboard reporting.
  getMemoryUsage(): MemoryReport;

  // Sweep for leaked NavigationHandles — handles that were never
  // released via releaseNavigation(). Called periodically by the
  // simulation engine (e.g., every 100 ticks). Handles whose
  // associated agentId no longer exists in the simulation are
  // automatically released. Returns the number of handles cleaned up.
  sweepLeakedHandles(activeAgentIds: Set<number>): number;
}

interface NavigationHandle {
  // Get the next voxel the agent should move toward.
  // For path-based algorithms: returns the next waypoint in the path.
  // For flow fields: evaluates the flow vector at the agent's
  // current position and returns the resulting target voxel.
  //
  // Returns null if the agent has arrived or navigation has failed.
  // Returns null if the handle is still in "computing" state (time-sliced).
  getNextVoxel(currentPosition: VoxelCoord): VoxelCoord | null;

  // Is this handle still valid, or does it need re-computation?
  // After invalidateRegion(), affected handles return false here.
  isValid(): boolean;

  // Is the handle still computing its initial path (time-sliced)?
  // The agent should wait (not move) while this returns true.
  isComputing(): boolean;

  // Get the full planned path as a voxel list for visualization
  // and smoothing. For path-based algorithms, this is the stored path.
  // For flow fields, the traced path is cached and invalidated only
  // when the underlying flow field updates — not recomputed every call.
  // Returns null if the handle is still computing or the algorithm
  // doesn't support path extraction.
  getPlannedPath(currentPosition: VoxelCoord): VoxelCoord[] | null;

  // Algorithm-specific debug info for the agent inspector.
  // Returns an opaque key-value map rendered as a debug panel.
  getDebugInfo(): Record<string, string | number>;

  // Memory consumed by this specific handle's state (bytes).
  // This is the canonical source of per-agent memory data.
  getHandleMemory(): number;
}

interface MemoryReport {
  sharedBytes: number;      // Coarse graph, flow fields, etc.
  peakBytes: number;        // High-water mark since last reset
  // Per-agent memory is NOT tracked here — use NavigationHandle.getHandleMemory()
  // directly. Having two sources of per-agent memory creates consistency problems,
  // especially when agents are created/destroyed. The agent inspector calls
  // getHandleMemory() on the handle; the dashboard sums all active handles.
}
```

### How Each Algorithm Fits

- **Grid A*:** `requestNavigation` runs A* (respecting `maxComputeMs` — yields and returns a "computing" handle if budget exceeded), stores the resulting path in the handle. `getNextVoxel` pops the next waypoint. `isValid` checks if any path voxel was in a dirty chunk (using `changedVoxels` from `TerrainChangeEvent` for precise detection). `invalidateRegion` scans active handles and marks affected ones invalid. `getHandleMemory` returns the stored path size (small — just a voxel list). No persistent shared state. **Node limit:** Search is capped at `MAX_OPEN_SET` nodes (default: 10,000). If exceeded, a partial path is returned (best path to the closest explored node to the destination), and the handle's debug info flags it as partial. This prevents unbounded exploration in large worlds with unreachable destinations
- **HPA*:** `requestNavigation` queries the coarse graph then runs local A* per chunk. The handle stores the coarse route plus the current chunk's detailed path. `invalidateRegion` uses `chunkCoords` from `TerrainChangeEvent` to update the coarse graph (shared) and invalidates handles whose coarse route passes through dirty chunks. `getHandleMemory` returns the coarse route + local path size. `sharedBytes` includes the coarse graph
- **Flow Fields:** `requestNavigation` ensures a flow field exists for the destination (computing one if needed or reusing a cached one). **Destination-sharing threshold:** If fewer than 2 agents share a destination, the flow field implementation falls back to a per-agent A* search rather than computing a full field — this prevents the destination explosion problem where 50 agents with unique destinations each generate a full flow field. The threshold is configurable. The handle stores a reference to the destination's flow field (or its fallback A* path), not a copy. `getNextVoxel` evaluates the flow vector at the current position and returns the neighboring voxel it points to. `isValid` always returns true — flow fields self-update via `invalidateRegion` (using `changedVoxels` for targeted layer recomputation), so a handle pointing to a flow field is always current. `getPlannedPath` traces the flow vectors forward from the current position and **caches the result** — the cache is invalidated only when the underlying flow field updates, not recomputed every call. This prevents performance issues when the path renderer calls `getPlannedPath` every frame for multiple agents. `getHandleMemory` returns ~0 (the handle is just a pointer; the flow field cost is in `sharedBytes`). `sharedBytes` includes all active flow fields
- **D* Lite:** **Chunk-scoped by default** — the search horizon is limited to the current chunk and adjacent chunks (a 3×3×3 chunk neighborhood). This keeps per-agent memory within the 256 KB budget for typical paths. Full-grid D* Lite is available as an opt-in mode for benchmarking only (`fullGrid: true` parameter). `requestNavigation` runs the initial reverse search within the scoped region and stores the search state in the handle. `getNextVoxel` follows the computed path. `invalidateRegion` uses `changedVoxels` from `TerrainChangeEvent` to flag exactly which edges changed and triggers incremental repair — no chunk re-scanning needed. `isValid` returns true (D* Lite repairs in-place rather than invalidating). `getHandleMemory` returns the size of the rhs/g maps and priority queue — this is the expensive one. `sharedBytes` is near zero
- **Hybrid:** `requestNavigation` runs HPA* for the coarse route, then initializes chunk-scoped D* Lite for the current chunk. If the destination is shared by multiple agents in a corridor, it creates or reuses a flow field for that segment. The handle composes sub-handles from the appropriate algorithms. `getNextVoxel` delegates to whichever sub-algorithm owns the current navigation segment. `invalidateRegion` delegates to each active sub-algorithm

### Design Rationale

The `NavigationHandle` pattern solves the core tension between path-based and field-based navigation. The agent manager doesn't care whether the handle is backed by a stored path or a flow field — it calls `getNextVoxel` each tick and gets a voxel to move toward. The `getPlannedPath` method (which flow fields compute on demand by tracing vectors) ensures the path smoother and path renderer can work uniformly across all algorithms.

The `agentHeight` parameter on `requestNavigation` ensures all clearance checks are correct for the agent's collision volume. Algorithms use this when generating neighbors (2-tall agents need 2 blocks of air).

### VoxelWorldView Interface

To maintain testability despite the tight coupling between pathfinding and world data, algorithms query the world through a `VoxelWorldView` interface rather than accessing chunk data directly:

```
interface VoxelWorldView {
  isWalkable(pos: VoxelCoord, agentHeight: number): boolean;
  isSolid(pos: VoxelCoord): boolean;
  getBlockType(pos: VoxelCoord): BlockType;
  getNeighbors(pos: VoxelCoord, agentHeight: number): VoxelCoord[];
}
```

This allows unit tests to provide mock worlds without constructing full chunk-based voxel grids. The production implementation delegates to the chunk storage. The interface is deliberately minimal — algorithms that need bulk access (flow field layer construction) can extend it with batch methods.

### Pathfinding Budget Manager

The simulation engine allocates a **per-tick pathfinding time budget** to prevent frame hitches. At 20 TPS (50 ms per tick), the pathfinding budget is **15 ms per tick at 1x speed**. The remaining 35 ms covers rendering, simulation updates, and overhead.

The `PathfindingBudgetManager` operates as follows:
- Each tick, it allocates computation time across pathfinding requests (new paths, re-routes, flow field updates)
- Requests are prioritized: active re-routes (agent's path is invalid) > new path requests > flow field background updates
- When the budget is exhausted, remaining requests are deferred to a **re-route queue** that processes N agents per tick
- At 8x speed (6.25 ms per tick), the budget shrinks proportionally — the re-route queue becomes more important as more work is deferred
- **Mass invalidation handling:** When a catastrophic event (explosion, bridge collapse) triggers 10+ simultaneous re-routes, the budget manager spreads them across multiple ticks. Agents whose re-routes are deferred enter the "Re-routing" state and wait in place until their path is recomputed

This is directly portable to Unity (maps to a per-frame time budget checked via `Stopwatch`).

### Error Recovery

If a pathfinding algorithm throws an exception or exceeds a per-computation watchdog timeout (default: 100 ms — well above the per-tick budget, this catches infinite loops and bugs):
1. The affected `NavigationHandle` is marked invalid
2. The agent enters the Stuck state
3. The error is logged to the event log with algorithm name, agent ID, and exception details
4. The simulation continues — one buggy algorithm does not crash the entire simulation or affect other algorithms in side-by-side comparison
5. The dashboard tracks "algorithm errors" as a metric per algorithm

---

## Path Smoothing

Raw voxel paths produce jagged, grid-aligned movement that looks robotic. For Shovel Monster, this isn't cosmetic — NPCs walking in right-angle zigzags will look broken. Path smoothing is addressed early because it affects how paths are represented and interpolated, which touches the pathfinder interface, the agent entity, and the renderer.

### Interface

The `IPathSmoother` interface sits between the pathfinder and the agent's movement system:

```
interface IPathSmoother {
  smooth(rawPath: VoxelCoord[], agentHeight: number): SmoothedWaypoint[];
  isValid(smoothedSegment: SmoothedWaypoint[], world: VoxelGrid, agentHeight: number): boolean;
}
```

`SmoothedWaypoint` includes float coordinates (not grid-snapped) and a movement type (walk, climb, drop, jump) so the renderer knows how to animate the transition. The `agentHeight` parameter ensures the smoothed path respects the full collision volume — a smoothed diagonal shortcut that passes under a 1-block overhang is invalid for a 2-tall agent.

### String-Pulling Algorithm

The primary smoothing approach is string-pulling (also called the "funnel algorithm" in 2D):

1. Start with the raw voxel path [A, B, C, D, E, F]
2. From A, cast a walkability ray toward C (skipping B). If the agent can walk in a straight line from A to C without falling off an edge or hitting a wall, remove B
3. Repeat: from A, test D, then E, until the ray fails. The last successful target becomes the next waypoint
4. Continue from that waypoint

**3D constraints:** String-pulling only applies within the same Y level or across valid step-up/step-down transitions. Vertical segments (ladders, stairs, drops) are never smoothed — they remain grid-aligned because the voxel geometry demands it.

### Walkability Ray

The ray check isn't a simple raycast — it verifies that every voxel the agent would pass through meets movement rules:

- Every intermediate position has a solid block below (walkable floor)
- Every intermediate position has `agentHeight` blocks of air above the floor (clearance for the full collision volume)
- No height change exceeds step-up limit (1 block) without a stair/ladder

This is essentially a Bresenham line walk on the voxel grid with physics checks at each step. The `agentHeight` parameter makes this check correct for agents of any size.

### Integration with Pathfinding

- **Phase 1:** Stub the `IPathSmoother` interface with a passthrough implementation (raw path returned unchanged). Agent movement and rendering work against `SmoothedWaypoint[]` from day one
- **Phase 2:** Implement string-pulling for horizontal segments. Agents start moving in smooth lines on flat terrain while vertical movement remains grid-aligned
- **Phase 3+:** Smoothing quality becomes a visible differentiator between algorithms — flow fields naturally produce smoother movement since agents follow vectors, while A* needs post-processing. This is tracked as a metric ("path smoothness score" — average angle change between consecutive waypoints)

### Shovel Monster Relevance

In Unity, the smoothed waypoints feed directly into the NPC movement controller. The `IPathSmoother` interface maps to a C# interface with the same signature. The walkability ray becomes a voxel-native linecast that replaces Unity's `Physics.Linecast` for terrain checks.

---

## Pathfinding Algorithms

### Algorithm 1: Grid A* (Baseline)

Standard A* on the raw voxel grid. Every voxel is a node, neighbors are the **6 adjacent voxels** (±X, ±Z on the same Y level, plus vertical transitions via step-up/down, ladders, and stairs), and the heuristic is 3D Manhattan distance. Diagonal grid movement is not supported — diagonal shortcuts are handled by the string-pulling path smoother.

**Movement rules:**
- Can move to any cardinally adjacent air voxel (±X or ±Z) that has a solid block below it and `agentHeight` blocks of air above it (walkable with clearance)
- Can step up 1 block (move to air voxel that is 1 higher) if: destination has solid below, `agentHeight` voxels above destination are air, AND origin+`agentHeight` is air (the 4-voxel check — see Agent Model)
- Can step down up to 3 blocks (drop to lower walkable voxel with clearance)
- Can climb ladder voxels vertically (clearance checked at each rung)
- Can traverse stair voxels diagonally upward (clearance checked at destination)

**Node limit:** Search is capped at `MAX_OPEN_SET` nodes (default: 10,000, configurable). If the open set exceeds this limit, the search terminates and returns a **partial path** — the best path found so far to the explored node closest to the destination. The handle's `getDebugInfo()` flags partial paths. This prevents unbounded exploration when destinations are unreachable or paths are extremely long. The existing AI-Colony codebase uses a similar pattern (`MAX_OPEN_SET = 2000` with partial-path fallback).

**Re-routing strategy:** When a terrain change invalidates any voxel in the current path (checked via `TerrainChangeEvent.changedVoxels`), discard the entire path and recompute from current position to destination.

**Characteristics:** Simple, correct, easy to debug. Weakness: recomputes the entire path on every invalidation, which is expensive on large grids. O(n log n) where n is the number of voxels explored. No spatial optimization — explores lots of irrelevant voxels.

**Memory profile:** Low baseline — only the open and closed lists during active computation. No persistent per-agent data structures between path requests. `getHandleMemory` returns just the stored path (typically < 1 KB). Peak memory during computation depends on how many nodes are explored, bounded by `MAX_OPEN_SET`: at the default cap of 10,000 nodes × ~20 bytes each = 200 KB temporarily. This is freed after the path is computed.

### Algorithm 2: Hierarchical Pathfinding (HPA*)

Two-level pathfinding: a coarse graph connecting chunk boundaries, and fine-grained A* within chunks.

**Structure:**
- World divided into 8x8x8 chunks
- Each chunk has entry/exit points on its faces (voxels adjacent to chunk boundaries that are walkable with `agentHeight` clearance)
- A coarse graph connects entry/exit points across chunks (pre-computed, updated when chunks change)
- Path computation: first find a route through the coarse graph (fast), then find detailed paths within each chunk along the route (local A*)

**Re-routing strategy:** When a terrain change occurs in a chunk, only that chunk's internal graph and boundary connections need updating. Paths through unaffected chunks remain valid. If the coarse path is still valid, only the fine path through the changed chunk is recomputed.

**Characteristics:** Much faster re-routing for localized changes (mining one block only affects one chunk). Initial path computation is faster on large maps. Weakness: paths may be slightly suboptimal at chunk boundaries, more complex to implement, chunk boundary computation has overhead.

**Memory profile:** Moderate — the coarse graph is persistent (one per world, shared across agents). Each chunk stores its boundary entry/exit points and internal connectivity. At 32x32x32 with 8x8x8 chunks that's 64 chunks; at 64x64x64 it's 512 chunks. The coarse graph grows linearly with chunk count but each node is lightweight (position + edge list). `sharedBytes` estimate at 64x64x64: ~50–100 KB for the coarse graph. `getHandleMemory`: the coarse route (~100 bytes) plus the current chunk's detailed path (~500 bytes) = trivial.

### Algorithm 3: Flow Fields

Instead of per-agent paths, compute a flow field — a vector at every walkable voxel pointing toward the destination. All agents heading to the same destination share the same flow field.

**Structure:**
- Dijkstra's algorithm from the destination outward, computing cost-to-goal for every reachable voxel
- Each voxel stores a direction vector pointing toward the neighbor with the lowest cost
- Agents simply follow the vector at their current voxel

**Handling 3D — Layer-Based Flow Field Architecture:**

Flow fields in true 3D are significantly more complex than their 2D counterparts. The naive approach — a single flow field across all voxels in 3D — is prohibitively expensive in both computation and memory. Instead, the system uses a layered architecture:

**Layer definition:** A "layer" is a connected set of walkable surfaces at a given Y level. A flat plain is one layer. A multi-story building has one layer per floor. A hillside with gradual slope changes is a single layer that spans multiple Y values (each walkable voxel belongs to the layer of its floor surface). Walkability includes the `agentHeight` clearance check — a surface with only 1 block of air above it is not walkable for a 2-tall agent and does not appear in any layer.

**Layer merge criterion:** Two walkable voxels belong to the same layer if they are horizontally adjacent (±X or ±Z) and their Y values differ by ≤1. Layer assignment is a **flood-fill with ±1 Y tolerance**: starting from any unassigned walkable voxel, flood-fill outward to all horizontally adjacent walkable voxels within ±1 Y. This handles gradual slopes naturally — a hillside where every voxel is a step-up from its neighbor becomes a single layer spanning many Y values, rather than fragmenting into many single-row layers. Staircases carved into hillsides are also handled correctly: continuous ±1 transitions merge into one layer.

**Layer construction:** On world generation (and incrementally on terrain change), scan each column of voxels top-to-bottom. Each walkable surface voxel (air with solid below, plus `agentHeight` clearance above) is assigned to a layer via the flood-fill merge criterion above. Layers are stored as 2D grids (X, Z) with a Y value per cell.

**Vertical connections:** Layers are connected at transition points:
- **Ladders:** Connect the layer at the ladder base to the layer at the ladder top. Bidirectional, cost = ladder height × climb speed penalty
- **Stairs:** Connect adjacent layers where a stair block exists. Bidirectional, cost = 1 × stair speed penalty
- **Drop points:** Where an agent can fall from one layer to a lower one (up to 3 blocks). Unidirectional (down only), cost = 1 + fall_distance × 0.5 (landing recovery)
- **Step-ups:** Where two layers differ by exactly 1 Y level and the geometry allows stepping. Bidirectional, cost = 1.2

**Flow field computation:** Dijkstra runs within each layer as a 2D problem (fast). At vertical connections, the algorithm crosses to the connected layer and continues. The result is one 2D flow field per layer, plus transition vectors at connection points. An agent following the flow field walks along its current layer's vectors, and when it reaches a transition point, it switches to the connected layer.

**Incremental update on terrain change:** When a block is removed or added:
1. Recompute affected layer assignments in the changed column and its neighbors (including `agentHeight` clearance re-checks — removing a block at Y=5 may make Y=3 walkable if it now has 2 blocks of clearance)
2. If layers merged, split, or shifted, update the connection graph
3. Re-run Dijkstra from the changed region outward on affected layers only
4. Unaffected layers retain their existing flow field data

**Re-routing strategy:** When terrain changes, the flow field is partially recomputed from the changed voxels outward (incremental Dijkstra update). Only the affected layers and regions of those layers are recalculated. NavigationHandles pointing to updated flow fields remain valid — they automatically reflect the new vectors on the next `getNextVoxel` call.

**Destination-sharing threshold:** Flow fields only provide a net benefit when multiple agents share a destination. When fewer than N agents target the same destination (default N=2, configurable), the flow field implementation falls back to a per-agent A* search instead of computing a full field. This prevents the **destination explosion problem**: in a Shovel Monster scenario with 50 NPCs each going to different destinations, naive flow fields would require ~47 MB. With the sharing threshold, only genuinely shared destinations get flow fields; unique destinations use cheap A* paths. This makes the standalone flow field algorithm more practical and the benchmark comparison fairer.

**Characteristics:** Excellent for many agents heading to the same destination (computed once, used by all). Handles terrain changes gracefully with incremental updates. The destination-sharing threshold mitigates the main weakness (one flow field per destination). Still memory-intensive for shared destinations (stores a vector per walkable voxel per destination per layer), and doesn't handle per-agent constraints well.

**Memory profile:** High for shared destinations, but bounded by the sharing threshold. Each active shared destination requires a complete flow field (one vector per walkable voxel per layer). At 64x64x64 with ~30% walkable voxels and 5 shared destinations, that's roughly 5 × 78,000 × 12 bytes ≈ 4.7 MB for flow vectors alone. Destinations below the sharing threshold use per-agent A* paths (~1 KB each). Memory is tracked per-destination and stale flow fields (no agents using them) are evicted after a configurable TTL. `getHandleMemory` returns ~0 for flow field handles (just a pointer to the shared flow field) or the A* path size for fallback handles. `sharedBytes` is the dominant cost.

### Algorithm 4: D* Lite (Phase 4)

An incremental replanning algorithm specifically designed for dynamic environments. Unlike A* which recomputes from scratch, D* Lite repairs the existing search when the world changes.

**Structure:**
- Initial path computed like A* but in reverse (from destination to start)
- When terrain changes, only the affected edges in the search graph are updated
- The algorithm maintains a priority queue of inconsistent nodes and repairs the minimum necessary portion of the path

**Re-routing strategy:** This IS the re-routing strategy. D* Lite was designed for exactly this problem — a robot navigating a changing environment. When blocks are mined or placed, the affected edges are flagged, and the algorithm incrementally repairs the path without restarting the search. NavigationHandles repair in-place — `isValid` always returns true because the handle fixes itself.

**Chunk-scoped by default:** D* Lite's search horizon is limited to the **current chunk and adjacent chunks** (a 3×3×3 chunk neighborhood) by default. This bounds per-agent memory to manageable levels while covering the vast majority of practical navigation distances (3 chunks × 8 voxels = 24 voxels in each axis — sufficient for local navigation within a settlement or mine). For paths that span more than 3 chunks, D* Lite is paired with HPA* for the coarse route (as in the Hybrid algorithm). Full-grid D* Lite (unbounded search horizon) is available as an opt-in mode for benchmarking only (`fullGrid: true` parameter on `requestNavigation`), to measure the pure algorithmic behavior without the scope limitation.

**Characteristics:** The gold standard for dynamic pathfinding. Minimal re-computation on terrain changes. Paths are always optimal within the search scope. Uses `TerrainChangeEvent.changedVoxels` to update exactly the affected edges without re-scanning chunks. Weakness: more complex to implement than A*, higher per-node memory overhead, initial computation is slightly slower than A*.

**Memory profile:** Moderate when chunk-scoped, high when full-grid. **Dominated by search frontier size, not grid size.** D* Lite maintains rhs values, g values, and the priority queue for every node explored during the initial search. With the default chunk-scoped mode, the search explores at most a 24×24×24 region (~13,824 voxels, ~30% walkable = ~4,150 nodes). The critical factor is how much of the scoped region the search explores:

**Chunk-scoped mode (default):**
- **Short path** (agent to destination 10 voxels away, open terrain): search explores ~100–500 nodes. Memory: ~2–10 KB per agent
- **Medium path** (across the full 3-chunk scope through moderate obstacles): search explores ~1,000–4,000 nodes × ~40 bytes (g, rhs, priority, parent, flags) = 40–160 KB per agent
- **Worst case** (destination unreachable within scope, all walkable nodes explored): up to ~4,150 nodes × 40 bytes ≈ 166 KB per agent — **well within the 256 KB per-agent budget**

**Full-grid mode (opt-in benchmarking only):**
- **Medium path** (across a 64-wide map through moderate obstacles): search explores ~5,000–15,000 nodes = 200–600 KB per agent
- **Long path** (full diagonal of 64x64x64 through complex terrain): search explores ~20,000–50,000 nodes = 800 KB–2 MB per agent
- **Worst case** (destination unreachable, entire reachable grid explored): up to ~78,000 walkable nodes × 40 bytes ≈ 3 MB per agent

At 20 agents with chunk-scoped D* Lite, expect 0.8–3.2 MB total state. The per-agent budget of 256 KB is comfortably met in the default mode. Full-grid mode is expected to exceed the budget for medium+ paths — this is acceptable since it exists only for benchmark comparison.

### Algorithm 5: Hybrid Navigation (Phase 5)

A practical combination approach designed for game production rather than algorithmic purity.

**Structure:**
- HPA* for long-distance coarse planning (chunk-to-chunk)
- Local steering with obstacle avoidance for immediate movement (next 3–5 voxels)
- D* Lite for the current chunk's detailed path (handles local changes efficiently)
- Flow fields for high-traffic corridors where many agents share a path

**Routing decision logic:** The hybrid system selects which sub-algorithm handles each navigation request based on explicit thresholds:

- **Distance check (first):** If start and destination are within the same chunk or adjacent chunks (≤2 chunks apart in any axis), use D* Lite directly for the entire path. Short paths don't benefit from hierarchical decomposition and D* Lite's incremental repair is most efficient at this scale
- **Long-distance paths (>2 chunks):** Use HPA* for the coarse route (chunk-to-chunk), then D* Lite for navigation within the current chunk. As the agent crosses chunk boundaries, a new D* Lite handle is initialized for the next chunk using the coarse route as guidance. The previous chunk's D* Lite state is released
- **Flow field promotion:** When 3 or more agents have active NavigationHandles targeting the same destination within the same chunk, the hybrid system promotes that chunk+destination pair to a flow field. All affected agents' handles are transparently switched to use the flow field instead of individual D* Lite instances. This saves memory (one shared flow field vs N separate D* Lite search states) and computation (one incremental update vs N repairs on terrain change). The promotion threshold (default: 3 agents) is configurable via the tuning interface
- **Flow field demotion:** When the number of agents using a promoted flow field drops to **0**, the flow field is scheduled for eviction (after a configurable TTL, default: 100 ticks). If new agents request the same destination before eviction, the flow field is kept. **Hysteresis:** The asymmetric thresholds (promote at 3, demote at 0) prevent thrashing — a flow field with 1–2 remaining agents stays active rather than being torn down and immediately rebuilt when new agents arrive. A single agent on a shared flow field is cheaper than spinning up a new D* Lite instance, and the TTL ensures abandoned flow fields are eventually cleaned up
- **Fallback:** If D* Lite fails to find a path within 5 ms of computation time (configurable), the agent falls back to HPA* coarse route with Grid A* for the local segment. If all pathfinding fails, the agent enters the fallback behavior (retreat to nearest known-good position — the last voxel where a successful path existed — and retry after a cooldown of 20 ticks)

**Intelligence layer:**
- Agents predict terrain changes — if an NPC is mining ahead, nearby agents query the miner's planned block removals and preemptively invalidate paths through those voxels. This requires a lightweight "intent broadcast" system: when an agent begins a multi-tick mining action, it publishes the target block coordinates to a shared intent registry. Other agents within a configurable radius (default: 16 voxels) subscribe to these intents and treat the targeted blocks as "pending removal" in their cost calculations — not impassable yet, but with an elevated traversal cost that discourages routing through them. When the mining completes, the actual terrain change triggers standard path invalidation. The net effect is that nearby agents start re-routing before the block disappears rather than after. **Implementation details:** Intent updates are **batched per tick** — all new/expired intents are collected during the tick and applied once at the end, rather than triggering cost recalculations on each individual publish/expire event. The subscription radius check is routed through the **spatial hash** (same data structure used for congestion detection) to avoid O(agents) scans per mining action
- Path reservation system for multi-agent deconfliction (agents "book" upcoming voxels to prevent congestion)
- Fallback behaviors: if pathfinding fails, agent moves to nearest known-good position and retries

**Re-routing strategy:** Layered — local changes handled by D* Lite (fast), chunk-level changes trigger HPA* coarse path update (medium), catastrophic changes (explosion removing 100+ blocks) trigger full recompute (slow but rare). Predictive invalidation from the intent system means many re-routes happen before the terrain change, spreading the computation cost over multiple ticks instead of spiking on the change tick.

**Characteristics:** The most robust and game-ready approach. Handles all scenarios well because it uses the right tool for each scale of navigation. The predictive layer means agents in a world with active miners behave more naturally — they route around active work sites rather than walking into a collapsing tunnel and then panicking. Weakness: most complex to implement, hardest to debug, many tuning parameters.

**Memory profile:** Varies — the hybrid system's memory footprint depends on which sub-algorithms are active. The intent registry is lightweight (a few KB). The combination of HPA* (shared coarse graph) + D* Lite (per-agent local search, scoped to one chunk) + flow fields (per-corridor, only promoted when shared) should stay well under the sum of running all algorithms independently because each operates on a limited scope. D* Lite scoped to a single 8x8x8 chunk explores at most 512 walkable nodes × 40 bytes = 20 KB per agent — dramatically smaller than grid-wide D* Lite. Target memory budget: under 50 MB for 20 agents at 64x64x64.

---

## Multi-Agent Behavior

### Congestion Handling

Congestion handling is introduced in Phase 2 (alongside the first multi-agent scenarios) and refined in later phases. This ensures it is tested and debugged against two well-understood algorithms (A* and HPA*) before adding flow fields or D* Lite.

The congestion system uses **two strategies** depending on the algorithm's navigation model:

**Strategy 1: Path Reservation (path-based algorithms — A*, HPA*, D* Lite, Hybrid)**

- **Path Reservation Table:** Agents register their planned positions for the next N ticks. Other agents avoid reserved voxels when computing paths. Introduced in Phase 2 with basic reservation (next 3 ticks). Extended in Phase 3 with configurable lookahead and priority-based override. **Data structure:** `Map<tick, Set<VoxelCoord>>` with garbage collection of past ticks every 20 ticks. **Reservation lifecycle:** Reservations are created when a path is computed, **cancelled when the agent re-routes, arrives, or dies** (stale reservations from invalidated paths must be cleaned up to avoid ghost-blocking other agents), and expire automatically when the reserved tick passes. The `releaseNavigation` method on `IPathfinder` is responsible for cancelling all reservations associated with the released handle
- **Wait vs Re-route Decision:** If a path is temporarily blocked by another agent, the agent waits for up to 5 ticks (250 ms at 1x) before attempting a re-route. Prevents thrashing when two agents meet in a corridor
- **Priority System:** Agents carrying resources have higher priority than idle agents. Higher priority agents don't yield. Equal priority uses agent ID as tiebreaker

**Strategy 2: Spatial Density (flow field agents)**

Flow field agents don't have planned future positions — they follow the vector at their current voxel each tick. They can't populate a reservation table. Instead, flow field congestion uses a reactive density-based approach:

- **Density Check:** Each tick, flow field agents check the occupancy of the voxel their flow vector points toward. If occupied by another agent, they do not advance (wait in place)
- **Wait Escalation:** After waiting 5 ticks, the agent checks for alternative adjacent voxels that are unoccupied and whose flow vectors still generally point toward the destination (dot product > 0.5 with the ideal flow direction). If one exists, the agent sidesteps to it. This creates a natural "flowing around obstacles" behavior
- **Corridor Throughput:** In narrow corridors (1–2 voxels wide), flow field agents naturally form single-file lines because only one agent can advance per tick per voxel. The density check prevents pileups, and the wait escalation prevents permanent blockages

**Shared across both strategies:**

- **Congestion Detection:** If more than 3 agents are within a 3-voxel radius and all are waiting, trigger a group re-route (for path-based agents) or a group scatter (for flow field agents — each picks a random alternative adjacent voxel to break the deadlock)
- **Deadlock Detection:** If any agent has been in the Waiting state for 20 ticks (1 second at 1x), it is forced into a re-route (path-based) or a random scatter (flow field). This is the safety valve — it should rarely trigger if the primary congestion system is working

The Hybrid algorithm (Phase 5) uses whichever strategy matches the currently active sub-algorithm for each agent. Agents promoted to a flow field switch from reservation to density. Agents demoted from a flow field switch back.

### Metrics Tracked

- **Congestion events per minute:** How often agents block each other
- **Average wait time:** Time spent waiting for other agents to move
- **Deadlock occurrences:** Two or more agents permanently blocking each other (should be zero with a good system)
- **Group throughput:** Agents passing through a chokepoint per minute
- **Forced scatter count:** How often the 20-tick safety valve fires (should be rare — high counts indicate congestion system failure)

---

## Scenario Definitions

Each scenario is defined by a parameter block that scales with world size. The "base" column is for 32x32x32 (interactive). Parameters scale linearly with world size unless noted: a value of 16 at 32x32x32 becomes 32 at 64x64x64.

### Canyon Run

Tests re-routing as the navigable space changes shape progressively.

| Parameter | Base (32³) | Scaling |
|-----------|-----------|---------|
| Canyon length | 24 blocks | Linear |
| Canyon width (initial) | 3 blocks | Fixed (stays narrow) |
| Canyon depth | 8 blocks | Linear |
| Agents | 6 | +4 per world size doubling |
| Agent spawns | Evenly spaced at canyon entrance (one end) | — |
| Destinations | Evenly spaced at canyon exit (opposite end) | — |
| Mining rate | 1 wall block removed every 10 ticks (both sides alternating) | Fixed rate |
| Duration | 400 ticks | Linear |
| What it tests | Path recalculation as corridor widens; do agents exploit new space? | — |

### Bridge Collapse

Tests emergency re-routing when the ground disappears under agents.

| Parameter | Base (32³) | Scaling |
|-----------|-----------|---------|
| Bridge length | 16 blocks | Linear |
| Bridge width | 3 blocks | Fixed |
| Bridge height above ground | 8 blocks | Linear |
| Agents | 4 (2 starting from each side) | +2 per doubling |
| Agent spawns | 2 on each end of bridge | — |
| Destinations | Opposite end of bridge | — |
| Destruction pattern | Remove one block from the center every 5 ticks, expanding outward alternating left/right | Fixed rate |
| Collapse onset tick | 40 (agents are mid-crossing) | Linear |
| Ground below | Flat solid terrain with a ramp at each end leading back up | — |
| Duration | 300 ticks | Linear |
| What it tests | Path invalidation mid-traversal, gravity/falling recovery, finding alternative routes via ground level | — |

### Stairwell

Tests vertical navigation through a multi-story structure.

| Parameter | Base (32³) | Scaling |
|-----------|-----------|---------|
| Floors | 4 | +2 per doubling |
| Floor height | 4 blocks (3 air + 1 solid floor) | Fixed |
| Stairwell width | 2 blocks | Fixed |
| Floor plate size | 12×12 blocks | Linear |
| Vertical connectors | Mix: ladder shaft (1×1) on one side, stairs (2-wide) on the other | — |
| Platforms | Platform blocks used for scaffolding in the central atrium | Phase 3+ |
| Agents | 8 | +4 per doubling |
| Agent spawns | Random floor, random position on floor plate | Seeded |
| Destinations | Random different floor, random position | Seeded |
| Duration | 600 ticks | Linear |
| What it tests | Vertical pathfinding, ladder vs stair preference, multi-floor routing, clearance checks in tight stairwells | — |

### Rush Hour

Tests congestion handling under extreme multi-agent density.

| Parameter | Base (32³) | Scaling |
|-----------|-----------|---------|
| Corridor length | 20 blocks | Linear |
| Corridor width | 2 blocks | Fixed |
| Waiting areas | 8×8 open area on each end | Linear |
| Agents | 24 (12 on each side) | +12 per doubling |
| Agent spawns | Random positions in each waiting area | Seeded |
| Destinations | Random positions in the opposite waiting area | Seeded |
| Terrain changes | None — pure congestion test | — |
| Duration | 800 ticks | Linear |
| What it tests | Bidirectional flow through narrow corridor, deadlock prevention, priority system, congestion throughput | — |

### Swiss Cheese

Tests continuous random invalidation stress.

| Parameter | Base (32³) | Scaling |
|-----------|-----------|---------|
| Terrain | Flat plane at Y=8 with random solid pillars (30% coverage) | Coverage % fixed |
| Removal rate | 1 random solid block removed every 3 ticks | +1 per doubling (rate) |
| Addition rate | 1 random solid block added every 5 ticks | +1 per doubling (rate) |
| Agents | 10 | +5 per doubling |
| Agent spawns | Random walkable positions | Seeded |
| Destinations | Random walkable positions, reassigned on arrival | Seeded |
| Duration | 1000 ticks | Linear |
| What it tests | Continuous path invalidation, re-route frequency under constant change, algorithm robustness to unpredictable terrain | — |

### Construction Zone

Tests path invalidation from blocks being added (the opposite of mining).

| Parameter | Base (32³) | Scaling |
|-----------|-----------|---------|
| Initial terrain | Flat open area with a clear path from left to right | — |
| Wall construction | Solid blocks added in a line perpendicular to the path, 1 block every 4 ticks, building a wall that progressively blocks the direct route | Fixed rate |
| Wall gap | A 2-block gap is left in the wall at a random position (agents must discover it) | Fixed |
| Agents | 6 | +3 per doubling |
| Agent spawns | Left side of the area | — |
| Destinations | Right side of the area | — |
| Duration | 500 ticks | Linear |
| What it tests | Path invalidation from added blocks (headroom violations for 2-tall agents), discovery of new routes through gaps, adaptation to growing obstacles | — |

### Free Fall

Tests gravity recovery and emergency re-pathing.

| Parameter | Base (32³) | Scaling |
|-----------|-----------|---------|
| Platform height | 10 blocks above ground | Linear |
| Platform size | 16×16 blocks | Linear |
| Ground | Flat solid terrain below, with ramps back up to platform edge | — |
| Removal pattern | Remove a 3×3 section of platform every 15 ticks, starting from center | Fixed rate, section size fixed |
| Agents | 8 | +4 per doubling |
| Agent spawns | Random positions on platform | Seeded |
| Destinations | Random positions on platform (forces agents to stay on shrinking surface) | Seeded, reassigned on arrival |
| Duration | 400 ticks | Linear |
| What it tests | Gravity and falling, landing recovery (3-tick pause), path invalidation from below (floor removed), re-routing to ground level and back up | — |

### Active Mine (Phase 5)

Tests predictive navigation via the intent broadcast system.

| Parameter | Base (32³) | Scaling |
|-----------|-----------|---------|
| Terrain | Underground tunnel network: main corridor (20 long × 3 wide) with 4 branch tunnels | Linear lengths |
| Mining agents | 3 (stationary, mining the walls of branch tunnels) | +1 per doubling |
| Mining rate | Each miner removes 1 block every 8 ticks (multi-tick action: 8 ticks to mine) | Fixed |
| Transit agents | 6 (navigating through the tunnels to reach destinations beyond the work sites) | +3 per doubling |
| Transit spawns | One end of main corridor | — |
| Transit destinations | Ends of branch tunnels (forces routing through active mining areas) | — |
| Duration | 600 ticks | Linear |
| What it tests | Intent broadcast system, predictive re-routing, cost elevation near pending block removal, computation distribution across ticks | — |

### Custom

User-defined terrain with manual block editing. No fixed parameters — the user places blocks, sets agent spawns and destinations, and optionally records scheduled terrain change events (via a "record" mode that logs manual edits with tick timestamps). Custom scenarios can be saved/loaded as JSON.

---

## Memory Budget

Memory usage is tracked as a first-class metric alongside computation time. This is critical because D* Lite and flow fields are both memory-hungry, and the Shovel Monster port needs to fit within Unity's memory constraints.

### Dashboard Metrics

- **Per-algorithm memory usage:** Sampled every N simulation ticks via `performance.memory` (Chrome) or manual accounting of data structure sizes. Displayed as a line chart on the metrics dashboard
- **Per-agent memory breakdown:** Visible in the agent inspector — how much memory this agent's pathfinding state consumes (search state for D* Lite, reservation table entries, cached path data)
- **Peak memory during re-route:** The high-water mark when a terrain change triggers mass path invalidation. This is the number that matters most for Shovel Monster — it determines whether the system can handle an explosion without a frame hitch

### Target Budgets

These are soft targets based on Shovel Monster's expected constraints (Unity on mid-range hardware):

- **Per-agent pathfinding state:** ≤ 256 KB (at 50 active NPCs, that's ~12.5 MB total)
- **Shared data structures** (coarse graph, flow fields, reservation table): ≤ 20 MB
- **Peak during mass invalidation:** ≤ 50 MB total pathfinding memory (all agents re-routing simultaneously)

Algorithms that exceed these budgets in the browser benchmark are flagged in the results summary with a note on what would need to change for Unity (e.g., "D* Lite exceeds per-agent budget at long path lengths — consider limiting search horizon to current + adjacent chunks, or scoping D* Lite to local navigation as in the Hybrid approach").

---

## Benchmark Methodology

Headless benchmarks drive the algorithm recommendations for Shovel Monster. A single run per configuration isn't rigorous enough — random seed variation in terrain generation, agent spawning, and event timing can produce outlier results that distort comparisons.

### Statistical Protocol

Each benchmark configuration (algorithm × scenario × world size) is run **10 times with different seeds** (seeds 1–10). The benchmark runner collects per-run values for all metrics and reports:

- **Mean** and **standard deviation** for each metric
- **Min and max** to identify outlier sensitivity
- **Median** for metrics with skewed distributions (path computation time spikes from mass invalidation)

A difference between two algorithms is considered meaningful only if their confidence intervals (mean ± 1 stddev) don't overlap. The results summary flags comparisons where the difference is within noise.

### Agent Destination Assignment (Benchmark Mode)

In headless benchmarks, agents need destinations without user input. The assignment strategy varies by scenario (specified in each scenario's parameter block), but the defaults are:

- **Initial assignment:** Each agent receives a random walkable destination from the seeded RNG at simulation start
- **Re-assignment on arrival:** When an agent reaches its destination, it is immediately assigned a new random walkable destination from the same RNG stream. This keeps agents continuously navigating for the benchmark duration, producing steady-state pathfinding workload rather than a burst at the start
- **Unreachable destination handling:** If a pathfinder returns null (no path), the agent waits 10 ticks then requests a new random destination. After 3 consecutive failures, the agent is marked "stranded" for the run and excluded from throughput calculations (but counted in the "failed paths" metric)

This produces a workload that mixes short, medium, and long paths across the grid, which is representative of typical game NPC behavior (a mix of local tasks and cross-map travel).

### CSV Export Format

Each benchmark run produces a row in the CSV with columns: `seed, algorithm, scenario, world_size, mean_path_time_ms, median_path_time_ms, reroute_count, reroute_mean_ms, failed_paths, agent_throughput_per_min, congestion_events, deadlocks, memory_peak_bytes, memory_mean_bytes, path_smoothness_score, total_ticks`. The aggregate summary (mean ± stddev across seeds) is exported as a separate summary CSV.

### Diagnostic Report Export

The system can export a comprehensive **diagnostic report** as a single Markdown file designed to be reviewed by an AI assistant (Claude) or a human developer. The report is generated from the dashboard via an "Export Diagnostic Report" button, or automatically at the end of a headless benchmark run. It consolidates everything needed to assess bugs, performance issues, plan compliance, and algorithm rankings into one reviewable document.

**Report structure:**

#### 1. Run Configuration
- Date/time, plan version, commit hash (if in a git repo)
- Scenario name, world size, seed(s), tick count, simulation speed
- Algorithms included, active tuning parameters (all non-default values listed)
- Phase indicator (which algorithms are implemented — helps the reviewer know what to expect)

#### 2. Algorithm Comparison Summary
- **Ranking table:** Algorithms ranked by each key metric (path computation time, re-route cost, throughput, failed paths, memory peak, memory mean, path smoothness, congestion events). Winner per metric highlighted. Overall recommendation based on weighted scoring (computation time 30%, re-route cost 25%, memory 20%, throughput 15%, failed paths 10%)
- **Statistical confidence:** For multi-seed runs, each comparison includes mean ± stddev and flags whether the difference is statistically meaningful (confidence intervals don't overlap) or within noise
- **Head-to-head matrix:** Pairwise algorithm comparison — for each pair, which wins on which metrics and by how much

#### 3. Performance Analysis
- **Per-tick timing breakdown:** Min/mean/max/p95 pathfinding computation time per tick, per algorithm. Ticks that exceeded the 15 ms budget are flagged with details (how many agents were re-routing, what terrain event triggered it)
- **Budget overrun log:** Every tick where the PathfindingBudgetManager deferred work, with: tick number, number of deferred re-routes, time spent, triggering event
- **Re-route spike analysis:** The top 10 most expensive re-route events, with: tick, algorithm, cause (terrain change type + location), agents affected, computation time, whether time-slicing was triggered
- **Memory timeline:** Per-algorithm memory at every sampling point (every N ticks), with annotations at terrain change events. Peak memory per algorithm with the tick and event that caused it
- **Memory budget compliance:** Per-algorithm pass/fail against target budgets (256 KB per-agent, 20 MB shared, 50 MB peak). Violations listed with specific values

#### 4. Bug Detection / Anomaly Log
- **Stuck agents:** Every agent that entered Stuck state, with: agent ID, tick, position, destination, algorithm, cause (no path found / destination solid / timeout / algorithm error). Agents that recovered vs. agents that remained stuck
- **Algorithm errors:** Every watchdog timeout or exception, with: algorithm, agent ID, tick, error message, stack trace summary
- **Determinism violations:** If running multi-seed, any case where identical seeds produced different results (should never happen — if it does, it's a bug)
- **Pathfinding failures:** Every `requestNavigation` that returned null, with: start, destination, algorithm, whether the destination was reachable (post-hoc BFS check). Helps distinguish "correct no-path" from "algorithm bug"
- **Reservation ghosts:** Any detected stale reservations (reservations from dead/arrived agents that weren't cleaned up). Count and tick range
- **Handle leaks:** Number of NavigationHandles cleaned up by `sweepLeakedHandles`, with agent IDs and ticks
- **Partial paths:** Count of paths returned via MAX_OPEN_SET limit (per algorithm). High counts indicate the node limit may be too low or destinations are frequently unreachable
- **Destination invalidation events:** Count of auto-retargets (destination became solid), with: original destination, retargeted destination, distance shifted

#### 5. Plan Compliance Checklist
An automated checklist verifying the implementation matches the plan specification:
- [ ] Movement is 6-directional (no diagonal grid moves detected in path data)
- [ ] Step-up uses 4-voxel check (origin+2 clearance verified — sampled from path data)
- [ ] Agent processing order is ascending by agentId (verified from tick log)
- [ ] All terrain changes produce TerrainChangeEvent with both chunk and voxel data
- [ ] Path reservation lifecycle: no stale reservations detected after agent arrival/death
- [ ] Flow field destination-sharing threshold active (destinations below threshold used A* fallback)
- [ ] D* Lite is chunk-scoped (search did not exceed 3×3×3 chunk neighborhood, unless fullGrid mode)
- [ ] Hybrid flow field promotion threshold = 3, demotion threshold = 0 (or current configured values)
- [ ] Intent broadcasts batched per tick (no mid-tick cost recalculations)
- [ ] Simulation determinism holds (if multi-seed: same seed = same state at tick N)
- [ ] Per-tick pathfinding budget enforced (budget manager active, deferrals logged)
- [ ] Error recovery operational (algorithm errors caught, simulation continued)

Each item is marked PASS, FAIL, or N/A (if the relevant phase isn't implemented yet). Failed items include details about what was detected.

#### 6. Agent Behavior Summary
- **Throughput:** Agents reaching destinations per minute, per algorithm
- **State distribution:** Percentage of agent-ticks spent in each state (Idle, Navigating, Re-routing, Waiting, Falling, Stuck) per algorithm. High Re-routing or Waiting percentages flag congestion issues. Any Stuck time flags bugs
- **Congestion hotspots:** Voxel coordinates where the most wait events occurred (top 10), with agent count and total wait ticks. Helps identify bottleneck geometry
- **Path quality:** Mean/median path length vs. straight-line distance (efficiency ratio), per algorithm. Algorithms producing consistently longer paths may have suboptimal heuristics

#### 7. Event Timeline
- Chronological log of significant events: terrain changes, mass invalidations, flow field promotions/demotions, algorithm errors, stuck agents, budget overruns. Each entry includes tick, event type, and affected agents/algorithms. Capped at 500 entries (oldest trimmed) to keep the report reviewable

#### 8. Raw Data References
- Paths to the CSV files (per-run and aggregate summary) for deeper analysis
- Path to the simulation seed(s) for reproduction
- Path to the scenario definition file (if custom)

**File format:** Markdown (`.md`) with tables, code blocks for data, and a structured heading hierarchy. Designed so an AI reviewer can parse each section independently and provide targeted feedback. The report is self-contained — all data needed for review is inline, not behind file references (except raw CSVs for optional deep-dives).

**File naming:** `diagnostic-report-{scenario}-{algorithm|"all"}-{timestamp}.md`

---

## Development Phases

### Phase 1: Foundation (Target: 1–2 weeks)

**Goal:** Single 3D voxel world with Grid A*, one agent, manual terrain editing, metrics dashboard.

- Project scaffolding (Vite + React + TypeScript + Three.js + Zustand + Vitest)
- Voxel grid data structure (32x32x32, chunk-based 8x8x8 storage)
- Three.js voxel renderer (instanced meshes, face culling for performance)
- Camera controls (orbit, pan, zoom)
- Block types: solid, air, ladder, stair (platform deferred to Phase 3)
- Agent model: 1×2×1 voxel collision volume, configurable height in `movement-rules.ts`
- Gravity system (agents fall when ground removed, 3-tick landing pause)
- Grid A* pathfinding with 6-directional 3D movement rules (cardinal + vertical transitions — all with `agentHeight` clearance checks, including the 4-voxel step-up check with origin clearance)
- `MAX_OPEN_SET` node limit (default: 10,000) with partial-path fallback
- `IPathfinder` interface with `TerrainChangeEvent` (chunk + voxel granularity, change type, tick), `maxComputeMs` time-slicing on `requestNavigation`, `sweepLeakedHandles` for GC, and `NavigationHandle` abstraction with `isComputing()` state (Grid A* as first implementation)
- `VoxelWorldView` interface for pathfinder-world decoupling and testability
- `PathfindingBudgetManager` — 15 ms per-tick pathfinding budget with priority queue and re-route deferral
- Error recovery: per-computation watchdog timeout (100 ms), graceful degradation to Stuck state on algorithm errors, error logging to event log
- `IPathSmoother` interface with passthrough implementation (raw path returned unchanged, but agents consume `SmoothedWaypoint[]` from day one)
- `MemoryReport` with `sharedBytes` and `peakBytes` only — per-agent memory accessed via `NavigationHandle.getHandleMemory()`
- Deterministic simulation: integer voxel coordinates, tick-based progress counters, seeded xoshiro128 PRNG, deterministic tiebreakers, **agents processed in ascending agentId order**
- Destination invalidation: when destination voxel becomes solid, auto-retarget to nearest walkable voxel (BFS)
- Single agent: assign destination by clicking a voxel, watch it navigate
- Path visualization (colored line through voxels, explored nodes heatmap)
- Manual terrain editing (click to remove block, shift+click to place)
- Metrics dashboard with path computation time, nodes explored, path length, memory usage
- Simulation controls (play, pause, speed 1x–8x, reset) at 20 TPS base rate
- Seeded world generation (simple terrain with hills, a cave, and a stairwell)
- Unit tests for A* correctness (including 2-tall agent clearance, 4-voxel step-up check, 6-directional neighbors, node limit with partial-path fallback), movement rules, gravity, destination invalidation, determinism (same seed = **same path AND same simulation state at tick N** across two independent runs — path determinism is necessary but not sufficient)
- **Phase gate infrastructure:** `npm run test:phase1` script wired up in `package.json`, `tests/phase-gates/phase1.test.ts` implemented with all 28 gate tests. This is a Phase 1 deliverable, not a later addition — the gate infrastructure must be verified working before Phase 1 is considered complete. All 28 tests must pass

**Milestone:** One agent navigating a 3D voxel world with 2-block-tall clearance. Mine blocks and watch it re-route. Dashboard shows pathfinding performance including memory. Path smoothing and pathfinder interfaces are stubbed and ready for implementation. Time-slicing and budget management are operational. Simulation is deterministic and reproducible via seed. `npm run test:phase1` passes all 28 gate tests.

### Phase 2: Comparison Mode (Target: 1–2 weeks)

**Goal:** Side-by-side A* vs HPA*, multiple agents with basic congestion handling, terrain change events.

- HPA* implementation (chunk boundary graph, two-level pathfinding, second `IPathfinder` implementation)
- Chunk dirty flagging and incremental boundary recomputation
- Side-by-side rendering (two Three.js canvases, mirrored terrain, different algorithms)
- Multiple agents (5–10 per sandbox) with random destination assignment from seeded RNG
- Basic congestion handling (path reservation strategy only — flow field density strategy deferred to Phase 3): path reservation table (`Map<tick, Set<VoxelCoord>>`, next 3 ticks), **reservation lifecycle management** (create on path compute, cancel on re-route/arrival/death, expire after tick passes, GC past ticks every 20 ticks), wait-before-reroute (5 tick / 250 ms threshold), priority system (carrying > idle, agent ID tiebreaker). Introducing this now against two well-understood path-based algorithms (A* and HPA*) means congestion bugs are isolated from algorithm bugs
- `sweepLeakedHandles` integration: simulation engine calls sweep every 100 ticks to clean up NavigationHandles whose agents no longer exist
- Congestion metrics on dashboard (events/min, avg wait time, deadlocks, group throughput)
- Mirrored terrain change events (scheduled block removal/addition)
- Path invalidation system (detect when terrain change affects an agent's NavigationHandle via `isValid()`)
- Agent state machine (Idle, Navigating, Re-routing, Waiting, Falling, Stuck)
- Comparison dashboard (side-by-side metrics for both algorithms, including memory via `getMemoryUsage()`)
- Event log with terrain changes, re-routes, failures
- Pre-built scenarios: Canyon Run, Bridge Collapse (with full parameter blocks as defined in Scenario Definitions)
- Agent inspector (click to see path, state, algorithm debug info via `getDebugInfo()`, memory footprint via `getHandleMemory()`)
- String-pulling path smoothing for horizontal segments with `agentHeight` clearance checks (first real `IPathSmoother` implementation — agents move in smooth lines on flat terrain, vertical movement stays grid-aligned)
- Terrain editing available in both views: sandbox uses mouse interaction, dashboard exposes coordinate input panel (x, y, z + mine/place). Both mirror changes across algorithm sandboxes
- **Diagnostic report (initial):** Export button on dashboard. Report includes sections 1 (Run Configuration), 3 (Performance Analysis — basic timing and memory), 4 (Bug Detection — stuck agents, algorithm errors, pathfinding failures), 5 (Plan Compliance — checks applicable to Phase 2), and 6 (Agent Behavior Summary). Algorithm comparison (section 2) deferred to Phase 3 when 3+ algorithms are available. Event timeline (section 7) included. This establishes the report format early so it can be reviewed and refined before the full benchmark suite arrives
- Unit tests for HPA* boundary computation, chunk updates, path reservation correctness (including reservation cancellation on re-route and agent death), handle leak sweep, TerrainChangeEvent propagation, 2-tall clearance at chunk boundaries

**Milestone:** A* and HPA* running side-by-side with the same terrain changes and the same congestion rules. Clear performance differences visible on the dashboard, especially during mining events. Agents move smoothly on flat ground with 2-block clearance respected. Diagnostic report exportable for AI review. Multi-agent interactions are already debugged before more complex algorithms arrive.

### Phase 3: Flow Fields & Scenarios (Target: 4–5 weeks)

**Note:** This phase is the largest in the project. The flow field layer system alone — layer construction, vertical connections, cross-layer Dijkstra, incremental updates — is a 1–2 week effort with testing. The original 2–3 week estimate was optimistic. Consider splitting into sub-phases if needed: **Phase 3a** (flow fields + dual congestion, ~2–3 weeks) and **Phase 3b** (scenarios + benchmarks + polish, ~2 weeks).

**Goal:** Third algorithm with full 3D layer architecture, expanded scenario library, dual congestion strategies, refined benchmarking.

- Layer-based flow field architecture (third `IPathfinder` implementation):
  - Layer construction system (scan walkable surfaces with `agentHeight` clearance, assign to layers via ±1 Y flood-fill merge, build 2D grids per layer)
  - Vertical connection graph (ladders, stairs, drop points, step-ups with directional costs)
  - Per-layer Dijkstra computation with cross-layer transitions
  - Incremental layer update on terrain change (recompute affected columns using `TerrainChangeEvent.changedVoxels`, update connection graph, re-run Dijkstra on affected layers only)
  - Flow field memory management (per-destination allocation, stale field eviction with configurable TTL)
  - **Destination-sharing threshold** (default: 2 agents) — destinations with fewer agents fall back to per-agent A* instead of computing a full flow field
  - `getPlannedPath` implementation: trace flow vectors from current position to destination, **cache result**, invalidate cache only on flow field update. Return as VoxelCoord list for smoothing and visualization
- Flow field visualization (vector overlay on voxel grid, layer boundaries highlighted, transition points marked)
- Three-algorithm comparison mode (dashboard and 3D view scale to 3 panels)
- **Dual congestion system:** flow field agents use density-based congestion (density check, wait escalation with dot-product sidestep, group scatter). Path-based agents continue using reservation. Both systems share deadlock detection (20-tick forced re-route/scatter)
- Forced scatter metric added to dashboard
- Extended path reservation: configurable reservation lookahead (3–10 ticks), priority-based reservation override, group re-route trigger (3+ agents waiting in 3-voxel radius)
- Platform/scaffold block type implementation (required for Stairwell and Construction Zone scenarios)
- Scenario library with full parameter blocks: Canyon Run, Bridge Collapse, Stairwell, Rush Hour, Swiss Cheese, Construction Zone, Free Fall
- Scenario selector on setup screen
- Custom scenario editor (place blocks, set agent spawns/destinations, save/load as JSON, record mode for scheduled terrain events)
- Headless benchmark runner: execute scenarios at 64x64x64 without rendering, 10 seeds per configuration, export per-run CSV and aggregate summary CSV with mean ± stddev
- **Diagnostic report (full):** All 8 report sections active. Algorithm Comparison Summary (section 2) with ranking table, statistical confidence, and head-to-head matrix across 3 algorithms. Plan compliance checklist updated for Phase 3 features (flow field destination-sharing threshold, dual congestion, layer merge criterion). Automatic export at end of headless benchmark runs. Report format reviewed and stabilized for ongoing use
- Agent destination re-assignment on arrival (seeded RNG, continuous navigation workload for benchmarks)
- Path smoothness metric on dashboard (average angle change between consecutive waypoints — flow fields should score well here naturally)
- Performance optimization: spatial hashing, frustum culling, LOD for distant chunks
- Visual polish: agent animations (walking, climbing, falling), block placement/removal effects

**Milestone:** Three algorithms compared across seven stress-test scenarios with statistically rigorous benchmarks. Flow field layer architecture handles multi-story structures and terrain changes. Dual congestion system handles both path-based and field-based agents. Rush Hour scenario with 24+ agents demonstrates congestion system at scale. Headless benchmarks at 64x64x64 with 10-seed averaging provide production-quality performance data.

### Phase 4: D* Lite (Target: 2–3 weeks)

**Goal:** Fourth algorithm — the dynamic pathfinding specialist.

- D* Lite implementation (fourth `IPathfinder` implementation — incremental replanning with edge cost updates, in-place repair via NavigationHandle)
- Edge invalidation on terrain change (only affected edges reprocessed)
- Repair visualization (show which nodes are reprocessed on each terrain change — should be minimal compared to A* recomputing everything)
- Four-algorithm comparison mode
- Results summary screen (post-scenario analysis with winner per metric category, including memory, with confidence intervals from 10-seed runs)
- Head-to-head benchmark: run all algorithms through all scenarios headless at 64x64x64, 10 seeds each, export per-run and aggregate CSVs
- Agent inspector updated for D* Lite (show inconsistent nodes, repair queue, edge updates, per-agent memory footprint via `getHandleMemory()`)
- Performance profiling: computation time per frame per algorithm, memory usage per frame, peak memory during mass invalidation
- Pathfinding cost breakdown chart (initial computation vs re-routing time)
- Memory budget compliance report: flag any algorithm/scenario combination where mean + 1 stddev exceeds the target budgets. Include per-agent breakdown for D* Lite showing how memory scales with path length (short/medium/long as defined in the algorithm's memory profile section)
- **Diagnostic report updated:** Plan compliance checklist extended for Phase 4 features (D* Lite chunk-scoped mode, incremental repair, edge-level TerrainChangeEvent usage). Algorithm comparison now covers 4 algorithms. D* Lite-specific anomaly checks added: verify in-place repair correctness (path after repair matches full recompute), flag cases where chunk-scoped search missed a shorter path available in full-grid mode

**Milestone:** D* Lite demonstrates its strength — minimal recomputation on terrain changes. Benchmark data with confidence intervals shows exactly which algorithm wins in which scenario, with memory costs alongside computation costs. The results summary tells you not just which algorithm is fastest but which is viable within Shovel Monster's memory budget at different path lengths.

### Phase 5: Hybrid Navigation & Export (Target: 4–5 weeks)

**Note:** The original 3–4 week estimate was optimistic. The intent broadcast system (publish/subscribe, cost elevation, expiry, cancellation, batching) is a non-trivial coordination system, and the export documentation alone could take a week if done properly.

**Goal:** Production-ready hybrid system with predictive navigation and explicit routing logic, Shovel Monster export package.

- Hybrid navigation system (fifth `IPathfinder` implementation — composes HPA*, D* Lite, and flow field sub-handles)
- Routing decision logic with explicit thresholds:
  - Distance-based algorithm selection (≤2 chunks: D* Lite direct, >2 chunks: HPA* coarse + D* Lite local)
  - Flow field promotion at 3+ agents sharing a destination within a chunk
  - Flow field demotion at 0 agents with 100-tick TTL (asymmetric hysteresis: promote at 3, demote at 0)
  - D* Lite 5 ms timeout with fallback to HPA* + Grid A*
  - Fallback retreat to last known-good position with 20-tick retry cooldown
- Local steering with obstacle avoidance (3–5 voxel lookahead)
- Intent broadcast system:
  - Agents beginning multi-tick mining actions publish target block coordinates to a shared intent registry
  - Nearby agents (configurable radius, default 16 voxels) subscribe to relevant intents. **Subscription radius check is routed through the spatial hash** to avoid O(agents) scans per mining action
  - **Intent updates are batched per tick:** all new/expired intents are collected during the tick and applied once at the end, rather than triggering cost recalculations on each individual publish/expire event. This prevents a stream of cost function mutations when multiple miners are active
  - Pending-removal blocks receive elevated traversal cost in pathfinding (not impassable, but discouraged)
  - On mining completion, standard terrain change triggers normal path invalidation
  - Intent registry cleanup: intents expire if the mining action is cancelled or the miner dies
  - Dashboard visualization: "predicted changes" overlay showing which blocks are in the intent registry and which agents are routing around them
- Predictive path invalidation: agents near active mining preemptively re-route based on intent data, spreading re-computation cost over multiple ticks instead of spiking on the change tick
- Path reservation system for multi-agent deconfliction (extended from Phase 2/3 with hybrid-specific tuning — agents on flow field segments use density strategy, agents on D* Lite segments use reservation)
- Fallback behaviors (retreat to known-good position on pathfinding failure)
- Tuning interface: sliders for all hybrid parameters (reservation lookahead, wait threshold, re-route cooldown, congestion radius, intent subscription radius, pending-removal cost multiplier, intent TTL, flow field promotion threshold, flow field demotion TTL, D* Lite timeout, chunk distance threshold)
- Five-algorithm comparison mode (or selectable subset)
- Scenario: "Active Mine" (with full parameter block as defined in Scenario Definitions) — a dedicated stress test for the intent broadcast system. Added to the scenario library alongside the original seven
- Shovel Monster export documentation:
  - C# translation guide for each algorithm
  - Chunk-based voxel grid interface specification
  - `IPathfinder` and `NavigationHandle` interface specification with C# translation notes (NavigationHandle maps to a C# class, composition pattern for Hybrid handles is identical)
  - Movement rule definitions (step height, drop height, climb speed, agent height)
  - Multi-agent congestion system architecture (both reservation and density strategies, with notes on which Shovel Monster NPC types use which)
  - Intent broadcast system architecture (maps to a Unity event bus or ScriptableObject-based pub/sub)
  - Path smoothing interface and string-pulling implementation notes
  - Determinism guide: integer math patterns, seeded RNG usage, tiebreaker conventions
  - Memory budget analysis: per-algorithm memory profiles at different world sizes and path lengths, recommended configuration for Unity
  - Hybrid routing thresholds: recommended defaults and how to tune them for Shovel Monster's specific NPC workload
- Integration test suite: verify hybrid system handles all scenarios (including Active Mine) without stuck agents or deadlocks. Verify flow field promotion/demotion doesn't cause navigation glitches during transition
- **Diagnostic report (final):** All 5 algorithms in comparison. Plan compliance checklist covers all phases including hybrid thresholds (promotion at 3, demotion at 0), intent broadcast batching, spatial hash routing. New hybrid-specific anomaly checks: flow field promotion/demotion thrashing detection, intent broadcast latency (ticks between intent publish and agent re-route), D* Lite timeout fallback frequency. Final report serves as the definitive artifact for deciding which algorithm configuration to port to Shovel Monster

**Milestone:** The hybrid system handles every scenario gracefully, including predictive navigation around active work sites. The routing decision logic produces measurably better results than any single algorithm alone (verified by benchmark comparison). The intent broadcast system demonstrates measurably smoother agent behavior near mining — fewer sudden stops, fewer "walk into collapsing tunnel" events, more even computation distribution across ticks. Export documentation provides a clear blueprint for implementing the same system in Unity/C# for Shovel Monster, including memory budgets, determinism patterns, and the intent system architecture.

---

## Phase Gate Tests

Each phase has an automated test suite that verifies the implementation meets the plan before moving on. Tests are organized in `tests/phase-gates/` and run via `npm run test:phase1`, `npm run test:phase2`, etc. Each suite is cumulative — Phase 2 gates include all Phase 1 gates (ensuring nothing regressed).

The tests are designed so either you or an AI assistant (Claude) can run them and interpret the results. Claude can execute these directly via the Bash tool (`npm run test:phase1`, etc.) and read the output — all gate tests are headless logic tests that run in Vitest/Node.js with no browser or WebGL required. Each test has a descriptive name that maps back to a specific plan requirement, and failures include enough context to diagnose the issue without reading source code.

**Phase 1 implementation note:** The `test:phase1` npm script and `tests/phase-gates/phase1.test.ts` file must be set up and verified as part of Phase 1 scaffolding — not deferred. This establishes the pattern early and confirms the gate infrastructure works before the test count grows. The Phase 1 implementation is not complete until `npm run test:phase1` runs cleanly with all 28 tests passing.

### Phase 1 Gate: `tests/phase-gates/phase1.test.ts`

**World & Data Structures**
- `voxel-grid: stores and retrieves block types in 32x32x32 world` — set/get solid, air, ladder, stair at known coordinates
- `voxel-grid: organizes voxels into 8x8x8 chunks` — verify chunk boundaries, confirm voxel at (7,7,7) and (8,0,0) are in different chunks
- `voxel-grid: marks chunks dirty on block change` — place a block, confirm its chunk's dirty flag is set
- `voxel-world-view: isWalkable returns true for air-above-solid with agentHeight clearance` — test 1-tall and 2-tall agents
- `voxel-world-view: isWalkable returns false when ceiling is too low for agentHeight` — 2-tall agent under 1-block overhang
- `voxel-world-view: getNeighbors returns only 6-directional neighbors` — confirm no diagonal voxels in neighbor list
- `voxel-world-view: getNeighbors excludes unwalkable neighbors` — solid blocks, no-floor, insufficient clearance

**Movement Rules**
- `movement: agent moves in 6 directions only (±X, ±Z, vertical)` — path between two points on flat ground contains no diagonal steps
- `movement: step-up uses 4-voxel check` — verify step-up succeeds when origin+2 is air, fails when origin+2 is solid
- `movement: step-up requires solid below destination` — no stepping up to floating air
- `movement: step-down allows up to 3-block drop` — 1, 2, 3 block drops succeed; 4 block drop fails
- `movement: ladder traversal checks 2-tall clearance at each rung` — ladder under low ceiling blocks movement
- `movement: stair traversal checks clearance at destination` — stair under overhang blocked for 2-tall agent

**Gravity**
- `gravity: agent falls when ground block removed` — remove block under agent, verify agent enters Falling state
- `gravity: falling agent pauses 3 ticks on landing` — verify 3-tick delay before agent resumes Navigating
- `gravity: blocks are static — removing support does not cascade` — remove block under another solid block, verify upper block stays

**Grid A***
- `astar: finds shortest path on flat terrain` — known start/end, verify path length matches expected
- `astar: respects 2-tall agent clearance` — path avoids 1-block-high tunnels
- `astar: handles step-up with origin clearance check` — path uses step-up only when origin+2 is clear
- `astar: paths through ladders and stairs` — multi-floor path uses vertical connectors
- `astar: returns null for unreachable destination` — isolated island, no path exists
- `astar: MAX_OPEN_SET returns partial path` — set limit to 50, verify partial path returned for long route, debug info flags it as partial
- `astar: re-routes when terrain change invalidates path` — remove block on path, verify new path computed
- `astar: uses TerrainChangeEvent.changedVoxels for precise invalidation` — change a voxel NOT on the path, verify path is NOT invalidated

**IPathfinder Interface**
- `interface: requestNavigation returns NavigationHandle` — basic contract
- `interface: NavigationHandle.getNextVoxel returns sequential path voxels` — walk the handle, verify it produces the full path
- `interface: NavigationHandle.isValid returns false after path-affecting terrain change` — invalidate a voxel on the path
- `interface: NavigationHandle.isValid returns true after non-affecting terrain change` — invalidate a voxel NOT on the path
- `interface: NavigationHandle.getHandleMemory returns positive bytes` — memory reporting works
- `interface: releaseNavigation cleans up handle state` — release handle, verify getNextVoxel returns null
- `interface: sweepLeakedHandles cleans up handles for dead agents` — create handle, don't release it, sweep with agent removed from active set, verify cleanup count = 1
- `interface: getMemoryUsage returns MemoryReport without perAgentBytes` — verify MemoryReport has sharedBytes and peakBytes only

**Time-Slicing & Budget**
- `time-slicing: requestNavigation with maxComputeMs yields when exceeded` — set maxComputeMs=0.1, verify handle returns isComputing()=true, then resolves on subsequent ticks
- `budget-manager: defers re-routes when tick budget exhausted` — trigger mass invalidation, verify not all re-routes happen in one tick
- `budget-manager: prioritizes active re-routes over new requests` — queue both, verify re-routes processed first

**Error Recovery**
- `error-recovery: algorithm timeout marks handle invalid and agent Stuck` — inject a pathfinder that hangs, verify watchdog catches it
- `error-recovery: algorithm error does not crash simulation` — inject a pathfinder that throws, verify simulation continues

**Destination Invalidation**
- `destination: agent retargets when destination becomes solid` — place block at destination, verify agent gets new nearby destination
- `destination: retarget finds nearest walkable voxel` — verify retarget distance is minimal (BFS)

**Determinism**
- `determinism: same seed produces identical path` — run pathfinding twice with same seed, compare paths
- `determinism: same seed produces identical simulation state at tick N` — run full simulation twice (10 agents, 200 ticks), compare all agent positions at tick 100 and tick 200
- `determinism: agents processed in ascending agentId order` — instrument tick processing, verify order

**Seeded World Generation**
- `worldgen: same seed produces identical terrain` — generate twice, compare every voxel
- `worldgen: generated world contains hills, cave, and stairwell` — verify terrain features exist (non-flat Y values, enclosed air pockets, vertical connectors)

### Phase 2 Gate: `tests/phase-gates/phase2.test.ts`

*Includes all Phase 1 gates (imported and re-run).*

**HPA***
- `hpastar: finds path across multiple chunks` — start and end in different chunks, verify valid path
- `hpastar: path is valid (every step is walkable with clearance)` — walk the path, verify every voxel
- `hpastar: coarse graph updates when chunk terrain changes` — modify block, verify boundary connections updated
- `hpastar: only recomputes affected chunk on local change` — change one chunk, verify other chunks' paths unaffected
- `hpastar: handles 2-tall clearance at chunk boundaries` — agent can't cross boundary under low overhang
- `hpastar: chunk boundary entry/exit points are correct` — verify boundary voxels are walkable with clearance

**Side-by-Side Consistency**
- `mirroring: terrain change applied to both algorithm sandboxes` — mine a block, verify both A* and HPA* worlds reflect it
- `mirroring: scheduled terrain event fires at correct tick in both` — run Canyon Run, verify block removal tick matches in both

**Path Reservation**
- `reservation: agent reserves next 3 ticks of planned positions` — compute path, verify reservations exist for next 3 voxels
- `reservation: other agents avoid reserved voxels` — agent B's path routes around agent A's reservations
- `reservation: reservations cancelled on re-route` — invalidate agent's path, verify old reservations removed
- `reservation: reservations cancelled on agent arrival` — agent reaches destination, verify reservations cleared
- `reservation: reservations cancelled on agent death` — remove agent, verify reservations cleared
- `reservation: stale tick reservations garbage collected` — advance simulation 30 ticks, verify past-tick entries removed
- `reservation: priority system — higher priority agent keeps reservation` — carrying agent vs idle agent at same voxel

**Wait & Re-route**
- `congestion: agent waits up to 5 ticks before re-routing` — block agent's path with another agent, verify wait count
- `congestion: agent re-routes after 5-tick wait` — verify re-route triggered at tick 5
- `congestion: deadlock safety valve fires at 20 ticks` — create permanent blockage, verify forced re-route/scatter at tick 20

**Agent State Machine**
- `state: agent transitions through Idle → Navigating → arrived → Idle` — full lifecycle
- `state: agent enters Re-routing when path invalidated` — mine block on path
- `state: agent enters Waiting when path blocked by another agent` — two agents in narrow corridor
- `state: agent enters Falling when ground removed` — mine block under agent
- `state: agent enters Stuck when no path exists` — isolate agent on island

**Path Smoothing**
- `smoother: string-pulling removes unnecessary waypoints on flat terrain` — path A→B→C where A→C is clear, verify B removed
- `smoother: string-pulling preserves waypoints at elevation changes` — vertical segments stay grid-aligned
- `smoother: smoothed path respects 2-tall clearance` — smoothed shortcut under overhang rejected
- `smoother: SmoothedWaypoint includes movement type` — walk, climb, drop correctly tagged

**TerrainChangeEvent Propagation**
- `event: terrain change produces event with both chunkCoords and changedVoxels` — mine a block, verify event contents
- `event: event includes correct changeType (remove vs add)` — mine = remove, place = add
- `event: event includes correct tick number` — verify tick matches simulation state

**Handle Leak Sweep (integration)**
- `sweep: simulation engine calls sweepLeakedHandles periodically` — run 150 ticks, verify sweep was called
- `sweep: leaked handles from killed agents are cleaned up` — kill agent without releasing handle, verify next sweep catches it

**Scenario Smoke Tests**
- `scenario-canyon-run: all agents reach destinations or re-route (no permanent Stuck)` — run Canyon Run 400 ticks, verify zero Stuck agents at end
- `scenario-bridge-collapse: agents find alternate route after collapse` — run Bridge Collapse, verify agents eventually reach destinations via ground level

### Phase 3 Gate: `tests/phase-gates/phase3.test.ts`

*Includes all Phase 1 + Phase 2 gates.*

**Flow Field Layers**
- `layers: flat terrain produces single layer` — flat world, verify one layer
- `layers: multi-story building produces one layer per floor` — 3-floor structure, verify 3 layers
- `layers: gradual slope merges into single layer (±1 Y flood-fill)` — hillside, verify one layer spanning multiple Y values
- `layers: ladder connects two layers bidirectionally` — verify connection exists with correct cost
- `layers: stair connects adjacent layers` — verify connection with stair speed penalty
- `layers: drop point creates unidirectional connection (down only)` — verify one-way link
- `layers: step-up creates bidirectional connection` — verify both directions
- `layers: layer reconstruction on terrain change updates correctly` — remove a block, verify affected layer updated
- `layers: agentHeight clearance applied during layer construction` — 1-block ceiling means no layer for 2-tall agent

**Flow Field Pathfinding**
- `flowfield: agents following same destination share one flow field` — 3 agents, 1 destination, verify 1 flow field in sharedBytes
- `flowfield: destination-sharing threshold falls back to A* for unique destinations` — 1 agent to unique destination, verify no full flow field computed
- `flowfield: flow vectors point toward destination` — sample several voxels, verify vector direction is reasonable
- `flowfield: getPlannedPath returns valid traced path` — trace from start, verify it reaches destination
- `flowfield: getPlannedPath caches result` — call twice without flow field change, verify same object returned (or fast return)
- `flowfield: getPlannedPath cache invalidated on flow field update` — change terrain, verify new trace
- `flowfield: incremental update only recomputes affected layers` — change one block, verify unaffected layers unchanged
- `flowfield: stale flow field evicted after TTL with no agents` — remove all agents from destination, advance TTL ticks, verify field evicted

**Dual Congestion**
- `congestion: flow field agents use density check (not reservation)` — flow field agent checks occupancy, not reservation table
- `congestion: flow field agent sidesteps after 5-tick wait (dot product > 0.5)` — blocked agent finds alternative voxel
- `congestion: path-based agents still use reservation` — A* agent with flow field agent in same sim, verify correct strategy per agent
- `congestion: group scatter triggers at 3+ waiting agents in 3-voxel radius` — create cluster, verify scatter

**Platform Block**
- `platform: platform block is walkable` — agent can stand on platform
- `platform: platform block has lower durability than solid` — verify block type metadata

**Scenario Suite**
- `scenario-stairwell: agents navigate between floors using ladders and stairs` — verify multi-floor paths
- `scenario-rush-hour: 24 agents complete without deadlock` — run Rush Hour, verify zero deadlocks, all agents eventually arrive
- `scenario-swiss-cheese: continuous terrain changes don't crash any algorithm` — run Swiss Cheese, verify zero algorithm errors
- `scenario-construction-zone: agents discover gap in growing wall` — verify agents find the gap and reach destinations
- `scenario-free-fall: agents recover from platform removal` — verify falling + re-pathing works

**Headless Benchmark**
- `benchmark: 10-seed run produces aggregate CSV with mean ± stddev` — run benchmark, verify CSV format and row count
- `benchmark: confidence intervals computed correctly` — verify mean ± stddev calculation against known data

**Diagnostic Report**
- `diagnostic: report export produces valid Markdown with all 8 sections` — generate report, verify section headers present
- `diagnostic: algorithm comparison table ranks all active algorithms` — verify ranking table has correct algorithm count
- `diagnostic: plan compliance checklist includes Phase 3 checks` — verify flow field and dual congestion checks present

### Phase 4 Gate: `tests/phase-gates/phase4.test.ts`

*Includes all Phase 1 + 2 + 3 gates.*

**D* Lite Core**
- `dstarlite: finds shortest path (matches A* result on same world)` — compare D* Lite path to A* path, verify same length
- `dstarlite: chunk-scoped by default (search stays within 3x3x3 neighborhood)` — verify no nodes explored outside scope
- `dstarlite: full-grid mode explores beyond chunk scope` — enable fullGrid, verify wider search
- `dstarlite: incremental repair after block removal produces valid path` — remove block on path, verify repaired path is valid
- `dstarlite: incremental repair after block addition produces valid path` — add block on path, verify repaired path is valid
- `dstarlite: repair uses changedVoxels (not chunk re-scan)` — instrument invalidateRegion, verify changedVoxels accessed
- `dstarlite: repaired path matches full recompute result` — repair path, then recompute from scratch, verify same path length
- `dstarlite: isValid always returns true (in-place repair)` — after terrain change, verify isValid() still true
- `dstarlite: per-agent memory within 256 KB for chunk-scoped short/medium paths` — verify getHandleMemory() ≤ 262144

**Memory Budget Compliance**
- `memory: per-agent budget (256 KB) met for A*, HPA*, chunk-scoped D* Lite` — run scenario, verify all handles ≤ 256 KB
- `memory: shared budget (20 MB) met for each algorithm` — verify sharedBytes ≤ 20 MB
- `memory: peak budget (50 MB) met during mass invalidation` — trigger collapse, verify peakBytes ≤ 50 MB
- `memory: D* Lite full-grid mode exceeds per-agent budget (expected)` — document the overshoot, verify it's flagged in diagnostic report

**4-Algorithm Comparison**
- `comparison: all 4 algorithms produce valid paths for same start/end` — verify all reach destination
- `comparison: all 4 algorithms handle terrain change without crashing` — mine block during navigation for each
- `comparison: benchmark CSV includes all 4 algorithms` — verify CSV rows

**D* Lite Diagnostic Checks**
- `diagnostic: D* Lite repair correctness check present in report` — verify report includes repair-vs-recompute comparison
- `diagnostic: chunk-scope miss detection present in report` — verify report flags cases where full-grid found shorter path

### Phase 5 Gate: `tests/phase-gates/phase5.test.ts`

*Includes all Phase 1 + 2 + 3 + 4 gates.*

**Hybrid Routing**
- `hybrid: uses D* Lite for short paths (≤2 chunks)` — verify sub-handle type for nearby destination
- `hybrid: uses HPA* + D* Lite for long paths (>2 chunks)` — verify coarse route + local handle
- `hybrid: flow field promotion at 3+ agents sharing destination in chunk` — add 3 agents to same destination, verify flow field created
- `hybrid: flow field demotion at 0 agents with TTL` — remove all agents, verify flow field persists for TTL then evicts
- `hybrid: no demotion at 1-2 agents (hysteresis)` — drop to 1 agent, verify flow field stays active
- `hybrid: D* Lite 5ms timeout falls back to HPA* + A*` — inject slow D* Lite (mock), verify fallback triggered
- `hybrid: fallback retreat to last known-good position` — all pathfinding fails, verify agent retreats
- `hybrid: sub-handle transition is seamless (no stuck frames)` — agent crosses chunk boundary, verify continuous movement

**Intent Broadcast**
- `intent: mining agent publishes intent to registry` — start mining action, verify intent appears
- `intent: nearby agents receive intent (within 16-voxel radius)` — verify subscription triggers
- `intent: distant agents do not receive intent (beyond radius)` — agent at 20 voxels, verify no subscription
- `intent: subscription radius uses spatial hash (not O(n) scan)` — instrument spatial hash, verify it's queried
- `intent: intents are batched per tick (no mid-tick cost recalcs)` — publish 3 intents in one tick, verify single batch application
- `intent: pending-removal blocks have elevated traversal cost` — verify pathfinder treats intent-targeted blocks as more expensive
- `intent: intent expires when mining cancelled or miner dies` — cancel action, verify intent removed
- `intent: agents pre-emptively re-route around pending removals` — agent's current path goes through intent block, verify re-route before block actually removed

**Congestion (Hybrid)**
- `hybrid-congestion: agents on flow field segments use density strategy` — promoted agent uses density, not reservation
- `hybrid-congestion: agents on D* Lite segments use reservation strategy` — D* Lite agent uses reservation table
- `hybrid-congestion: strategy switches correctly on promotion/demotion` — promote agent, verify switch to density; demote, verify switch back

**Active Mine Scenario**
- `scenario-active-mine: transit agents avoid active mining areas` — verify paths route around miners
- `scenario-active-mine: zero stuck agents at completion` — run full scenario
- `scenario-active-mine: intent system reduces sudden-stop events vs no-intent baseline` — run with and without intents, verify fewer re-routes on block-removal ticks with intents enabled

**5-Algorithm Comparison**
- `comparison: hybrid outperforms individual algorithms on mixed scenarios` — run benchmark, verify hybrid wins on composite score
- `comparison: all 5 algorithms complete all scenarios without crashes` — full matrix run
- `comparison: benchmark CSV includes all 5 algorithms across all 8 scenarios` — verify completeness

**Diagnostic Report (Final)**
- `diagnostic: report includes all 5 algorithms` — verify comparison table
- `diagnostic: hybrid-specific checks present` — promotion/demotion thrashing, intent latency, timeout fallback frequency
- `diagnostic: plan compliance checklist covers all phases` — verify all checklist items present (Phase 1 through 5)
- `diagnostic: report is self-contained Markdown (no broken references)` — parse report, verify all sections render

**Integration**
- `integration: hybrid handles all 8 scenarios without stuck agents or deadlocks` — full scenario sweep
- `integration: flow field promotion/demotion mid-navigation causes no glitches` — agent mid-path during transition, verify continuous movement
- `integration: 20-agent stress test at 64x64x64 stays within 50 MB peak memory` — run headless, verify peak

### Running the Gates

```
# Run a specific phase gate
npm run test:phase1
npm run test:phase2
npm run test:phase3
npm run test:phase4
npm run test:phase5

# Run all gates up to current phase (cumulative)
npm run test:gates

# Run gates with verbose output (for AI review)
npm run test:gates -- --verbose 2>&1 | tee gate-results.txt
```

Each gate outputs a summary table:

```
Phase 1 Gate: 28/28 passed ✓
Phase 2 Gate: 24/24 passed ✓ (52 total)
Phase 3 Gate: 19/22 passed ✗
  FAIL: flowfield: stale flow field evicted after TTL with no agents
  FAIL: scenario-rush-hour: 24 agents complete without deadlock
  FAIL: diagnostic: algorithm comparison table ranks all active algorithms
```

The verbose output includes enough context per failure (expected vs actual, agent states, tick numbers) that you can paste it directly to Claude for diagnosis.

---

## File Structure (Planned)

```
voxel-pathfinding/
|-- src/
|   |-- world/
|   |   |-- voxel-grid.ts          # Voxel data structure, chunk storage
|   |   |-- chunk.ts               # 8x8x8 chunk with dirty flagging
|   |   |-- block-types.ts         # Solid, air, ladder, stair, platform
|   |   |-- terrain-generator.ts   # Seeded world generation
|   |   |-- terrain-events.ts      # Scheduled/random terrain changes
|   |   +-- gravity.ts             # Agent gravity and falling logic
|   |-- pathfinding/
|   |   |-- pathfinder-interface.ts # IPathfinder, NavigationHandle, MemoryReport, TerrainChangeEvent interfaces
|   |   |-- voxel-world-view.ts    # VoxelWorldView interface for pathfinder-world decoupling
|   |   |-- budget-manager.ts      # PathfindingBudgetManager — per-tick time allocation and re-route queue
|   |   |-- grid-astar.ts          # Standard A* on voxel grid
|   |   |-- hpa-star.ts            # Hierarchical pathfinding
|   |   |-- flow-field.ts          # Flow field computation and queries
|   |   |-- flow-field-layers.ts   # Layer construction, vertical connections, per-layer grids
|   |   |-- d-star-lite.ts         # Incremental replanning (Phase 4)
|   |   |-- hybrid.ts              # Combined approach with routing logic (Phase 5)
|   |   |-- movement-rules.ts      # Walk, climb, drop, jump definitions + agentHeight config
|   |   |-- path-smoother.ts       # IPathSmoother interface, string-pulling implementation
|   |   |-- path-reservation.ts    # Multi-agent path booking (path-based congestion)
|   |   |-- density-congestion.ts  # Spatial density checks (flow field congestion)
|   |   +-- intent-registry.ts     # Predictive terrain change broadcasts (Phase 5)
|   |-- agents/
|   |   |-- agent.ts               # Agent entity, state machine, integer position + progress
|   |   |-- agent-manager.ts       # Spawn, assign destinations, update all
|   |   +-- congestion.ts          # Congestion detection, priority, deadlock safety valve
|   |-- simulation/
|   |   |-- simulation-engine.ts   # Core tick loop (20 TPS), event scheduling, deterministic RNG
|   |   |-- scenarios.ts           # Pre-built scenario definitions with parameter blocks
|   |   |-- benchmark-runner.ts    # Headless 64x64x64 benchmark, 10-seed runs, CSV export
|   |   +-- diagnostic-report.ts   # Diagnostic report generator — collects metrics, anomalies, compliance checks, exports Markdown
|   |-- views/
|   |   |-- MetricsDashboard.tsx   # Default analytics view
|   |   |-- SandboxView.tsx        # Three.js 3D voxel rendering
|   |   |-- AgentInspector.tsx     # Click-agent debug overlay (delegates to getDebugInfo)
|   |   |-- ScenarioSelector.tsx   # Pre-built and custom scenario picker
|   |   |-- ScenarioEditor.tsx     # Custom scenario block editor with record mode
|   |   |-- ResultsSummary.tsx     # Post-scenario analysis with confidence intervals
|   |   |-- DiagnosticExport.tsx   # "Export Diagnostic Report" button + generation progress
|   |   +-- TerrainEditPanel.tsx   # Coordinate-based terrain editing for dashboard view
|   |-- components/
|   |   |-- TopBar.tsx             # Sim controls, speed, time display
|   |   |-- KPICard.tsx            # Headline stat cards per algorithm
|   |   |-- CompareTable.tsx       # Quick-compare stats table
|   |   |-- ViewToggle.tsx         # Switch between dashboard and 3D
|   |   |-- AlgorithmSelector.tsx  # Choose which algorithms to compare
|   |   +-- TuningPanel.tsx        # Hybrid parameter sliders (Phase 5)
|   |-- rendering/
|   |   |-- voxel-renderer.ts      # Three.js instanced mesh rendering
|   |   |-- path-renderer.ts       # Path line visualization (raw + smoothed)
|   |   |-- flow-field-renderer.ts # Vector overlay visualization
|   |   |-- layer-renderer.ts      # Flow field layer boundary visualization
|   |   |-- intent-renderer.ts     # Predicted terrain change overlay (Phase 5)
|   |   |-- agent-renderer.ts      # Agent mesh and animation (2-tall model)
|   |   +-- camera-controller.ts   # Orbit, pan, zoom controls
|   |-- store/
|   |   +-- simulation-store.ts    # Zustand store for sim state
|   |-- utils/
|   |   |-- priority-queue.ts      # Binary heap for A*/D*
|   |   |-- spatial-hash.ts        # Spatial partitioning for agents
|   |   |-- seed.ts                # Deterministic xoshiro128 PRNG
|   |   |-- chunk-utils.ts         # Chunk coordinate math
|   |   +-- memory-tracker.ts      # Per-algorithm memory accounting via MemoryReport
|   |-- App.tsx
|   +-- main.tsx
|-- tests/
|   |-- grid-astar.test.ts
|   |-- hpa-star.test.ts
|   |-- flow-field.test.ts
|   |-- flow-field-layers.test.ts
|   |-- d-star-lite.test.ts
|   |-- movement-rules.test.ts    # Includes 2-tall clearance tests
|   |-- gravity.test.ts
|   |-- congestion.test.ts        # Both reservation and density strategies
|   |-- path-smoother.test.ts
|   |-- intent-registry.test.ts
|   |-- determinism.test.ts       # Same seed produces identical simulation across runs
|   |-- phase-gates/
|   |   |-- phase1.test.ts         # Phase 1 gate: world, A*, movement, determinism, budget, error recovery
|   |   |-- phase2.test.ts         # Phase 2 gate: HPA*, reservation, congestion, smoothing, scenarios
|   |   |-- phase3.test.ts         # Phase 3 gate: flow fields, layers, dual congestion, benchmarks
|   |   |-- phase4.test.ts         # Phase 4 gate: D* Lite, memory compliance, 4-algo comparison
|   |   +-- phase5.test.ts         # Phase 5 gate: hybrid, intents, 5-algo comparison, integration
|   +-- benchmarks/
|       +-- scenario-benchmark.ts   # 10-seed automated comparison at 64x64x64
|-- index.html
|-- package.json
|-- tsconfig.json
|-- vitest.config.ts
+-- vite.config.ts
```

---

## Shovel Monster Export Notes

The following systems should be built with Unity/C# portability as a primary concern:

- **Pathfinder Interface:** The `IPathfinder` and `NavigationHandle` interfaces map directly to C# interfaces. The `TerrainChangeEvent` struct (chunk + voxel granularity, change type) maps to a C# struct. The `NavigationHandle` pattern works identically in C# — each algorithm returns a concrete handle class implementing the shared interface, including the `isComputing()` state for time-sliced requests. The `PathfindingBudgetManager` maps to a per-frame time budget checked via `Stopwatch`. The Hybrid's composition of sub-handles is the same pattern. Avoid TypeScript union types at the interface boundary
- **Path Smoother Interface:** The `IPathSmoother` interface (smooth raw path, validate smoothed segment) maps directly to C#. The string-pulling implementation uses only grid math and raycasting — no browser-specific APIs. In Unity, the walkability ray replaces `Physics.Linecast` with a voxel-native linecast. The `agentHeight` parameter ensures correct clearance in both environments
- **Voxel Grid:** The chunk-based storage pattern (Dictionary<ChunkCoord, Chunk>) is identical in C#. Unity's NativeArray could replace typed arrays for performance
- **A* / D* Lite:** Priority queue operations and graph search are language-agnostic. C# `SortedSet` or custom binary heap replaces JS implementation. D* Lite's search state maps to C# dictionaries and a binary heap — no structural changes needed
- **HPA*:** Chunk boundary graph is the same structure. Unity's Job System could parallelize chunk boundary recomputation across threads
- **Flow Fields:** Per-layer computation maps well to Unity's Burst compiler for SIMD optimization. Store flow vectors in NativeArray for cache-friendly access. The layer construction and vertical connection graph are the most complex pieces to port — document the layer assignment algorithm thoroughly
- **Movement Rules:** Step height, drop height, climb speed, agent height — these become ScriptableObject configurations in Unity. The 2-tall default maps to Unity's standard humanoid NPC
- **Path Reservation:** The reservation table (Dictionary<tick, HashSet<VoxelCoord>>) is identical in C#. The reservation lifecycle (create/cancel/expire/GC) maps directly — ensure `releaseNavigation` cancels all associated reservations in both implementations
- **Density Congestion:** The flow field congestion strategy (density check, dot-product sidestep) uses only vector math and grid queries — no browser-specific APIs. Maps directly to C# Vector3 operations
- **Congestion System:** Agent priority and wait/re-route logic transfers directly. The dual strategy (reservation for path-based, density for flow field) maps cleanly — Shovel Monster NPCs using the Hybrid system will use whichever strategy matches their current navigation segment
- **Intent Registry:** Maps to a Unity event bus or ScriptableObject-based pub/sub system. The core pattern (publish pending action → nearby subscribers adjust costs → action completes → standard invalidation) is language-agnostic. In Unity, the subscription radius check can use the existing spatial partitioning system
- **Determinism:** The integer-math simulation approach (integer voxel coordinates, tick-based progress counters, deterministic PRNG, deterministic tiebreakers, agents processed in ascending ID order) transfers directly to C#. Unity's `int`/`long` types are deterministic across platforms. This enables reproducible Shovel Monster simulations for debugging and testing
- **Memory Tracking:** The per-algorithm memory accounting approach (via `MemoryReport`) should be replicated in Unity using `Profiler.GetTotalAllocatedMemoryLong()` and custom counters. Export documentation includes target budgets per algorithm at different world sizes and path lengths

The key architectural decision for Shovel Monster: **replace NavMesh entirely** with the chunk-based voxel pathfinder. The voxel grid IS the navigation data. When a block is mined, mark the chunk dirty and let the pathfinding system handle invalidation — no NavMesh rebuild needed.

---

## Open Questions & Future Ideas

- **Async pathfinding:** Compute paths on a Web Worker (browser) or Job System thread (Unity) to avoid frame hitches. The `NavigationHandle` pattern is well-suited to this — `requestNavigation` could return a handle immediately that transitions from "computing" to "ready" state when the worker completes
- **Elevation cost:** Make uphill movement more expensive than downhill to create natural-feeling paths
- **Danger zones:** Mark regions near active mining as higher cost so agents prefer safer routes (partially addressed by the intent system, but could be expanded to a general "cost painting" system)
- **Dynamic obstacles:** Moving entities (minecarts, other NPCs) as temporary path blockers
- **Navigation mesh hybrid:** Use voxel pathfinding for dynamic areas and pre-computed navmesh for static areas (buildings, roads) — best of both worlds
- **Advanced path smoothing:** Bezier curve fitting or catmull-rom splines for even smoother agent movement, beyond string-pulling. Would need to verify that smoothed paths don't clip through voxel geometry with `agentHeight` clearance
- **Variable agent sizes:** Support 1×1×1, 1×2×1, and 2×2×2 agents (small creatures, humanoids, large monsters). The `agentHeight` parameter in the interface already supports this; the main work is ensuring all algorithms generate correct clearance-aware neighbor sets for non-standard sizes

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-16 | 1.0 | Initial project plan. Five pathfinding algorithms across five development phases. True 3D voxel navigation with mining, building, gravity, multi-agent congestion, and vertical movement. Side-by-side comparison approach. Seven pre-built stress-test scenarios. Shovel Monster export notes. |
| 2026-03-16 | 2.0 | Added dual world sizes: 32x32x32 interactive / 64x64x64+ headless benchmarks. Added full Path Smoothing section with IPathSmoother interface, string-pulling algorithm, 3D constraints, and phased integration (stub in Phase 1, implement in Phase 2, track as metric in Phase 3+). Expanded Flow Field 3D layer architecture: layer definition, layer construction, vertical connection types with directional costs, per-layer Dijkstra with cross-layer transitions, incremental layer updates on terrain change, memory management with stale field eviction. Added memory profiles to each algorithm description. Added Memory Budget section with dashboard metrics, per-agent and shared data targets, peak invalidation budget, and compliance reporting. Moved basic congestion handling (path reservation, wait-before-reroute, priority system) from Phase 3 to Phase 2 to debug against well-understood algorithms first. Added congestion metrics to Phase 2 dashboard. Expanded Phase 5 predictive navigation: full intent broadcast system specification (publish, subscribe, cost elevation, expiry, cancellation cleanup), Active Mine scenario, dashboard predicted-changes overlay, tuning parameters. Specified terrain editing behavior across views (mouse interaction in sandbox, coordinate panel in dashboard, mirrored changes in both). Added headless benchmark runner to Phase 3 with CSV export. Added memory budget compliance report to Phase 4 results. Added new files to file structure: flow-field-layers.ts, path-smoother.ts, intent-registry.ts, benchmark-runner.ts, TerrainEditPanel.tsx, TuningPanel.tsx, layer-renderer.ts, intent-renderer.ts, memory-tracker.ts, and corresponding test files. Updated Shovel Monster export notes with path smoother, intent registry, flow field layer porting notes, and memory tracking guidance. Moved path smoothing from Open Questions to addressed-in-plan. Added advanced path smoothing (Bezier/catmull-rom) to Open Questions as future work beyond string-pulling. |
| 2026-03-16 | 2.1 | Added IPathfinder and NavigationHandle formal interface definitions with method signatures, return types, and per-algorithm implementation notes. NavigationHandle pattern unifies path-based and flow-field navigation models. Added agent height specification (1×2×1 default, configurable) with clearance implications for all systems: pathfinding neighbor generation, step-up, ladders, stairs, string-pulling, terrain change invalidation (headroom violations). Added agentHeight parameter to requestNavigation, IPathSmoother, and walkability ray. Added Simulation Tick Rate section (20 TPS at 1x, with concrete timing for all wait/cooldown parameters). Added Simulation Determinism section (integer simulation math, tick-based progress counters, xoshiro128 PRNG, deterministic tiebreakers, Chrome/V8 scope). Added dual congestion strategy: path reservation for path-based algorithms, spatial density with dot-product sidestep for flow field agents. Added forced scatter safety valve and metric. Resolved congestion/flow-field incompatibility. Added full Scenario Definitions section with numeric parameter blocks for all 8 scenarios (Canyon Run, Bridge Collapse, Stairwell, Rush Hour, Swiss Cheese, Construction Zone, Free Fall, Active Mine) including terrain dimensions, agent counts, spawn positions, destruction rates, duration, and scaling rules for different world sizes. Added Benchmark Methodology section: 10-seed statistical protocol with mean ± stddev, confidence interval significance test, agent destination re-assignment strategy, unreachable destination handling, CSV export format specification. Added Hybrid routing decision logic with explicit thresholds: chunk distance check, D* Lite direct for ≤2 chunks, HPA* + D* Lite for long distance, flow field promotion at 3+ agents per destination per chunk, demotion at <2 agents with 100-tick TTL, D* Lite 5ms timeout fallback, retreat-and-retry at 20 ticks. Added platform/scaffold block to Phase 3 (required for Stairwell and Construction Zone). Parameterized D* Lite memory estimate by search frontier size rather than grid size (short/medium/long/worst case). Added density-congestion.ts and determinism.test.ts to file structure. Updated all algorithm descriptions with agentHeight-aware clearance checks. Updated Shovel Monster export notes with NavigationHandle, density congestion, determinism, and variable agent size notes. Added variable agent sizes to Open Questions. |
| 2026-03-16 | 3.0 | **Review incorporation release.** Integrated recommendations from two independent plan reviews. **Interface changes:** Replaced `invalidateRegion(ChunkCoord[])` with `invalidateRegion(TerrainChangeEvent)` providing both chunk-level and voxel-level granularity plus change type and tick — algorithms that need precision (D* Lite) use `changedVoxels` directly without re-scanning chunks. Added `maxComputeMs` time-slicing parameter to `requestNavigation` — pathfinders yield and return "computing" handles when budget exceeded, preventing frame hitches. Added `isComputing()` to NavigationHandle. Added `sweepLeakedHandles()` to IPathfinder for GC of unreleased handles. Removed `perAgentBytes` from `MemoryReport` — per-agent memory accessed exclusively via `NavigationHandle.getHandleMemory()` to avoid dual-source consistency problems. **Movement model:** Restricted to 6-directional movement (cardinal + vertical transitions); diagonal grid movement removed — swept-volume clearance for 2-tall agents at corners was too complex for minimal gain; string-pulling smoother handles diagonal shortcuts instead. Step-up now requires 4-voxel check including origin headroom (origin+2 must be air). **Determinism:** Tightened cross-engine determinism claim — all game-critical integer math is engine-independent, V8-only caveat removed. Added explicit agent processing order (ascending agentId). Phase 1 determinism test expanded to verify simulation state at tick N, not just path equality. **New systems:** Added `PathfindingBudgetManager` (15 ms per-tick budget, priority-based allocation, re-route queue for mass invalidation). Added `VoxelWorldView` interface for pathfinder-world decoupling and testability. Added per-computation error recovery with watchdog timeout and graceful degradation. Added `TerrainChangeEvent` type. **Algorithm changes:** D* Lite is now chunk-scoped by default (3×3×3 chunk neighborhood); full-grid mode opt-in for benchmarking only. Grid A* has `MAX_OPEN_SET` node limit (10,000) with partial-path fallback. Flow fields have destination-sharing threshold (default 2 agents) — unique destinations fall back to per-agent A* to prevent destination explosion. Flow field `getPlannedPath` caches traced paths, invalidating only on flow field update. Flow field layer merge criterion specified: flood-fill with ±1 Y tolerance. **Hybrid changes:** Flow field demotion threshold changed from <2 to 0 agents (asymmetric hysteresis: promote at 3, demote at 0) to prevent thrashing. Intent broadcast updates batched per tick and subscription radius routed through spatial hash. **Congestion:** Path reservation data structure specified (`Map<tick, Set<VoxelCoord>>`), full reservation lifecycle documented (create/cancel/expire/GC), cancellation on re-route/arrival/death prevents ghost-blocking. **Gravity:** Clarified blocks are static — only agents affected by gravity, no cascading block physics. **Agent state:** Added destination invalidation handling — auto-retarget to nearest walkable voxel when destination becomes solid. **Timelines:** Phase 3 extended to 4–5 weeks with sub-phase split option (3a: flow fields + congestion, 3b: scenarios + benchmarks). Phase 5 extended to 4–5 weeks. **Document structure:** Added Quick Start summary at top. Added `voxel-world-view.ts` and `budget-manager.ts` to file structure. **Quick Start section** added as 1-page overview for implementors. |
| 2026-03-16 | 3.0.1 | **Diagnostic report export.** Added full Diagnostic Report Export section to Benchmark Methodology with 8-section report structure: (1) Run Configuration, (2) Algorithm Comparison Summary with ranking table, statistical confidence, and head-to-head matrix, (3) Performance Analysis with per-tick timing, budget overrun log, re-route spike analysis, memory timeline, and budget compliance, (4) Bug Detection / Anomaly Log covering stuck agents, algorithm errors, determinism violations, pathfinding failures, reservation ghosts, handle leaks, partial paths, and destination invalidation events, (5) Plan Compliance Checklist with automated PASS/FAIL/N/A checks against plan specifications, (6) Agent Behavior Summary with throughput, state distribution, congestion hotspots, and path quality, (7) Event Timeline (capped at 500 entries), (8) Raw Data References. Report exported as self-contained Markdown for AI (Claude) or human review. Phased rollout: initial report in Phase 2 (sections 1, 3, 4, 5, 6, 7), full report in Phase 3 (all 8 sections with 3-algorithm comparison), extended in Phase 4 (D* Lite-specific checks), finalized in Phase 5 (hybrid-specific checks, serves as definitive Shovel Monster porting artifact). Added `diagnostic-report.ts` and `DiagnosticExport.tsx` to file structure. |
| 2026-03-16 | 3.0.2 | **Phase gate test suites.** Added Phase Gate Tests section with automated test suites for each phase. Each suite is cumulative (Phase N re-runs all Phase N-1 tests). **Phase 1 gate** (28 tests): voxel grid, VoxelWorldView, 6-directional movement, 4-voxel step-up, gravity (blocks static), Grid A* (clearance, node limit, partial path, TerrainChangeEvent precision), IPathfinder/NavigationHandle interface contract, sweepLeakedHandles, time-slicing, budget manager deferral, error recovery (watchdog, graceful degradation), destination invalidation retarget, determinism (path + state-at-tick-N + agent processing order), seeded worldgen. **Phase 2 gate** (24 tests): HPA* (multi-chunk, clearance, incremental update), side-by-side terrain mirroring, path reservation lifecycle (create/cancel on re-route/arrival/death, GC), wait/re-route/deadlock safety valve, agent state machine transitions, string-pulling smoother with clearance, TerrainChangeEvent format, handle leak sweep integration, Canyon Run and Bridge Collapse smoke tests. **Phase 3 gate** (19 tests): flow field layers (merge criterion, connections, reconstruction, clearance), flow field pathfinding (shared fields, destination-sharing threshold, caching, incremental update, TTL eviction), dual congestion (density vs reservation per algorithm type, sidestep, group scatter), platform block, 5 scenario smoke tests, headless benchmark CSV validation, diagnostic report format. **Phase 4 gate** (13 tests): D* Lite (correctness vs A*, chunk-scoped, full-grid, incremental repair, changedVoxels usage, repair-vs-recompute match, memory budget), memory compliance across algorithms, 4-algorithm comparison, diagnostic D* Lite checks. **Phase 5 gate** (21 tests): hybrid routing (distance-based selection, promotion/demotion with hysteresis, timeout fallback, retreat, seamless transitions), intent broadcast (publish/subscribe, spatial hash, batching, cost elevation, expiry, pre-emptive re-route), hybrid congestion strategy switching, Active Mine scenario, 5-algorithm comparison, final diagnostic report completeness, 20-agent stress test. Added `tests/phase-gates/` directory with 5 test files to file structure. Added npm scripts `test:phase1` through `test:phase5` and `test:gates`. |
