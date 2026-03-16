# Review of Voxel Pathfinding Sandbox Plan v2.1

## Context

This is a second-pass review of the Voxel Pathfinding Sandbox plan (v2.1), building on the existing review at `voxel-pathfinding-plan-review.md`. I've also examined the current AI-Colony codebase — specifically the existing 2D A* implementation (`src/utils/pathfinding.ts`), its test suite, and how pathfinding integrates with the simulation engine. This review focuses on issues the first review missed, areas where I disagree, and deeper architectural concerns.

---

## Agreement with Existing Review

The existing review correctly identifies these critical issues — I won't rehash them but confirm they're real:

- **Phase 3/5 timeline optimism** — accurate, especially Phase 3
- **Per-tick pathfinding budget is missing** — this is the single most important gap
- **`invalidateRegion` needs voxel-level granularity** — the `TerrainChangeEvent` suggestion is the right fix
- **D* Lite memory at scale** — chunk-scoped D* Lite as default is correct
- **Flow field `getPlannedPath` caching** — yes, trace-on-demand per frame will hurt

---

## New Concerns Not Raised in First Review

### 1. The 1×2×1 Agent Volume Makes Diagonal Movement Underspecified

The plan says agents can move to "adjacent air voxels" and mentions "diagonals on the same Y level" for Grid A* neighbors. But with a 1×2×1 collision volume, diagonal movement on a grid requires **swept volume clearance** — the agent must fit through the corner. Moving diagonally from (0,0) to (1,1) means the agent briefly occupies both (1,0) and (0,1). If either has a solid block at the agent's head height, the diagonal is invalid.

The plan doesn't specify whether diagonal movement is allowed at all (the neighbor list says "6 adjacent voxels plus diagonals on same Y level" for A*, but no other algorithm mentions diagonals), and if it is, the corner-cutting clearance rules are missing. This will cause agents to clip through walls at corners.

**Recommendation:** Either restrict to 6-directional movement (cardinal + up/down) — which is simpler and avoids the problem entirely — or explicitly define the swept-volume check for diagonals including 2-tall clearance at both intermediate positions. Given that the plan is already complex, I'd recommend 6-directional only, with diagonal shortcuts handled by the string-pulling smoother.

### 2. Step-Up Logic Has an Ambiguity That Will Cause Bugs

The plan says "can step up 1 block if the two voxels above the destination are both air." But step-up also requires clearance at the **origin** position at the elevated height. If an agent at Y=5 steps up to Y=6, they need air at Y=7 and Y=8 at the destination (for 2-tall clearance). But they also need air at Y=7 at the origin — otherwise their head clips into the ceiling as they rise. The plan only specifies destination clearance.

**Recommendation:** Step-up requires: destination has solid below, destination+0 and destination+1 are air, AND origin+2 (one above current headroom) is air. Document this as a 4-voxel check.

### 3. The Seeded PRNG Strategy Has a Subtle Ordering Problem

The plan says "all random decisions draw from this RNG in a fixed order." But the order of agent updates matters. If agent processing order depends on a data structure with non-deterministic iteration (e.g., a `Map` in JS where insertion order is preserved but deletion + re-insertion changes order), the PRNG sequence diverges. The plan commits to determinism but doesn't specify **agent processing order**.

**Recommendation:** Process agents in ascending `agentId` order every tick. Document this explicitly. The existing AI-Colony simulation engine iterates `this.state.villagers` (an array), which is stable — the voxel sim should use the same pattern.

### 4. Flow Field Destination Explosion Is the Real Scalability Problem

