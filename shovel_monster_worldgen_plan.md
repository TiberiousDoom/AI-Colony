# Shovel Monster — Worldgen & Water Features C# Integration Plan

**Date:** March 22, 2026

---

## Context

The TypeScript worldgen sandbox has proven 5 terrain generation algorithms and water feature systems (rivers, lakes, flooded caves) across all of them. This plan covers two things:

1. **Which terrain generation algorithms to port to Shovel Monster** — algorithm selection and combination strategy
2. **How to integrate water features** — rivers, lakes, flooded caves as a production layer

The sandbox prototypes live in `src/worldgen/generation/`. The C# port needs to account for Unity's chunk streaming, NavMesh pathfinding, NPC interaction, and real-time rendering.

Key Shovel Monster systems that worldgen touches:
- `IVoxelWorld` / `VoxelWorld` — block storage and queries
- `NPCController` — uses `NavMeshAgent`, checks `block.IsSolid` / `block.IsAir` for falling
- `TaskManager` — task assignment near terrain features (mining, fishing, water collection)
- `NPCNeeds` — potential "thirst" need
- NavMesh baking — terrain navigability

---

## Part 1: Terrain Generation Algorithm Selection

### Sandbox Benchmark Results (seed 42, 128x64x128)

| Algorithm | Gen Time | Height Range | Nav Score | Regions | Best Biome Balance |
|-----------|----------|-------------|-----------|---------|-------------------|
| Spline-Noise | 490ms | 22-48 (26) | 0.376 | 7 | Mountains 30%, Forest 31% |
| Layered Perlin | 320ms | 16-46 (30) | 0.352 | 16 | Forest 32%, Tundra 30% |
| Domain Warping | 321ms | 16-46 (30) | 0.396 | 23 | Forest 33%, Tundra 26% |
| Multi-Pass Sculpting | 232ms | 22-51 (29) | 0.419 | 29 | Tundra 34%, Swamp 29% |
| Grammar Hybrid | 314ms | 14-41 (27) | 0.294 | 29 | Tundra 40%, Swamp 19% |

### Recommendation: Spline-Noise as primary, Grammar Hybrid for structures

**Primary terrain algorithm: Spline-Noise**
- Best terrain variety — highest height range with distinct elevation bands
- Fewest isolated regions (7) — most connected, coherent landmass
- Strong mountain/forest ratio — creates natural gameplay zones (safe forests, dangerous peaks)
- Minecraft 1.18+ proven approach — continentalness × erosion × peaks through spline curves
- Most designer-controllable — spline editing gives artistic control without changing noise
- Multi-noise biome assignment produces biome boundaries that follow terrain features

**Secondary structure system: Grammar Hybrid**
- Grammar engine for dungeons, ruins, underground complexes
- Placed INTO Spline-Noise terrain, not generating terrain itself
- Production rules create architecturally valid room sequences (corridors → rooms → boss chambers)
- Spawn points emerge naturally from structure annotations

**Not porting:**
- Layered Perlin — too basic, Spline-Noise supersedes it
- Domain Warping — organic terrain but less controllable than splines, similar nav score
- Multi-Pass Sculpting — fastest but heavy swamp bias (29%), less balanced biomes

### Terrain Generation Files to Create (C#)

#### `TerrainShapeGenerator.cs`
**Namespace:** `VoxelRPG.WorldGen.Layers`

Port from `src/worldgen/generation/layers/terrain-shape.ts` + `src/worldgen/generation/spline-noise.ts`:

- **Three noise fields**: continentalness (freq 0.006), erosion (freq 0.015), peaks (freq 0.04)
- **Spline mapping**: combined noise → height via piecewise-linear spline (`src/worldgen/utils/spline.ts`)
- **Column fill**: Bedrock at Y=0, Stone up to surfaceY-4, Dirt to surfaceY-1, Grass at surfaceY
- **Sea level fill**: Air below seaLevel → Water
- **Output**: `float[] heightMap` (width × depth)
- **Parameters**: `continentalFreq`, `erosionFreq`, `peaksFreq`, weights, `baseHeight`, `heightScale`

```csharp
public struct TerrainParams
{
    public float ContinentalFreq;  // 0.006
    public float ErosionFreq;      // 0.015
    public float PeaksFreq;        // 0.04
    public float ContinentalWeight; // 0.5
    public float ErosionWeight;     // 0.3
    public float PeaksWeight;       // 0.2
    public int BaseHeight;          // 10
    public int HeightScale;         // 50
    public int SeaLevel;            // 32
}
```

