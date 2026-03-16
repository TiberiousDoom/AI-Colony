# Voxel Pathfinding Sandbox — Project Plan

**Version:** 2.1
**Date:** March 16, 2026

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
- Pathfinding tiebreakers use deterministic criteria (agent ID, then voxel coordinate lexicographic order), never system time or hash map iteration order
- Benchmark results are marked as "Chrome/V8" and may not reproduce identically on Firefox/SpiderMonkey or Safari/JSC. This is acceptable because the benchmarks compare algorithm-level trends (A* vs HPA* re-route cost), not absolute timings

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

- **Pathfinding neighbor generation:** A voxel is walkable only if it has a solid block below AND the voxel at that position AND the voxel one above it are both air (or non-solid). An agent can't walk under a 1-block overhang
- **Step-up:** An agent can step up 1 block if the two voxels above the destination are both air (headroom check at destination)
- **Ladders:** The agent's 2-tall hitbox must have clearance at every rung. A ladder in a 1-wide vertical shaft works; a ladder under a low ceiling doesn't
- **Stair traversal:** Moving diagonally upward requires air at both the destination voxel and the voxel above it
- **String-pulling walkability ray:** Must verify 2-tall clearance at every intermediate position, not just 1

The agent height is configurable (stored in `movement-rules.ts`) to allow experimentation with 1-tall agents (for testing, or for modeling small creatures in Shovel Monster), but the default and all scenario parameters assume height 2.

### Gravity & Physics

- Agents are affected by gravity — if the block under them is removed, they fall
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
- **State:** Idle, Navigating, Re-routing, Waiting, Falling, Stuck
- **Speed:** Voxels per tick (default 1.0, reduced on ladders to 0.5, stairs to 0.7)
- **Path Age:** How many ticks since current path was computed (for staleness detection)
- **Priority:** Determines yielding behavior in congestion (see Multi-Agent Behavior)

---

## Pathfinder Interface

The `IPathfinder` interface is the central contract that all five algorithms implement. It must accommodate fundamentally different navigation models: path-based algorithms (A*, HPA*, D* Lite) return an explicit list of waypoints, while flow fields return a movement direction at the agent's current position. The interface unifies these through a `NavigationHandle` abstraction.

### Interface Definition

```
interface IPathfinder {
  // Request navigation from start to destination.
  // Returns a NavigationHandle that the agent polls each tick.
  // May return null if no path exists.
  requestNavigation(
    start: VoxelCoord,
    destination: VoxelCoord,
    agentHeight: number,
    agentId: number
  ): NavigationHandle | null;

  // Notify the pathfinder that terrain has changed in a region.
  // The pathfinder determines which active NavigationHandles are
  // affected and marks them for re-computation.
  // chunkCoords: list of dirty chunks (not individual voxels —
  // algorithms that need voxel-level granularity can scan the chunk)
  invalidateRegion(chunkCoords: ChunkCoord[]): void;

  // Release all state for a given agent's navigation.
  // Called when agent dies, arrives, or switches destination.
  releaseNavigation(handle: NavigationHandle): void;

  // Return current memory usage in bytes for dashboard reporting.
  getMemoryUsage(): MemoryReport;
}

interface NavigationHandle {
  // Get the next voxel the agent should move toward.
  // For path-based algorithms: returns the next waypoint in the path.
  // For flow fields: evaluates the flow vector at the agent's
  // current position and returns the resulting target voxel.
  //
  // Returns null if the agent has arrived or navigation has failed.
  getNextVoxel(currentPosition: VoxelCoord): VoxelCoord | null;

  // Is this handle still valid, or does it need re-computation?
  // After invalidateRegion(), affected handles return false here.
  isValid(): boolean;

  // Get the full planned path as a voxel list for visualization
  // and smoothing. For path-based algorithms, this is the stored path.
  // For flow fields, this traces the flow vectors from the agent's
  // current position to the destination (computed on demand, not cached).
  // Returns null if the algorithm doesn't support path extraction
  // (shouldn't happen for any of our five algorithms, but the type
  // allows for it).
  getPlannedPath(currentPosition: VoxelCoord): VoxelCoord[] | null;

  // Algorithm-specific debug info for the agent inspector.
  // Returns an opaque key-value map rendered as a debug panel.
  getDebugInfo(): Record<string, string | number>;

  // Memory consumed by this specific handle's state (bytes).
  getHandleMemory(): number;
}

interface MemoryReport {
  sharedBytes: number;      // Coarse graph, flow fields, etc.
  perAgentBytes: number[];  // Indexed by agentId
  peakBytes: number;        // High-water mark since last reset
}
```

