# Voxel Pathfinding Sandbox — Plan Review

**Reviewer:** Claude
**Plan Version:** 2.1
**Date:** March 16, 2026

---

## Overall Assessment

This is an exceptionally well-thought-out plan. The level of detail — concrete tick timings, memory budgets, statistical benchmarking protocols, per-algorithm interface fit descriptions — puts it well above typical project plans. The plan reads as implementation-ready for Phase 1.

---

## Strengths

### 1. The NavigationHandle Abstraction
Unifying path-based and flow-field algorithms behind a single polling interface (`getNextVoxel`) is the right call. It avoids the common mistake of designing the interface around one navigation paradigm and then bolting others on.

### 2. Dual Congestion Strategies
Recognizing that flow field agents can't populate a reservation table and designing a density-based alternative shows genuine understanding of the algorithmic differences. Moving basic congestion to Phase 2 (against well-understood algorithms) is a smart sequencing decision.

### 3. Rigorous Benchmark Methodology
10-seed runs with confidence intervals, explicit CSV schemas, and the "difference is meaningful only if intervals don't overlap" criterion — this is how you produce data you can actually trust for Shovel Monster decisions.

### 4. Memory as a First-Class Metric
Most pathfinding prototypes ignore memory until it's too late. Tracking it per-algorithm, per-agent, and at peak invalidation from the start will produce directly actionable data for Unity porting.

### 5. 2-Tall Agent Clearance Threading
Carrying `agentHeight` through every system (neighbor generation, string-pulling, flow field layers, terrain invalidation headroom checks) is the kind of detail that prevents a class of subtle bugs that would otherwise surface late.

---

## Concerns

### 1. Phase Timeline Estimates Are Optimistic (Phases 3 and 5)

**Phase 3** asks for: full 3D layer-based flow field architecture with incremental updates, a dual congestion system, platform block type, 7 scenario implementations with parameter scaling, a headless benchmark runner with CSV export, a custom scenario editor with record mode, plus performance optimization and visual polish. At "2–3 weeks" this is aggressive even for a senior developer working full-time. The flow field layer system alone — layer construction, vertical connections, cross-layer Dijkstra, incremental updates — is a 1–2 week effort with testing. Budget 4–5 weeks for Phase 3 or split it into sub-phases (3a: flow fields + dual congestion, 3b: scenarios + benchmarks + polish).

**Phase 5** similarly packs the hybrid system, intent broadcast, tuning UI, Active Mine scenario, and full export documentation into "3–4 weeks." The intent broadcast system (publish/subscribe, cost elevation, expiry, cancellation) is a non-trivial distributed coordination system. The export documentation alone could take a week if done properly.

### 2. Flow Field Layer Construction Has Under-Specified Edge Cases

The plan says layers are connected at step-ups "where two layers differ by exactly 1 Y level and the geometry allows stepping." But what about terrain like a staircase carved into a hillside where walkable surfaces at different Y values are continuously adjacent? The layer assignment algorithm needs to handle gradual slopes where every voxel is a "step-up" from its neighbor — does this become one layer spanning many Y values, or many single-row layers?

The plan says "a hillside with gradual slope changes is a single layer that spans multiple Y values" but doesn't specify the merge criterion.

**Suggestion:** Two walkable voxels belong to the same layer if they are horizontally adjacent and their Y values differ by ≤1. This makes the layer assignment a flood-fill with a ±1 Y tolerance.

### 3. `getPlannedPath` On-Demand Trace for Flow Fields Could Be Expensive

The plan notes flow fields compute `getPlannedPath` on demand by tracing vectors forward. If the path renderer calls this every frame for every agent, and paths are long, this could be a performance issue — especially with 10+ agents on flow fields in a 64x64x64 world.

**Suggestion:** Cache the traced path per handle and invalidate it only when the flow field updates, rather than recomputing every call.

### 4. D* Lite Per-Agent Memory at Scale Is a Real Risk

The plan acknowledges this (200–600 KB per agent for medium paths, up to 3 MB for long paths), but the 256 KB per-agent budget seems like it will be routinely exceeded for anything beyond short paths. At 50 agents in Shovel Monster with medium paths, you're looking at 10–30 MB just for D* Lite state.

The plan's suggestion to "limit search horizon to current + adjacent chunks" is buried in a parenthetical — this should be a design decision, not a footnote.

**Suggestion:** Make chunk-scoped D* Lite (as used in the Hybrid) the *default* D* Lite mode, and full-grid D* Lite an opt-in for benchmarking only.

### 5. Hybrid Routing Decision Logic Has a Potential Thrashing Case

Flow field promotion happens at 3+ agents sharing a destination in a chunk. Demotion at <2 agents with 100-tick TTL. Consider: 3 agents head to the same destination, flow field is promoted. One arrives, count drops to 2. Another arrives, count drops to 1, demotion scheduled. A new agent requests the same destination — promotion again. If agents are arriving and departing at a steady rate, you could thrash between flow field and D* Lite.

