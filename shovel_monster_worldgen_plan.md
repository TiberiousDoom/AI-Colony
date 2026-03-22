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

## Files to Create (C#, in Unity project)

### 1. `WaterFeatureGenerator.cs` — Core generation algorithms

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

public struct WaterFeatureResult
{
    public int RiversPlaced;
    public int TotalRiverLength;
    public int LakesPlaced;
    public int LakeVolume;
    public int CaveFloodVolume;
    public List<Vector3Int> WaterSurfaceCells; // for NavMesh area marking
}
```

### 2. `WaterBlockDefinition.cs` — Block type integration

**Namespace:** `VoxelRPG.Voxel`

Ensure the existing block system has a Water type with these properties:
- `IsSolid = false` — NPCs fall through (already how `IsAir` works in `NPCController.CheckIfFloating`)
- `IsAir = false` — distinguishable from air for rendering and game logic
- `IsFluid = true` — new property flag for water-specific checks
- `IsTransparent = true` — for rendering (see-through faces)
- `BlocksNavMesh = true` — excluded from NavMesh walkable surface

### 3. `WaterInteraction.cs` — NPC/water interaction component

**Namespace:** `VoxelRPG.NPC`

Attach alongside `NPCController`. Handles swimming with movement penalty:
- **Swim state**: when NPC enters a Water block, set `IsSwimming = true`, reduce `NavMeshAgent.speed` to 40% of normal, disable task execution
- **Drowning check**: if NPC's head position (Y + agent height) is inside a Water block for > 5 seconds continuously, apply damage (1 HP/sec from config)
- **Exit water**: when NPC reaches a non-water block, restore normal speed, clear swim state
- **Water adjacency query**: `FindNearestWaterAdjacent(Vector3 from, float radius)` — used by fishing/water-collection tasks
- **NavMesh area cost**: Water marked as high-cost area (cost = 10) so NPCs prefer land paths but CAN swim through if no alternative
- Integrates with `NPCNeeds` if thirst is added later (optional, not in scope)

### 4. `WaterNavMeshModifier.cs` — NavMesh integration

**Namespace:** `VoxelRPG.Voxel`

After water generation, mark water surface cells as a custom NavMesh area:
- Define a "Water" NavMesh area with high traversal cost (10x normal) — NPCs strongly prefer land but can swim through
- Apply `NavMeshModifierVolume` over water regions during NavMesh bake
- Re-bake NavMesh after water placement (already happens after worldgen)
- No bridge crossings needed since NPCs can swim (bridges are a future aesthetic feature)

### 5. `WaterRenderer.cs` — Visual rendering

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
| `createNoise2D(rng)` + `fractalNoise()` | `Mathf.PerlinNoise` or FastNoiseLite library |
| `grid.setBlock(pos, type)` | `voxelWorld.SetBlock(pos, type)` via `IVoxelWorld` |
| `grid.getBlock(pos)` | `voxelWorld.GetBlock(pos)` |
| `grid.isInBounds(pos)` | Bounds check against chunk system |
| `performance.now()` timing | `System.Diagnostics.Stopwatch` |

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
| A1 | Block type enum/registry (all terrain + ore + fluid types) | — |
| A2 | `SplineMapper.cs` (spline evaluation utility) | — |
| A3 | `TerrainShapeGenerator.cs` (Spline-Noise heightmap) | A1, A2 |
| A4 | `BiomeAssigner.cs` (multi-noise biome selection) | A1, A3 |
| A5 | `CaveCarver.cs` (cheese + spaghetti caves) | A1, A3 |
| A6 | `OreDistributor.cs` (depth-based ore veins) | A1, A3 |
| A7 | `SurfaceDecorator.cs` (trees, cacti, flowers) | A1, A3, A4 |
| A8 | `SpawnPlacer.cs` (rifts + resource nodes) | A1, A3, A4 |

Steps A4-A6 can be done in parallel after A3.

### Phase B: Grammar Structures
| Step | What | Depends On |
|------|------|-----------|
| B1 | `RoomTemplates.cs` (room definitions + connection points) | A1 |
| B2 | `GrammarEngine.cs` (production rule expansion) | B1 |
| B3 | `StructurePlacer.cs` (carve into terrain) | B2, A3 |

Phase B can run in parallel with Phase A steps 4-8.

### Phase C: Water Features
| Step | What | Depends On |
|------|------|-----------|
| C1 | Add `IsFluid` property to block interface | A1 |
| C2 | `WaterFeatureGenerator.cs` (rivers, lakes, cave flooding) | C1, A3, A5 |
| C3 | Wire into pipeline (after caves + grammar, before ores) | C2, B3 |
| C4 | Modify `NPCController.CheckIfFloating` for water | C1 |
| C5 | `WaterInteraction.cs` (swim mode, drowning) | C1, C4 |
| C6 | `WaterNavMeshModifier.cs` (area cost marking) | C3 |
| C7 | `WaterRenderer.cs` (transparent material, animation) | C1 |
| C8 | Water-related tasks in `TaskManager` | C5, C6 |

Steps C4-C7 can be done in parallel after C3.

---

## Verification

1. **Generate a test world** with seed 42 — verify rivers visible flowing from mountains to sea level
2. **Cross-section view** — confirm lakes fill depressions, underground caves have water pockets below Y=12
3. **NPC pathfinding** — NPCs should path around rivers/lakes, not walk through water
4. **NPC falling into water** — should trigger swim mode, not instant death
5. **Block counts** — Water block count should increase 30-60% over sea-level-only fill (matches sandbox metrics)
6. **Performance** — water generation should add < 100ms to worldgen (sandbox shows 29-65ms at 128x64x128)
7. **Headless runner** — port the timing column to show Water phase alongside other phases

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