### How Each Algorithm Fits

- **Grid A*:** `requestNavigation` runs A*, stores the resulting path in the handle. `getNextVoxel` pops the next waypoint. `isValid` checks if any path voxel was in a dirty chunk. `invalidateRegion` scans active handles and marks affected ones invalid. `getHandleMemory` returns the stored path size (small — just a voxel list). No persistent shared state
- **HPA*:** `requestNavigation` queries the coarse graph then runs local A* per chunk. The handle stores the coarse route plus the current chunk's detailed path. `invalidateRegion` updates the coarse graph (shared) and invalidates handles whose coarse route passes through dirty chunks. `getHandleMemory` returns the coarse route + local path size. `sharedBytes` includes the coarse graph
- **Flow Fields:** `requestNavigation` ensures a flow field exists for the destination (computing one if needed or reusing a cached one). The handle stores a reference to the destination's flow field, not a copy. `getNextVoxel` evaluates the flow vector at the current position and returns the neighboring voxel it points to. `isValid` always returns true — flow fields self-update via `invalidateRegion`, so a handle pointing to a flow field is always current. `getPlannedPath` traces the flow vectors forward from the current position to produce a voxel list on demand (for visualization and smoothing). `getHandleMemory` returns ~0 (the handle is just a pointer; the flow field cost is in `sharedBytes`). `sharedBytes` includes all active flow fields
- **D* Lite:** `requestNavigation` runs the initial reverse search and stores the full search state in the handle. `getNextVoxel` follows the computed path. `invalidateRegion` flags affected edges in the handle's search state and triggers incremental repair. `isValid` returns true (D* Lite repairs in-place rather than invalidating). `getHandleMemory` returns the size of the rhs/g maps and priority queue — this is the expensive one. `sharedBytes` is near zero
- **Hybrid:** `requestNavigation` runs HPA* for the coarse route, then initializes D* Lite for the current chunk. If the destination is shared by multiple agents in a corridor, it creates or reuses a flow field for that segment. The handle composes sub-handles from the appropriate algorithms. `getNextVoxel` delegates to whichever sub-algorithm owns the current navigation segment. `invalidateRegion` delegates to each active sub-algorithm

### Design Rationale

The `NavigationHandle` pattern solves the core tension between path-based and field-based navigation. The agent manager doesn't care whether the handle is backed by a stored path or a flow field — it calls `getNextVoxel` each tick and gets a voxel to move toward. The `getPlannedPath` method (which flow fields compute on demand by tracing vectors) ensures the path smoother and path renderer can work uniformly across all algorithms.

The `agentHeight` parameter on `requestNavigation` ensures all clearance checks are correct for the agent's collision volume. Algorithms use this when generating neighbors (2-tall agents need 2 blocks of air).

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

Standard A* on the raw voxel grid. Every voxel is a node, neighbors are the 6 adjacent voxels (plus diagonals on the same Y level), and the heuristic is 3D Manhattan distance.

**Movement rules:**
- Can move to any adjacent air voxel that has a solid block below it and `agentHeight` blocks of air above it (walkable with clearance)
- Can step up 1 block (move to air voxel that is 1 higher if the `agentHeight` voxels above the destination are all air)
- Can step down up to 3 blocks (drop to lower walkable voxel with clearance)
- Can climb ladder voxels vertically (clearance checked at each rung)
- Can traverse stair voxels diagonally upward (clearance checked at destination)

**Re-routing strategy:** When a terrain change invalidates any voxel in the current path, discard the entire path and recompute from current position to destination.

**Characteristics:** Simple, correct, easy to debug. Weakness: recomputes the entire path on every invalidation, which is expensive on large grids. O(n log n) where n is the number of voxels explored. No spatial optimization — explores lots of irrelevant voxels.

**Memory profile:** Low baseline — only the open and closed lists during active computation. No persistent per-agent data structures between path requests. `getHandleMemory` returns just the stored path (typically < 1 KB). Peak memory during computation depends on how many nodes are explored: for a path spanning half the 64x64x64 grid, the open/closed lists might hold 10,000–30,000 nodes × ~20 bytes each = 200–600 KB temporarily. This is freed after the path is computed.

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

**Layer construction:** On world generation (and incrementally on terrain change), scan each column of voxels top-to-bottom. Each walkable surface voxel (air with solid below, plus `agentHeight` clearance above) is assigned to a layer. Adjacent walkable voxels at the same Y (or within step-up range of ±1) belong to the same layer. Layers are stored as 2D grids (X, Z) with a Y value per cell.

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