#### `SplineMapper.cs`
**Namespace:** `VoxelRPG.WorldGen.Utils`

Port from `src/worldgen/utils/spline.ts`:
- Piecewise-linear spline evaluation: `float EvaluateSpline(SplinePoint[] points, float input)`
- Default height spline: maps noise [-1, 1] → height multiplier [0, 1] with distinct bands for ocean, plains, hills, mountains
- Designer-editable: spline points exposed as `ScriptableObject` for Unity inspector tuning

#### `BiomeAssigner.cs`
**Namespace:** `VoxelRPG.WorldGen.Layers`

Port from `src/worldgen/generation/layers/biome-assignment.ts` (`assignBiomesMultiNoise` variant):
- Multi-noise biome selection using continentalness, erosion, temperature, humidity
- 7 biome types: Plains, Forest, Desert, Tundra, Swamp, Mountains, Badlands
- Surface block replacement per biome (Sand for Desert, Snow for Tundra, Mud for Swamp, etc.)
- Tundra freezes surface water to Ice

#### `CaveCarver.cs`
**Namespace:** `VoxelRPG.WorldGen.Layers`

Port from `src/worldgen/generation/layers/cave-carver.ts` (`carveCheeseAndSpaghetti` — the Spline-Noise algorithm's cave method):
- **Cheese caves**: 3D noise with large void threshold — creates open caverns
- **Spaghetti caves**: two intersecting 3D noise fields — creates winding tunnels
- Combined system produces both large chambers and connecting passages
- Operates Y=2 to surfaceY-2, protects bedrock layer

#### `GrammarEngine.cs` + `RoomTemplates.cs` + `StructurePlacer.cs`
**Namespace:** `VoxelRPG.WorldGen.Structures`

Port from `src/worldgen/grammar/`:
- **GrammarEngine**: production rule expansion from seed symbols (Entrance → Corridor + Room, etc.)
- **RoomTemplates**: rectangular volumes with connection points (N/S/E/W/Up/Down), dimensions, block-fill rules
- **StructurePlacer**: carve grammar output into voxel world, collision checking against terrain
- Spawn annotations: boss chamber → boss rift, treasure room → resource node
- Depth limit 8, max 25 concurrent rooms, overlap rejection

#### `OreDistributor.cs`
**Namespace:** `VoxelRPG.WorldGen.Layers`

Port from `src/worldgen/generation/layers/ore-placement.ts`:
- 6 ore types with depth ranges: Coal (1-48), Iron (1-40), Copper (8-36), Gold (1-20), Gem (1-16), Crystal (1-12)
- Random-walk vein growth from seed points
- Only replaces Stone blocks
- Frequency: Coal 8/1000 → Crystal 1.5/1000

#### `SurfaceDecorator.cs`
**Namespace:** `VoxelRPG.WorldGen.Layers`

Port from `src/worldgen/generation/layers/surface-decoration.ts`:
- Biome-specific placement: Forest trees (8%), Plains trees (2%) + flowers (3%), Desert cacti (4%), etc.
- Minimum spacing enforcement (Poisson-disc)
- Tree structure: trunk 4-6 blocks + spherical leaf canopy radius 2
- Only on solid, non-water surface

#### `SpawnPlacer.cs`
**Namespace:** `VoxelRPG.WorldGen.Layers`

Port from `src/worldgen/generation/layers/spawn-placement.ts`:
- **Rift spawns**: Poisson-disc sampling, min distance 30, prefer flat terrain, difficulty gradient from center
- **Resource nodes**: min distance 15, biome-appropriate
- Avoid underwater positions
- Integrate with existing `TaskManager` for resource node registration

---

## Part 2: Water Features

### `WaterFeatureGenerator.cs` — Core generation algorithms

**Namespace:** `VoxelRPG.WorldGen.Layers`

Port the three algorithms from `water-features.ts`:

**Rivers (`CarveRivers`)**
- Input: heightmap `float[]`, biome map, seed, sea level
- Gradient descent from high-elevation sources to sea level
- Meander via secondary noise sampling (use Unity's `Mathf.PerlinNoise` or port the sandbox's simplex)
- Carve channel: 2 blocks deep, configurable width (default 2)
- Fill carved area with `BlockType.Water`
- Update heightmap to reflect carved bed (critical for downstream layers)
- Return: river count, total length, list of river cell positions (for NavMesh marking)

**Lakes (`FillLakes`)**
- Input: heightmap, biome map, seed, sea level
- Scan for local minima (depression finding)
- BFS basin detection → spill elevation calculation
- Flood-fill up to spill level, cap at 4 blocks depth, 200 cells per basin, 8 lakes max
- Skip desert biomes
- Return: lake count, volume, list of lake cell positions

**Flooded Caves (`FloodUndergroundCaves`)**
- Input: voxel world reference, heightmap, sea level, max flood Y
- BFS from lowest Air blocks, fill enclosed pockets with Water
- Skip surface-connected pockets (check connectivity upward)
- Cap pocket size at 500 blocks
- Return: flood volume

**Orchestrator (`GenerateWaterFeatures`)**
```csharp
public struct WaterFeatureParams
{
    public int RiverCount;      // default 4
    public int RiverWidth;      // default 2
    public bool LakesEnabled;   // default true
    public int CaveFloodMaxY;   // default 12, -1 to disable
}

public class WaterFeatureResult  // class, not struct — contains reference type (List)
{
    public int RiversPlaced;
    public int TotalRiverLength;
    public int LakesPlaced;
    public int LakeVolume;
    public int CaveFloodVolume;
    public List<Vector3Int> WaterSurfaceCells; // for NavMesh area marking
}
```

### `WaterBlockDefinition.cs` — Block type integration

**Namespace:** `VoxelRPG.Voxel`

Ensure the existing block system has a Water type with these properties:
- `IsSolid = false` — NPCs fall through (already how `IsAir` works in `NPCController.CheckIfFloating`)
- `IsAir = false` — distinguishable from air for rendering and game logic
- `IsFluid = true` — new property flag for water-specific checks
- `IsTransparent = true` — for rendering (see-through faces)
- `BlocksNavMesh = true` — excluded from NavMesh walkable surface

### `WaterInteraction.cs` — NPC/water interaction component

**Namespace:** `VoxelRPG.NPC`

Attach alongside `NPCController`. Handles swimming with movement penalty:
- **Swim state**: when NPC enters a Water block, set `IsSwimming = true`, reduce `NavMeshAgent.speed` to 40% of normal, disable task execution
- **Drowning check**: if NPC's head position (Y + agent height) is inside a Water block for > 5 seconds continuously, apply damage (1 HP/sec from config)
- **Exit water**: when NPC reaches a non-water block, restore normal speed, clear swim state
- **Water adjacency query**: `FindNearestWaterAdjacent(Vector3 from, float radius)` — used by fishing/water-collection tasks
- **NavMesh area cost**: Water marked as high-cost area (cost = 10) so NPCs prefer land paths but CAN swim through if no alternative
- Integrates with `NPCNeeds` if thirst is added later (optional, not in scope)

### `WaterNavMeshModifier.cs` — NavMesh integration

**Namespace:** `VoxelRPG.Voxel`

After water generation, mark water surface cells as a custom NavMesh area:
- Define a "Water" NavMesh area with high traversal cost (10x normal) — NPCs strongly prefer land but can swim through
- Apply `NavMeshModifierVolume` over water regions during NavMesh bake
- Re-bake NavMesh after water placement (already happens after worldgen)
- No bridge crossings needed since NPCs can swim (bridges are a future aesthetic feature)

### `WaterRenderer.cs` — Visual rendering

**Namespace:** `VoxelRPG.Rendering`

Water needs distinct rendering from solid blocks:
- Semi-transparent material (alpha ~0.6, blue tint `#4488cc`)
- Animated UV offset for surface shimmer (simple scrolling normal map)
- Only render top face + side faces adjacent to air (not water-to-water faces)
- Underground flooded caves: darker tint, no surface animation

---

## Files to Modify (existing C# code)

### 1. Block type enum / registry
- Add `Water` and `Ice` block types if not already present
- Add `IsFluid` property to block interface

### 2. `NPCController.cs` (existing: `navigation/shovel-monster/npc-ai-files/NPC/NPCController.cs`)
- `CheckIfFloating()` (line 588): currently only checks `block.IsSolid`. Water is not solid, so NPCs would start falling into it. Instead, detect fluid and enter swim mode:
  ```csharp
  // After the existing IsSolid check:
  if (block != null && block.IsFluid)
  {
      // Standing on/in water — enter swim mode instead of falling
      _waterInteraction?.EnterWater();
      return;
  }
  ```
- `ApplyFalling()` (line 675): when falling NPC enters a Water block, decelerate (`_fallVelocity *= 0.3f`), trigger swim state, do NOT kill — water breaks the fall
- `ConfigureNavAgent()` (line 805): set Water area cost to 10 so pathfinder avoids water but treats it as traversable
- Add `[SerializeField] private WaterInteraction _waterInteraction;` to dependencies

### 3. World generation pipeline
- Insert `WaterFeatureGenerator.GenerateWaterFeatures()` after cave carving, before ore placement (same position as the TS sandbox)
- Pass `WaterFeatureResult.WaterSurfaceCells` to NavMesh modifier

### 4. `TaskManager.cs` — Add water-related task types
- `FetchWater` task: NPC walks to water-adjacent tile, collects water resource
- `Fish` task: NPC stands adjacent to water, performs fishing action (mirrors 2D colony's fishing mechanic)
- Both require `WaterInteraction.FindNearestWaterAdjacent()`

---

## Full Generation Pipeline for Shovel Monster

```
1. Terrain Shape        — TerrainShapeGenerator.cs (Spline-Noise heightmap)
2. Biome Assignment     — BiomeAssigner.cs (multi-noise → 7 biomes)
3. Cave Carving         — CaveCarver.cs (cheese + spaghetti caves)
4. Grammar Structures   — GrammarEngine.cs + StructurePlacer.cs (dungeons, ruins)
5. Water Features       — WaterFeatureGenerator.cs (rivers, lakes, flooded caves)
6. Ore Placement        — OreDistributor.cs (6 ore types, depth-based)
7. Surface Decoration   — SurfaceDecorator.cs (trees, cacti, flowers per biome)
8. Spawn Placement      — SpawnPlacer.cs (rifts + resource nodes)
9. NavMesh Bake         — WaterNavMeshModifier.cs (water as high-cost area)
```

Note: Grammar structures (step 4) run before water so that rivers/lakes don't fill dungeon interiors. Water features check for existing non-Air, non-Stone blocks and skip them.

---

## Algorithm Translation Notes (TS → C#)

| TypeScript | C# Equivalent |
|-----------|--------------|
| `Float32Array` heightMap | `float[]` heightMap |
| `Uint8Array` biomeMap | `byte[]` or `BiomeType[]` biomeMap |
| `Set<number>` visited | `HashSet<int>` visited |
| `Map<number, number>` basin | `Dictionary<int, float>` basin |
| `rng.fork()` | `new System.Random(seed + offset)` or custom SeededRNG |
| `createNoise2D(rng)` + `fractalNoise()` | **Port sandbox simplex directly** (see Noise section below) |
| `grid.setBlock(pos, type)` | `voxelWorld.SetBlock(pos, type)` via `IVoxelWorld` |
| `grid.getBlock(pos)` | `voxelWorld.GetBlock(pos)` |
| `grid.isInBounds(pos)` | Bounds check against chunk system |
| `performance.now()` timing | `System.Diagnostics.Stopwatch` |

### Noise Library: Port Sandbox Simplex (do NOT use Mathf.PerlinNoise)

The sandbox uses a custom seeded simplex noise implementation (`src/shared/noise.ts`) with specific gradient tables (12 vectors for 2D, 16 for 3D) and integer-only arithmetic for determinism. Unity's `Mathf.PerlinNoise` is a different algorithm (classic Perlin, not simplex), has different spectral properties, different output range, and is NOT seedable — terrain would look completely different from the sandbox prototypes.

**Recommendation:** Port the sandbox's `createNoise2D()`, `createNoise3D()`, `fractalNoise()`, and `fractalNoise3D()` directly to C#. The implementation is ~270 lines of pure math with no JS-specific dependencies. This preserves:
- Identical terrain output for the same seed (validated against sandbox benchmarks)
- Seeded determinism (Fisher-Yates permutation table from RNG)
- Both 2D (terrain shape, biomes) and 3D (caves) support

Create as `SimplexNoise.cs` in `VoxelRPG.WorldGen.Utils`.

### Target World Size

**Must define before porting.** The sandbox benchmarks at 128x64x128 (~1M voxels). Shovel Monster likely needs larger worlds. Key scaling concerns:

| World Size | Heightmap | Cave Flood Visited Array | Est. Gen Time |
|-----------|-----------|-------------------------|--------------|
| 128x64x128 | 64 KB | 1 MB | ~500ms (proven) |
| 256x128x256 | 256 KB | 8 MB | ~4s (estimated) |
| 512x128x512 | 1 MB | 32 MB | ~16s (estimated) |

The hybrid chunk streaming strategy (below) mitigates runtime memory, but the global planning pass still needs the full heightmap. For worlds > 256x256, consider a reduced-resolution heightmap (sample every 2nd column) for river/lake planning.

### Post-Water Tundra Ice Pass

**Known issue:** Biome assignment runs before water features and freezes sea-level water in Tundra. Rivers and lakes carved afterward in Tundra will contain unfrozen water — a visual inconsistency.

**Fix:** Add a lightweight post-water pass at the end of `GenerateWaterFeatures()`:
```csharp
// After all water is placed, freeze surfaces in Tundra
for each water surface cell:
    if biomeMap[x, z] == BiomeType.Tundra:
        grid.SetBlock(topWaterY, BlockType.Ice)
```
This should also be backported to the TypeScript sandbox.

### Navigability Analyzer (Debug Tool)

Port `src/worldgen/analysis/navigability.ts` as `NavigabilityAnalyzer.cs` in `VoxelRPG.WorldGen.Analysis`:
- BFS-based path sampling: test 50 random surface point-pairs for reachability
- Flood-fill from world center to count isolated regions
- Weighted score: 50% path success + 30% isolation penalty + 20% path efficiency
- Run as optional post-gen validation (editor-only, not in builds)
- Critical for catching regressions when water features or grammar structures fragment terrain

**Chunk streaming strategy: Hybrid (global paths, local carve)**

Rivers and lakes span multiple chunks, so water uses a two-pass approach:

1. **Global planning pass** (runs once at world init or seed change):
   - Generate the full heightmap (or sample it at reduced resolution)
   - Run river gradient descent to produce `List<RiverPath>` — each is a sequence of `(x, z, bedY, width)` waypoints
   - Run lake depression scan to produce `List<LakeBasis>` — each is `(centerX, centerZ, spillElevation, cellSet)`
   - Run cave flood scan on loaded chunks to produce `List<FloodPocket>` — `(startPos, maxY, cellSet)`
   - Store these as `WaterFeatureMetadata` — lightweight, serializable, saved alongside world seed

2. **Per-chunk carve pass** (runs as each chunk loads):
   - Check if any river paths, lake basins, or flood pockets intersect this chunk's bounds
   - For intersecting features, place Water blocks at the pre-computed positions
   - Fast: just a spatial lookup + block writes, no algorithm re-execution

This means river paths are coherent across chunks without needing the full heightmap in memory during gameplay. The metadata is small (a few KB for paths + cell lists) and can be saved/loaded with the world.

---

## Implementation Sequence

### Phase A: Core Terrain Generation
| Step | What | Depends On |
|------|------|-----------|
| A1 | Block type enum/registry (all terrain + ore + fluid types, including `IsFluid`) | — |
| A2 | `SimplexNoise.cs` (port sandbox's seeded simplex 2D/3D) | — |
| A3 | `SplineMapper.cs` (spline evaluation utility) | — |
| A4 | `TerrainShapeGenerator.cs` (Spline-Noise heightmap) | A1, A2, A3 |
| A5 | `BiomeAssigner.cs` (multi-noise biome selection) | A1, A2, A4 |
| A6 | `CaveCarver.cs` (cheese + spaghetti caves) | A1, A2, A4 |
| A7 | `OreDistributor.cs` (depth-based ore veins) | A1, A4 |
| A8 | `SurfaceDecorator.cs` (trees, cacti, flowers) | A1, A4, A5 |
| A9 | `SpawnPlacer.cs` (rifts + resource nodes) | A1, A4, A5 |

Steps A5-A7 can be done in parallel after A4.

### Phase B: Grammar Structures
| Step | What | Depends On |
|------|------|-----------|
| B1 | `RoomTemplates.cs` (8 room types + connection points) | A1 |
| B2 | `GrammarEngine.cs` (8 production rules, depth-weighted) | B1 |
| B3 | `StructurePlacer.cs` (carve into terrain, collision checking) | B2, A4 |

Phase B can run in parallel with Phase A steps 5-9.

### Phase C: Water Features
| Step | What | Depends On |
|------|------|-----------|
| C1 | `WaterFeatureGenerator.cs` (rivers, lakes, cave flooding) | A1, A4, A6 |
| C2 | Post-water Tundra ice pass (freeze river/lake surfaces in Tundra) | C1, A5 |
| C3 | Wire into pipeline (after caves + grammar, before ores) | C2, B3 |
| C4 | Modify `NPCController.CheckIfFloating` for water | A1 |
| C5 | `WaterInteraction.cs` (swim mode, drowning) | A1, C4 |
| C6 | `WaterNavMeshModifier.cs` (area cost marking) | C3 |
| C7 | `WaterRenderer.cs` (transparent material, animation) | A1 |
| C8 | Water-related tasks in `TaskManager` | C5, C6 |

Steps C4-C7 can be done in parallel after C3.

### Phase D: Validation & Debug Tools
| Step | What | Depends On |
|------|------|-----------|
| D1 | `NavigabilityAnalyzer.cs` (BFS path sampling, region counting) | A4 |
| D2 | Post-gen validation pass (flag seeds with nav score < 0.3) | D1, C3 |
| D3 | Benchmark at target world size (compare against sandbox metrics) | All above |

---

## Verification

### Terrain Generation
1. **Seed determinism** — same seed must produce identical terrain in C# as in TypeScript sandbox (requires ported simplex noise, not Mathf.PerlinNoise)
2. **Biome balance** — Spline-Noise should produce ~30% Mountains, ~31% Forest (matching sandbox benchmark)
3. **Cave connectivity** — cheese+spaghetti caves should produce both large chambers and winding tunnels
4. **Grammar structures** — dungeons should have valid room connectivity (no dead-end corridors, boss rooms at depth >= 6)

### Water Features
5. **Rivers** — visible gradient-descent paths from mountains to sea level
6. **Lakes** — depressions filled with water, not in desert biomes
7. **Tundra freezing** — river and lake surfaces frozen in Tundra zones (post-water ice pass)
8. **Underground flooding** — cave pockets below Y=12 contain water, surface-connected caves do NOT
9. **Block counts** — Water block count should increase 30-60% over sea-level-only fill (matches sandbox)

### NPC Integration
10. **Pathfinding** — NPCs prefer land paths but swim through water when no alternative (10x cost)
11. **Swim mode** — NPCs enter swim state at 40% speed when in water, exit on land
12. **Falling into water** — triggers swim, not death; velocity decelerates
13. **Drowning** — damage after 5s submerged (head block is Water)

### Performance
14. **Generation time** — full pipeline < 2s at target world size (sandbox: ~500ms at 128x64x128)
15. **Water phase** — adds < 100ms (sandbox: 29-65ms)
16. **Navigability score** — > 0.3 across 50 sampled seeds (sandbox Spline-Noise: 0.376)

---

## Scope Boundaries

**In scope:**
- Full terrain generation pipeline: Spline-Noise terrain + multi-noise biomes + cheese/spaghetti caves + grammar structures
- All 6 generation layers ported to C# (terrain, biomes, caves, ores, decoration, spawns)
- Grammar engine for dungeon/ruin structures
- Static water placement (rivers, lakes, flooded caves) during worldgen
- NPC water interaction (swim with penalty, drowning)
- NavMesh integration (water as high-cost swim area)
- Water block rendering (transparent, animated surface)
- Hybrid chunk streaming (global path planning, per-chunk carving)

**Not porting:**
- Layered Perlin generator (superseded by Spline-Noise)
- Domain Warping generator (less controllable than splines)
- Multi-Pass Sculpting generator (biome balance issues, Swamp 29%)
- Hydraulic erosion simulation (expensive, marginal visual benefit at game scale)

**Out of scope (future work):**
- Dynamic water flow simulation (cellular automata fluid physics)
- Water source blocks / infinite water mechanics
- Irrigation / farming systems
- Boat / raft navigation
- Waterfall particles / sound effects
- Ice freezing mechanics (exists in sandbox but deferred for C#)
- Thirst as an NPC need (infrastructure ready but not wired)
- Spline editor UI in Unity inspector (use ScriptableObject for now)