The TTL helps, but consider adding hysteresis: promote at 3, demote at 0 (not 2). Or make the demotion threshold configurable separately from the promotion threshold.

### 6. No Per-Tick Pathfinding Budget

The plan specifies 20 TPS and notes "pathfinding budget per tick is tighter" at 8x speed, but never defines a concrete budget. At 20 TPS, you have 50 ms per tick. If you're rendering + simulating + pathfinding, the pathfinding budget is probably 10–15 ms per tick. What happens when a mass invalidation event (bridge collapse, explosion) triggers 10+ simultaneous re-routes that collectively exceed the frame budget?

**Suggestion:** Specify a per-tick pathfinding time budget and a strategy for spreading re-routes across ticks (e.g., a re-route queue that processes N agents per tick).

### 7. `invalidateRegion` Interface Lacks Voxel-Level Granularity

The interface takes `ChunkCoord[]` but some algorithms need voxel-level granularity. The plan acknowledges this ("algorithms that need voxel-level granularity can scan the chunk") but this means every algorithm that cares about specific voxels must re-scan the chunk on every invalidation. For D* Lite, which needs to know exactly which edges changed, this means iterating over all voxels in each dirty chunk to find the changed ones.

**Suggestion:** Pass both `ChunkCoord[]` and `VoxelCoord[]` (the specific changed voxels) to `invalidateRegion`. Algorithms that only need chunk-level granularity ignore the voxel list; algorithms that need precision use it directly.

### 8. No Error Recovery Specification for the Simulation Engine

What happens if a pathfinding algorithm throws an exception mid-computation? If the flow field Dijkstra hits an infinite loop due to a bug? The simulation engine needs a timeout/watchdog per algorithm computation and a graceful degradation path (mark the agent as Stuck, log the error, continue simulation). This is especially important for side-by-side comparison — one buggy algorithm shouldn't crash the entire simulation.

---

## Minor Suggestions

- **Scenario scaling notation:** Consider a table legend or consistent notation (e.g., `[L]` for linear, `[F]` for fixed) rather than relying on the per-row Scaling column.

- **`MemoryReport.perAgentBytes`** is indexed by `agentId` — this means the array grows with the max agent ID ever created, not the current agent count. If agents are created/destroyed, this array has holes. Consider a `Map<number, number>` instead.

- **Determinism scope:** The plan commits to "determinism within Chrome (V8)" but also says "all game-critical math uses integer arithmetic." If that's truly the case, determinism should hold across engines — integer math is deterministic everywhere. The V8 caveat only matters if floating-point sneaks in. Consider tightening the claim.

- **Custom scenario "record mode"** file format: JSON is mentioned for save/load but the schema should be defined (even loosely) so it can be implemented consistently.

- **Phase 1 determinism test** ("same seed = same path") should also test "same seed = same simulation state at tick N" across two independent runs. Path determinism is necessary but not sufficient.

---

## Architecture Suggestions

### 1. Add Pathfinding Time-Slicing Early (Phase 1 or 2)

Define a `maxComputeMs` parameter on `requestNavigation`. If the pathfinder exceeds this budget, it yields and returns a "computing" handle that resumes next tick. This prevents frame hitches from day one and is essential for the Hybrid's D* Lite timeout fallback to work correctly.

### 2. Use an Explicit `TerrainChangeEvent` Type

```typescript
interface TerrainChangeEvent {
  chunkCoords: ChunkCoord[];
  changedVoxels: VoxelCoord[];      // specific voxels
  changeType: 'remove' | 'add';     // useful for D* Lite edge cost updates
  tick: number;                      // when it happened
}
```

This gives algorithms everything they need without re-scanning chunks, and the `changeType` lets D* Lite update edge costs directionally.

### 3. Add a `PathfindingBudgetManager` to the Simulation Engine

Each tick, it allocates computation time across algorithms and agents. When the budget is exhausted, remaining re-routes are deferred to the next tick. This prevents mass-invalidation spikes and is directly portable to Unity.

---

## Verdict

The plan is thorough, well-structured, and implementation-ready for Phase 1. The core abstractions (`IPathfinder`, `NavigationHandle`, `IPathSmoother`) are sound. The phased approach with progressively more complex algorithms is the right sequencing.

**Main risks:**
1. Timeline optimism in Phases 3 and 5
2. Missing per-tick computation budget management
3. Flow field layer edge cases that will surface during implementation

None of these are plan-breaking — they're refinements that should be addressed before Phase 2 begins.

**Recommendation:** Start Phase 1 as-is. Incorporate the `TerrainChangeEvent` and time-slicing suggestions into the `IPathfinder` interface design. Re-scope Phase 3 into two sub-phases once the flow field layer system's actual complexity is understood.