**Characteristics:** Excellent for many agents heading to the same destination (computed once, used by all). Handles terrain changes gracefully with incremental updates. Weakness: expensive to compute for many different destinations (one flow field per destination), memory-intensive (stores a vector per walkable voxel per destination per layer), and doesn't handle per-agent constraints well.

**Memory profile:** High — this is the most memory-hungry algorithm. Each active destination requires a complete flow field (one vector per walkable voxel per layer). At 64x64x64 with ~30% walkable voxels and 5 active destinations, that's roughly 5 × 78,000 × 12 bytes ≈ 4.7 MB for flow vectors alone. Memory is tracked per-destination and stale flow fields (no agents using them) are evicted after a configurable TTL. `getHandleMemory` returns ~0 (just a pointer to the shared flow field). `sharedBytes` is the dominant cost.

### Algorithm 4: D* Lite (Phase 4)

An incremental replanning algorithm specifically designed for dynamic environments. Unlike A* which recomputes from scratch, D* Lite repairs the existing search when the world changes.

**Structure:**
- Initial path computed like A* but in reverse (from destination to start)
- When terrain changes, only the affected edges in the search graph are updated
- The algorithm maintains a priority queue of inconsistent nodes and repairs the minimum necessary portion of the path

**Re-routing strategy:** This IS the re-routing strategy. D* Lite was designed for exactly this problem — a robot navigating a changing environment. When blocks are mined or placed, the affected edges are flagged, and the algorithm incrementally repairs the path without restarting the search. NavigationHandles repair in-place — `isValid` always returns true because the handle fixes itself.

**Characteristics:** The gold standard for dynamic pathfinding. Minimal re-computation on terrain changes. Paths are always optimal. Weakness: more complex to implement than A*, higher per-node memory overhead, initial computation is slightly slower than A*.

**Memory profile:** Moderate-to-high, **dominated by search frontier size, not grid size.** D* Lite maintains rhs values, g values, and the priority queue for every node explored during the initial search. The critical factor is how much of the grid the search explores, which depends on path length and obstacle density:

- **Short path** (agent to destination 10 voxels away, open terrain): search explores ~100–500 nodes. Memory: ~2–10 KB per agent
- **Medium path** (across a 64-wide map through moderate obstacles): search explores ~5,000–15,000 nodes × ~40 bytes (g, rhs, priority, parent, flags) = 200–600 KB per agent
- **Long path** (full diagonal of 64x64x64 through complex terrain): search explores ~20,000–50,000 nodes = 800 KB–2 MB per agent
- **Worst case** (destination unreachable, entire reachable grid explored): up to ~78,000 walkable nodes × 40 bytes ≈ 3 MB per agent

At 20 agents with medium-length paths, expect 4–12 MB total D* Lite state. The per-agent budget of 256 KB is realistic for typical Shovel Monster paths (NPCs navigating within a settlement or mine, not traversing the entire world). For NPCs with very long paths, consider a search horizon limit that falls back to HPA* for the coarse route.

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
- **Flow field demotion:** When the number of agents using a promoted flow field drops below 2, the flow field is scheduled for eviction (after a configurable TTL, default: 100 ticks). If new agents request the same destination before eviction, the flow field is kept. This prevents thrashing between flow fields and D* Lite
- **Fallback:** If D* Lite fails to find a path within 5 ms of computation time (configurable), the agent falls back to HPA* coarse route with Grid A* for the local segment. If all pathfinding fails, the agent enters the fallback behavior (retreat to nearest known-good position — the last voxel where a successful path existed — and retry after a cooldown of 20 ticks)

**Intelligence layer:**
- Agents predict terrain changes — if an NPC is mining ahead, nearby agents query the miner's planned block removals and preemptively invalidate paths through those voxels. This requires a lightweight "intent broadcast" system: when an agent begins a multi-tick mining action, it publishes the target block coordinates to a shared intent registry. Other agents within a configurable radius (default: 16 voxels) subscribe to these intents and treat the targeted blocks as "pending removal" in their cost calculations — not impassable yet, but with an elevated traversal cost that discourages routing through them. When the mining completes, the actual terrain change triggers standard path invalidation. The net effect is that nearby agents start re-routing before the block disappears rather than after
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