The plan identifies memory as a concern but underestimates the **destination count problem**. In a Shovel Monster scenario with 50 NPCs each going to different destinations, you need 50 separate flow fields. At 4.7 MB for 5 destinations (plan's own estimate), 50 destinations = ~47 MB just for flow fields. The stale-field eviction TTL helps only if destinations are shared.

The plan's implicit assumption is that many agents share destinations (which is true for "all miners go to the mine entrance"). But in practice, NPCs have diverse destinations — one goes to the forge, one to the farm, one to the barracks. Flow fields only win when destination sharing is high.

**Recommendation:** Add an explicit destination-sharing threshold to the flow field algorithm. If fewer than N agents share a destination, fall back to per-agent A* within the flow field implementation rather than computing a full field. This makes the standalone flow field algorithm more practical and makes the benchmark comparison fairer.

### 5. The Gravity System Needs a Cascade Rule

The plan says "if the block under them is removed, they fall" with a 3-tick landing pause. But what about **chain reactions**? If block A supports block B which supports an agent, and block A is removed — does block B also fall? The plan doesn't specify whether non-agent blocks are affected by gravity (sand/gravel-style physics) or if only agents fall.

For Shovel Monster this matters — mining a support column should collapse the floor above it.

**Recommendation:** Clarify scope. If only agents are gravity-affected, say so explicitly ("blocks are static; only agents fall"). If block physics are in scope, this is a significant additional system that needs its own specification (propagation rules, tick ordering, cascading invalidation).

### 6. Path Reservation Table Scaling Is Not Addressed

The plan describes path reservation (next N ticks) but doesn't discuss the data structure or its scaling. With 20 agents each reserving 10 ticks of future positions, that's 200 entries per tick. At 20 TPS, stale entries need cleanup. The lookup pattern is "is voxel X reserved at tick T?" — this needs a `Map<tick, Set<VoxelCoord>>` or similar, with garbage collection of past ticks.

More importantly: when an agent re-routes, its old reservations must be **cancelled**. The plan doesn't mention reservation cancellation. Without it, stale reservations from invalidated paths will ghost-block other agents.

**Recommendation:** Specify the reservation data structure and its lifecycle (create on path computation, cancel on re-route/arrival/death, expire after tick passes). This is a Phase 2 implementation detail but the interface should account for it.

### 7. No Specification for What Happens When an Agent's Destination Becomes Solid

If an agent is navigating to voxel (10, 5, 10) and a block is placed there, the destination is now inside solid terrain. The plan covers path invalidation (paths through changed voxels) but not **destination invalidation**. The agent will re-route, but to where? A* will fail (destination is impassable). The agent enters Stuck state — but should it?

**Recommendation:** When a destination becomes solid, the agent should automatically target the nearest walkable voxel to the original destination. This prevents unnecessary Stuck states and is realistic (an NPC going to a blocked doorway would stand next to it, not freeze).

### 8. The Hybrid Algorithm's "Intent Broadcast" Radius Is Potentially Expensive

The plan specifies a 16-voxel subscription radius for intent broadcasts. At every tick, when a miner starts mining, all agents within 16 voxels must be notified. With a naive implementation, this is an O(agents) scan per mining action per tick. The spatial hash helps, but the plan doesn't connect the intent system to the spatial hash.

More concerning: the cost elevation for "pending removal" blocks means affected agents' pathfinding cost functions change every time a mining intent is published or expires. If multiple miners are active, this creates a stream of cost function mutations that trigger re-evaluations.

**Recommendation:** Batch intent updates per tick (collect all new/expired intents, apply once), and explicitly route the subscription radius check through the spatial hash.

---

## Disagreements with First Review

### On Determinism Scope

The first review suggests tightening the V8-only determinism claim since "integer math is deterministic everywhere." This is almost right but misses one thing: the plan uses `xoshiro128` PRNG which operates on 32-bit integers, and JavaScript's bitwise operators return signed 32-bit integers. The bit-shift behavior is identical across engines for this case, so I actually agree the claim *could* be tightened — but the V8 caveat is a reasonable conservative position for a project that doesn't need cross-engine guarantees.

### On `MemoryReport.perAgentBytes` as Array vs Map

The first review suggests `Map<number, number>` instead of an array indexed by agentId. I'd go further: `perAgentBytes` shouldn't exist on `MemoryReport` at all. Per-agent memory is already available via `NavigationHandle.getHandleMemory()`. Having two sources of per-agent memory data creates a consistency problem. `MemoryReport` should only report shared/aggregate state. The agent inspector can call `getHandleMemory()` directly.

---

## Observations on Alignment with Existing Codebase

The existing AI-Colony A* implementation (`src/utils/pathfinding.ts`) has a few patterns worth noting:

1. **`MAX_OPEN_SET = 2000` search limit with partial-path fallback.** The voxel plan has no equivalent search limit. In a 64x64x64 world, unbounded A* could explore 260K+ voxels. The time-slicing suggestion from the first review partly addresses this, but a hard node limit (with partial path fallback, as the existing code does) is a simpler safety net that should exist independently.

2. **The existing pathfinder is stateless (pure function).** The voxel `IPathfinder` interface is stateful (maintains active handles, shared data structures). This is the right evolution for the voxel case, but it means the pathfinder now has lifecycle concerns (initialization, cleanup, memory leaks from unreleased handles). The plan should specify what happens if `releaseNavigation` is never called — does the pathfinder have a sweep/GC pass?

3. **The existing code uses a callback for passability (`isPassable(x, y)`)** — clean separation. The voxel plan couples pathfinding more tightly to the world (algorithms directly access chunk data for dirty flags, layer construction, etc.). This is necessary for performance but reduces testability. Consider keeping a `VoxelWorldView` interface that the pathfinder queries rather than direct chunk access.

---

## Structural Feedback on the Plan Document

The plan is comprehensive but at ~4000 words for the algorithm section alone, it risks being a reference document that nobody reads before implementing. A few suggestions:

1. **Add a 1-page "Quick Start" summary** at the top: tech stack, the 5 algorithms in 1 sentence each, the interface contract, and Phase 1 scope. Someone should be able to start implementing after reading 1 page.

2. **The Scenario Definitions section could be a separate document.** The parameter tables are valuable for implementation but break the flow of the architectural narrative. Reference them from the main plan.

3. **The Shovel Monster Export Notes repeat information from the algorithm descriptions.** Consider consolidating — each algorithm section could have a "Unity porting notes" subsection instead of a separate export section that duplicates context.

---

## Summary of Recommendations

| # | Issue | Severity | When to Address |
|---|-------|----------|-----------------|
| 1 | Diagonal movement swept-volume rules | High | Before Phase 1 implementation |
| 2 | Step-up origin clearance check | High | Before Phase 1 implementation |
| 3 | Agent processing order for determinism | Medium | Phase 1 design |
| 4 | Flow field destination explosion / sharing threshold | Medium | Phase 3 design |
| 5 | Gravity cascade scope (blocks vs agents only) | Medium | Phase 1 design |
| 6 | Path reservation cancellation lifecycle | Medium | Phase 2 design |
| 7 | Destination invalidation handling | Medium | Phase 1 (agent state machine) |
| 8 | Intent broadcast batching + spatial hash integration | Low | Phase 5 design |
| 9 | Search node limit (like existing `MAX_OPEN_SET`) | Medium | Phase 1 implementation |
| 10 | NavigationHandle leak prevention (GC/sweep) | Low | Phase 2 |
| 11 | Remove `perAgentBytes` from `MemoryReport` | Low | Phase 1 interface design |
| 12 | `VoxelWorldView` interface for testability | Low | Phase 1 design |

---

## Verdict

The plan is excellent — genuinely one of the most thorough pathfinding system designs I've seen. The `NavigationHandle` abstraction, the dual congestion strategy, and the phased algorithm introduction are all sound architectural decisions.

The gaps I've identified are mostly **edge cases in the movement model** (diagonals, step-ups, destination invalidation) and **lifecycle concerns** (reservation cleanup, handle leaks, gravity cascading). These are the kinds of things that surface during implementation and cause 2-day debugging sessions if not specified upfront.

Combined with the first review's concerns (per-tick budget, time-slicing, `TerrainChangeEvent` type), addressing items 1-7 above before starting Phase 1 would make the plan genuinely implementation-ready with minimal mid-course corrections.