- **Path Reservation Table:** Agents register their planned positions for the next N ticks. Other agents avoid reserved voxels when computing paths. Introduced in Phase 2 with basic reservation (next 3 ticks). Extended in Phase 3 with configurable lookahead and priority-based override
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
- Grid A* pathfinding with 3D movement rules (walk, step up/down, climb, drop — all with `agentHeight` clearance checks)
- `IPathfinder` interface and `NavigationHandle` abstraction (Grid A* as first implementation)
- `IPathSmoother` interface with passthrough implementation (raw path returned unchanged, but agents consume `SmoothedWaypoint[]` from day one)
- Deterministic simulation: integer voxel coordinates, tick-based progress counters, seeded xoshiro128 PRNG, deterministic tiebreakers
- Single agent: assign destination by clicking a voxel, watch it navigate
- Path visualization (colored line through voxels, explored nodes heatmap)
- Manual terrain editing (click to remove block, shift+click to place)
- Metrics dashboard with path computation time, nodes explored, path length, memory usage
- Simulation controls (play, pause, speed 1x–8x, reset) at 20 TPS base rate
- Seeded world generation (simple terrain with hills, a cave, and a stairwell)
- Unit tests for A* correctness (including 2-tall agent clearance), movement rules, gravity, determinism (same seed = same path)

**Milestone:** One agent navigating a 3D voxel world with 2-block-tall clearance. Mine blocks and watch it re-route. Dashboard shows pathfinding performance including memory. Path smoothing and pathfinder interfaces are stubbed and ready for implementation. Simulation is deterministic and reproducible via seed.

### Phase 2: Comparison Mode (Target: 1–2 weeks)

**Goal:** Side-by-side A* vs HPA*, multiple agents with basic congestion handling, terrain change events.

- HPA* implementation (chunk boundary graph, two-level pathfinding, second `IPathfinder` implementation)
- Chunk dirty flagging and incremental boundary recomputation
- Side-by-side rendering (two Three.js canvases, mirrored terrain, different algorithms)
- Multiple agents (5–10 per sandbox) with random destination assignment from seeded RNG
- Basic congestion handling (path reservation strategy only — flow field density strategy deferred to Phase 3): path reservation table (next 3 ticks), wait-before-reroute (5 tick / 250 ms threshold), priority system (carrying > idle, agent ID tiebreaker). Introducing this now against two well-understood path-based algorithms (A* and HPA*) means congestion bugs are isolated from algorithm bugs
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
- Unit tests for HPA* boundary computation, chunk updates, path reservation correctness, 2-tall clearance at chunk boundaries

**Milestone:** A* and HPA* running side-by-side with the same terrain changes and the same congestion rules. Clear performance differences visible on the dashboard, especially during mining events. Agents move smoothly on flat ground with 2-block clearance respected. Multi-agent interactions are already debugged before more complex algorithms arrive.

### Phase 3: Flow Fields & Scenarios (Target: 2–3 weeks)

**Goal:** Third algorithm with full 3D layer architecture, expanded scenario library, dual congestion strategies, refined benchmarking.

- Layer-based flow field architecture (third `IPathfinder` implementation):
  - Layer construction system (scan walkable surfaces with `agentHeight` clearance, assign to layers, build 2D grids per layer)
  - Vertical connection graph (ladders, stairs, drop points, step-ups with directional costs)
  - Per-layer Dijkstra computation with cross-layer transitions
  - Incremental layer update on terrain change (recompute affected columns, update connection graph, re-run Dijkstra on affected layers only)
  - Flow field memory management (per-destination allocation, stale field eviction with configurable TTL)
  - `getPlannedPath` implementation: trace flow vectors from current position to destination, return as VoxelCoord list for smoothing and visualization
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

**Milestone:** D* Lite demonstrates its strength — minimal recomputation on terrain changes. Benchmark data with confidence intervals shows exactly which algorithm wins in which scenario, with memory costs alongside computation costs. The results summary tells you not just which algorithm is fastest but which is viable within Shovel Monster's memory budget at different path lengths.

### Phase 5: Hybrid Navigation & Export (Target: 3–4 weeks)

**Goal:** Production-ready hybrid system with predictive navigation and explicit routing logic, Shovel Monster export package.

- Hybrid navigation system (fifth `IPathfinder` implementation — composes HPA*, D* Lite, and flow field sub-handles)
- Routing decision logic with explicit thresholds:
  - Distance-based algorithm selection (≤2 chunks: D* Lite direct, >2 chunks: HPA* coarse + D* Lite local)
  - Flow field promotion at 3+ agents sharing a destination within a chunk
  - Flow field demotion at <2 agents with 100-tick TTL
  - D* Lite 5 ms timeout with fallback to HPA* + Grid A*
  - Fallback retreat to last known-good position with 20-tick retry cooldown
- Local steering with obstacle avoidance (3–5 voxel lookahead)
- Intent broadcast system:
  - Agents beginning multi-tick mining actions publish target block coordinates to a shared intent registry
  - Nearby agents (configurable radius, default 16 voxels) subscribe to relevant intents
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

**Milestone:** The hybrid system handles every scenario gracefully, including predictive navigation around active work sites. The routing decision logic produces measurably better results than any single algorithm alone (verified by benchmark comparison). The intent broadcast system demonstrates measurably smoother agent behavior near mining — fewer sudden stops, fewer "walk into collapsing tunnel" events, more even computation distribution across ticks. Export documentation provides a clear blueprint for implementing the same system in Unity/C# for Shovel Monster, including memory budgets, determinism patterns, and the intent system architecture.

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
|   |   |-- pathfinder-interface.ts # IPathfinder, NavigationHandle, MemoryReport interfaces
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
|   |   +-- benchmark-runner.ts    # Headless 64x64x64 benchmark, 10-seed runs, CSV export
|   |-- views/
|   |   |-- MetricsDashboard.tsx   # Default analytics view
|   |   |-- SandboxView.tsx        # Three.js 3D voxel rendering
|   |   |-- AgentInspector.tsx     # Click-agent debug overlay (delegates to getDebugInfo)
|   |   |-- ScenarioSelector.tsx   # Pre-built and custom scenario picker
|   |   |-- ScenarioEditor.tsx     # Custom scenario block editor with record mode
|   |   |-- ResultsSummary.tsx     # Post-scenario analysis with confidence intervals
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

- **Pathfinder Interface:** The `IPathfinder` and `NavigationHandle` interfaces map directly to C# interfaces. The `NavigationHandle` pattern works identically in C# — each algorithm returns a concrete handle class implementing the shared interface. The Hybrid's composition of sub-handles is the same pattern. Avoid TypeScript union types at the interface boundary
- **Path Smoother Interface:** The `IPathSmoother` interface (smooth raw path, validate smoothed segment) maps directly to C#. The string-pulling implementation uses only grid math and raycasting — no browser-specific APIs. In Unity, the walkability ray replaces `Physics.Linecast` with a voxel-native linecast. The `agentHeight` parameter ensures correct clearance in both environments
- **Voxel Grid:** The chunk-based storage pattern (Dictionary<ChunkCoord, Chunk>) is identical in C#. Unity's NativeArray could replace typed arrays for performance
- **A* / D* Lite:** Priority queue operations and graph search are language-agnostic. C# `SortedSet` or custom binary heap replaces JS implementation. D* Lite's search state maps to C# dictionaries and a binary heap — no structural changes needed
- **HPA*:** Chunk boundary graph is the same structure. Unity's Job System could parallelize chunk boundary recomputation across threads
- **Flow Fields:** Per-layer computation maps well to Unity's Burst compiler for SIMD optimization. Store flow vectors in NativeArray for cache-friendly access. The layer construction and vertical connection graph are the most complex pieces to port — document the layer assignment algorithm thoroughly
- **Movement Rules:** Step height, drop height, climb speed, agent height — these become ScriptableObject configurations in Unity. The 2-tall default maps to Unity's standard humanoid NPC
- **Path Reservation:** The reservation table (Dictionary<tick, HashSet<VoxelCoord>>) is identical in C#
- **Density Congestion:** The flow field congestion strategy (density check, dot-product sidestep) uses only vector math and grid queries — no browser-specific APIs. Maps directly to C# Vector3 operations
- **Congestion System:** Agent priority and wait/re-route logic transfers directly. The dual strategy (reservation for path-based, density for flow field) maps cleanly — Shovel Monster NPCs using the Hybrid system will use whichever strategy matches their current navigation segment
- **Intent Registry:** Maps to a Unity event bus or ScriptableObject-based pub/sub system. The core pattern (publish pending action → nearby subscribers adjust costs → action completes → standard invalidation) is language-agnostic. In Unity, the subscription radius check can use the existing spatial partitioning system
- **Determinism:** The integer-math simulation approach (integer voxel coordinates, tick-based progress counters, deterministic PRNG, deterministic tiebreakers) transfers directly to C#. Unity's `int`/`long` types are deterministic across platforms. This enables reproducible Shovel Monster simulations for debugging and testing
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
