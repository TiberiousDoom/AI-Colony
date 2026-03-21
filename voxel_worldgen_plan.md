# Procedural World Generation Sandbox — Project Plan

**Version:** 1.0
**Date:** March 21, 2026

---

## Project Summary

A browser-based 3D voxel terrain generation testbed where multiple world generation algorithms run side-by-side on the same seed, producing visibly different terrain from identical inputs. The sandbox compares how each approach handles overworld shaping, cave networks, biome distribution, ore/resource placement, and enemy spawn point selection. The project serves as an R&D pipeline for Shovel Monster's world generation system, answering the fundamental question: which combination of algorithms produces the most playable, interesting, and navigable voxel terrain?

---

## Core Problem Being Solved

Voxel world generation has dozens of valid approaches, and the "right" one depends entirely on how the terrain feels to play in — not how the algorithm looks on paper. Perlin noise produces smooth but boring hills. Domain warping creates alien landscapes that may be unnavigable. Wave function collapse generates structured patterns but struggles with organic terrain. Erosion simulation produces realistic geology but is computationally expensive. The only way to know what works for Shovel Monster is to see them side-by-side on the same seed and stress-test the output for playability.

---

## Technical Stack

- **Rendering:** Three.js (3D voxel rendering with instanced meshes, same infrastructure as pathfinding sandbox)
- **UI/Dashboard:** React + Recharts (metrics, terrain analysis, parameter controls)
- **Language:** TypeScript
- **Voxel Size:** 1 unit cubes
- **World Size:** 128x64x128 per sandbox (128 wide, 64 tall, 128 deep — expandable)
- **Chunk Size:** 16x16x16 (matching common game engine chunk sizes for export relevance)
- **Build Tool:** Vite
- **State Management:** Zustand
- **Testing:** Vitest for unit tests, seeded generation for deterministic comparisons
- **No backend required** — entirely client-side

---

## Views & Layout

### 1. Metrics Dashboard (Default View — "Stealth Mode")

Terrain analysis presented as a professional data dashboard.

**Layout:**

- **Top Bar:** Generation controls (generate, seed input, algorithm selector, world size), generation time display
- **Headline Cards:** One per algorithm — generation time, block count by type, cave density, biome coverage, navigability score
- **Main Charts:**
  - Height distribution histogram (how much terrain at each Y level — reveals flatness vs mountainousness)
  - Biome coverage pie chart (% of surface area per biome)
  - Cave density by depth (bar chart — how hollow is the underground at each level?)
  - Ore distribution by depth (stacked area chart — do ores appear at the right depths?)
  - Navigability score over sampled paths (line chart — can agents actually traverse this terrain?)
  - Generation time breakdown (stacked bar — how long each generation phase takes)
- **Side Panel — Terrain Stats:** Block type counts, surface area, average elevation, max elevation, cave network count, largest cave volume, spawn point count and distribution
- **Bottom Strip:** Quick-compare table — algorithms as rows, key terrain metrics as columns

### 2. 3D World View (Toggle)

Three.js rendering of the generated voxel worlds side-by-side.

**Layout:**

- **Top Bar:** Same controls as dashboard (shared)
- **Main Area:** Side-by-side Three.js canvases, one per algorithm. Same seed, different generation. Camera controls: orbit, pan, zoom (linked or independent toggle). Cross-section mode: slice the world at any Y level to see underground structure
- **Visualization Modes:**
  - **Natural:** Block colors by type (grass, stone, dirt, sand, snow, water)
  - **Biome Map:** Color by biome assignment (top-down heat map)
  - **Height Map:** Grayscale by elevation
  - **Cave View:** Transparent overworld, only show cave air blocks
  - **Ore Map:** Highlight ore veins by type with transparent rock
  - **Spawn Points:** Show enemy rift locations and resource node placements as glowing markers
  - **Navigability Overlay:** Color terrain by pathfinding accessibility (green = easily reachable, red = isolated or inaccessible)
- **Cross-Section Tool:** Click and drag to define a vertical slice plane. Shows the interior geology — cave shapes, ore veins, underground biome layers
- **Fly-Through Camera:** Free-fly mode to explore the terrain from a player's perspective

### 3. Parameter Tuner

Per-algorithm parameter controls that regenerate in real time (or on button press for expensive algorithms).

- **Noise Parameters:** Octaves, frequency, amplitude, lacunarity, persistence
- **Terrain Shaping:** Sea level, mountain height, valley depth, plateau frequency
- **Cave Parameters:** Cave density, worm radius, worm length, vertical bias, cave connectivity
- **Biome Parameters:** Biome scale, temperature/humidity noise blend, biome transition width
- **Ore Parameters:** Ore types, depth ranges, vein size, cluster frequency
- **Spawn Parameters:** Rift density, min distance between rifts, depth preference, biome affinity
- **Presets:** Save/load parameter sets for quick comparison

### 4. Navigability Analyzer

Automated pathfinding test that runs the pathfinding sandbox's A* algorithm on the generated terrain.

- Sample N random start/end pairs across the surface
- Compute paths and record: success rate, average path length, average path straightness
- Flag "islands" — disconnected surface regions that can't be reached without building/mining
- Rate overall terrain navigability as a composite score
- Highlight problem areas on the 3D view

---

## World Generation Layers

Every algorithm must produce the same output format — a voxel grid with block types assigned. The generation is layered, with each layer building on the previous:

### Layer 1: Base Terrain Shape

The fundamental overworld silhouette — where are the hills, valleys, mountains, and plains?

**Output:** A height value per (x, z) column defining where solid ground ends and air begins.

### Layer 2: Biome Assignment

Each surface column is assigned a biome based on temperature and humidity noise maps. Biomes affect surface block types, vegetation density, and underground characteristics.

**Biomes:**
- **Plains:** Flat to gently rolling, grass surface, moderate cave density
- **Forest:** Rolling hills, grass/dirt surface, dense tree placement zones, moderate caves
- **Desert:** Flat with dunes, sand surface, minimal caves, exposed stone outcrops
- **Tundra:** Flat to hilly, snow surface, permafrost layer, ice caves
- **Swamp:** Low-lying, water-adjacent, mud/peat surface, shallow cave networks
- **Mountains:** High elevation, steep slopes, stone surface, deep cave systems, exposed ore
- **Badlands:** Eroded terrain, layered colored stone, canyon formations, sparse resources

### Layer 3: Underground Structure

Caves, tunnels, and underground features carved into the solid terrain.

**Features:**
- **Cave Worms:** 3D Perlin worm paths that carve tunnel networks through stone. Variable radius, branching, and vertical bias
- **Caverns:** Large open underground chambers at specific depths. Generated by combining noise thresholds
- **Ravines:** Narrow vertical cracks that cut deep into the surface, exposing underground layers
- **Underground Lakes:** Water-filled caverns at specific depths

### Layer 4: Ore & Resource Placement

Distribute mineable resources through the underground based on depth, biome, and cluster rules.

**Resource Types (configurable):**
- **Common:** Coal, iron — shallow depth, large veins, all biomes
- **Uncommon:** Copper, tin — medium depth, medium veins, biome-weighted
- **Rare:** Gold, gems — deep, small veins, mountain/badlands bias
- **Special:** Crystal, ancient material — very deep or biome-exclusive, tiny veins

**Placement Rules:**
- Each ore type has a min/max depth range
- Vein size follows a distribution (mostly small, occasionally large)
- Veins cluster — ores appear in groups, not uniformly distributed
- Biome affinity — some ores are more common in certain biomes

### Layer 5: Surface Decoration

Trees, boulders, forageable plants, grass, flowers — placed on valid surface blocks.

**Rules:**
- Decoration type depends on biome (cacti in desert, pine trees in tundra)
- Density varies by biome and local terrain slope (no trees on cliffs)
- Minimum spacing between large decorations (trees don't overlap)
- Forageable resources (berries, herbs, mushrooms) placed with cluster logic similar to ores

### Layer 6: Spawn Point Placement

Enemy rifts and special encounter locations placed based on world analysis.

**Rift Placement Rules:**
- Minimum distance between rifts (configurable, e.g., 30 blocks)
- Biome affinity — certain enemy types spawn in certain biomes
- Depth preference — surface rifts vs underground rifts
- Terrain suitability — rifts prefer flat or semi-flat areas, avoid cliff edges and water
- Difficulty gradient — rifts near world center are easier, rifts at edges are harder (or vice versa)
- Accessibility — rifts should be reachable by NPC pathfinding (integrates with navigability analysis)

**Resource Node Placement:**
- Forageable surface resources follow biome and density rules
- Mining nodes mark exposed ore on cave walls or surface outcrops
- Spacing rules prevent clustering beyond intended density

---

## Generation Algorithms

### Algorithm 1: Layered Perlin (Baseline)

The most common approach for voxel terrain. Stack multiple octaves of Perlin noise at different frequencies and amplitudes to create the height map.

**Terrain shaping:**
- Base height from 2D Perlin noise (2–3 octaves, low frequency for broad shapes)
- Detail from additional octaves (high frequency for surface roughness)
- Amplitude scaling creates flat lowlands and sharp peaks
- Sea level threshold floods low areas

**Caves:** 3D Perlin noise with a density threshold. Voxels below the threshold become air. Simple but produces blobby, disconnected caves.

**Biomes:** Separate temperature and humidity Perlin maps. Biome lookup table maps (temp, humidity) pairs to biome types. Transitions are abrupt without blending.

**Characteristics:** Fast, predictable, easy to tune. Produces smooth, naturalistic terrain. Weakness: terrain can feel samey — hills everywhere, no dramatic features. Caves are blobby. Biome transitions are harsh.

### Algorithm 2: Domain Warping

Same Perlin base but with the input coordinates distorted by another noise function before sampling. This creates more organic, flowing terrain features — rivers of mountains, swirling valleys, natural-looking coastlines.

**Terrain shaping:**
- Sample warp noise at (x, z) to get offset (dx, dz)
- Sample terrain noise at (x + dx, z + dz)
- Multiple warp passes create increasingly complex distortion
- Warp strength controls how "alien" vs "natural" the terrain feels

**Caves:** Domain-warped 3D noise produces more interesting cave shapes — winding tunnels instead of blobs. Worm-like structures emerge naturally from the warping.

**Biomes:** Warped temperature/humidity maps create more organic biome boundaries — biomes follow terrain features rather than cutting across them.

**Characteristics:** More visually interesting than basic Perlin with only moderate computational cost. Creates natural-looking features like winding rivers and curved mountain ranges. Weakness: can produce unnavigable terrain if warp strength is too high. Harder to tune — small parameter changes create big differences.

### Algorithm 3: Multi-Pass Sculpting

A sequential approach where each pass adds or subtracts specific features from the terrain.

**Passes:**
1. **Continent shape:** Very low-frequency noise defines broad land/ocean boundaries
2. **Mountain placement:** Identify mountain zones via Voronoi cells or ridge noise. Elevate these regions
3. **Valley carving:** Hydraulic erosion simulation cuts valleys and river paths downhill from peaks
4. **Plateau shaping:** Flatten selected elevated regions to create mesas and plateaus
5. **Coast erosion:** Smooth and erode terrain near sea level for natural coastlines
6. **Cave carving:** 3D worm agents tunnel through the underground, branching and widening at cavern points
7. **Biome painting:** Assign biomes based on elevation, latitude (distance from center), moisture (distance from water), and local slope

**Caves:** Agent-based cave worms — start at random underground points, move in a random walk with bias toward horizontal, carving a tunnel of variable radius. Branch occasionally. Create large chambers where multiple worms meet.

**Characteristics:** Most realistic-looking results. Each pass is understandable and tunable independently. Erosion simulation creates naturally plausible valleys and rivers. Weakness: slowest algorithm by far — erosion simulation is expensive. Many parameters across many passes. Order of passes matters.

### Algorithm 4: Noise Composition with Spline Control (Phase 4)

Uses spline curves to precisely control how noise values map to terrain height at different elevation bands. Instead of raw noise → height, the mapping goes noise → spline lookup → height, giving fine control over how flat, hilly, or mountainous each elevation band is.

**Structure:**
- Base continentalness noise (very low freq) determines land vs ocean vs mountains
- Erosion noise determines how eroded/sharp the terrain is
- Peaks/valleys noise adds local variation
- A set of spline curves maps the combination of these noise values to a final height
- Different spline presets produce dramatically different worlds from the same noise

**Why this matters:** This is approximately how Minecraft 1.18+ generates terrain (the "multi-noise" approach). It produces the most controllable results — you can precisely define "mountains should be this steep, plains should be this flat, the transition between them should be this wide" without fighting the noise.

**Caves:** Cheese caves (3D noise with large voids), spaghetti caves (thin winding tunnels via two intersecting 3D noise fields), noodle caves (thinner variant). Each type operates independently and combines.

**Biomes:** Multi-noise biome selection using continentalness, erosion, temperature, humidity, and weirdness as inputs. Produces natural biome placement that respects terrain features.

**Characteristics:** Most controllable approach. Spline editing gives artistic control over terrain without changing the noise itself. Separates "terrain shape" from "terrain roughness" from "biome selection" cleanly. Weakness: most complex to implement. Spline editing UI adds development overhead. Many interacting noise fields to tune.

### Algorithm 5: Wave Function Collapse + Noise Hybrid (Phase 5)

Uses WFC for structural features (dungeons, ruins, specific formations) placed into a noise-generated landscape. The noise handles the broad terrain, WFC handles the interesting details.

**Structure:**
- Standard noise-based terrain generation (Algorithm 1 or 2) for the base landscape
- Identify placement zones for structures using terrain analysis (flat areas, cliff faces, cave entrances)
- WFC generates structures from a tile set: dungeon rooms, corridors, treasure chambers, entrance halls
- Structures are carved into or placed on the terrain, with transition zones blended
- WFC can also generate cave systems with more architectural structure than pure noise — rooms connected by corridors with consistent floor levels

**Spawn Integration:** WFC structures naturally define spawn points — a dungeon's deepest room gets a boss rift, side rooms get minor enemy rifts, treasure rooms get resource nodes.

**Characteristics:** Produces the most interesting points of interest — actual structures instead of just terrain. WFC guarantees structural validity (rooms connect, corridors lead somewhere). Weakness: WFC is slow for large areas, so it's only used for specific features. Tile set design is a significant upfront investment. Blending WFC output into noise terrain requires careful transition logic.

---

## Terrain Analysis Metrics

Every generated world is automatically analyzed to produce comparable metrics.

### Surface Metrics
- **Height distribution:** Histogram of surface elevation values. Reveals flatness vs dramatic terrain
- **Slope distribution:** Average and max slope angles. Steep terrain is harder to navigate
- **Biome coverage:** Percentage of surface area per biome. Balanced or dominated?
- **Biome fragmentation:** Average biome region size. Too fragmented feels noisy, too large feels monotonous
- **Water coverage:** Percentage of surface at or below sea level
- **Surface roughness:** Standard deviation of height in local neighborhoods

### Underground Metrics
- **Cave density by depth:** What percentage of each Y-level is air? Should increase with depth
- **Cave connectivity:** How many separate cave networks exist? Are they reachable from the surface?
- **Largest cavern volume:** Biggest single connected air space underground
- **Ore density by depth:** Does the ore distribution follow the intended depth curves?
- **Ore accessibility:** What percentage of ore is adjacent to a cave (already exposed)?

### Playability Metrics
- **Navigability score:** Percentage of random surface point-pairs that have a valid path between them
- **Average path efficiency:** Ratio of actual path length to straight-line distance. Higher = more winding/obstructed
- **Isolated regions:** Count of disconnected surface areas (islands, unreachable plateaus)
- **Spawn point accessibility:** Can an NPC path from every rift to at least one other rift?
- **Resource distribution fairness:** Are resources spread across the world or clustered in one area?
- **Shelter availability:** How easy is it to find natural overhangs or cave entrances from the surface?

### Performance Metrics
- **Generation time:** Total and per-layer breakdown
- **Memory usage:** Peak voxel grid size during generation
- **Chunk streamability:** Can each chunk be generated independently? (Important for infinite worlds)

---

## Development Phases

### Phase 1: Foundation (Target: 1–2 weeks)

**Goal:** Single world generation with Layered Perlin, 3D view with visualization modes, basic metrics.

- Project scaffolding (Vite + React + TypeScript + Three.js + Zustand + Vitest)
- Voxel grid data structure (128x64x128, chunk-based 16x16x16 storage)
- Three.js voxel renderer (instanced meshes with greedy meshing for performance)
- Camera controls (orbit, pan, zoom, fly-through)
- Seeded noise library (Perlin/simplex with deterministic seed)
- Layered Perlin terrain generation (Layer 1: base shape)
- Basic block types: stone, dirt, grass, sand, water, air
- Sea level flooding
- Visualization modes: Natural, Height Map
- Seed input field with generate button
- Metrics dashboard: height distribution, block counts, generation time
- Cross-section tool (slice at any Y level)
- Unit tests for noise determinism, height map generation

**Milestone:** Generate and view a 3D voxel terrain from a seed. Slice it open to see the interior. Dashboard shows terrain statistics.

### Phase 2: Underground & Comparison (Target: 1–2 weeks)

**Goal:** Caves, ores, biomes. Side-by-side Layered Perlin vs Domain Warping.

- Domain Warping algorithm (second generation approach)
- Biome system: temperature + humidity noise maps, biome lookup table, surface block assignment
- 3D Perlin cave generation (density threshold method)
- Domain-warped cave generation (winding tunnels)
- Ore placement system with depth ranges, vein sizes, and clustering
- Biome Map visualization mode
- Cave View visualization mode (transparent overworld)
- Ore Map visualization mode
- Side-by-side rendering (two Three.js canvases, same seed)
- Comparison dashboard with per-algorithm metrics
- Underground metrics: cave density, connectivity, ore distribution
- Unit tests for biome assignment, cave carving, ore placement

**Milestone:** Two algorithms compared side-by-side. Biome-colored terrain with different cave structures underneath. Ore veins visible in cross-section. Dashboard shows how the algorithms differ quantitatively.

### Phase 3: Spawn Points & Navigability (Target: 2–3 weeks)

**Goal:** Multi-Pass Sculpting algorithm, spawn placement, navigability analysis, surface decoration.

- Multi-Pass Sculpting algorithm (continent shape → mountains → erosion → caves → biomes)
- Hydraulic erosion simulation (simplified — particle-based, configurable iteration count)
- Agent-based cave worms (random walk carving with branching)
- Surface decoration system (trees, boulders, forageable plants)
- Enemy rift spawn placement (distance rules, biome affinity, terrain suitability)
- Resource node placement (surface forageables, exposed ore nodes)
- Spawn Point visualization mode (glowing markers for rifts and resource nodes)
- Navigability analyzer: sample random paths across surface, compute A* accessibility
- Navigability Overlay visualization mode (green = accessible, red = isolated)
- Playability metrics on dashboard: navigability score, isolated regions, spawn accessibility
- Three-algorithm comparison mode
- Parameter tuner panel with per-algorithm sliders
- Preset save/load for parameter sets
- Unit tests for erosion, spawn placement rules, navigability sampling

**Milestone:** Three algorithms compared. Erosion creates realistic valleys. Enemy rifts and resource nodes placed intelligently. Navigability overlay instantly shows where NPCs can and can't go. Parameter tuning lets you dial in the exact terrain feel you want.

### Phase 4: Spline Control & Analysis (Target: 2–3 weeks)

**Goal:** Fourth algorithm with Minecraft-style multi-noise + spline system. Deep analysis tools.

- Noise Composition with Spline Control algorithm
- Multi-noise field system (continentalness, erosion, peaks/valleys, temperature, humidity, weirdness)
- Spline curve editor UI (drag control points to reshape terrain mapping)
- Cheese/spaghetti/noodle cave systems
- Multi-noise biome selection
- Four-algorithm comparison mode
- Results summary screen (post-generation analysis with best-in-category callouts)
- Head-to-head benchmark: generate 50 worlds per algorithm, aggregate metrics, export as CSV
- Performance profiling: generation time per layer per algorithm
- Terrain comparison overlay: highlight voxels that differ between two algorithms on the same seed
- Chunk independence test: verify each chunk generates the same regardless of neighbor generation order
- Integration with pathfinding sandbox: export generated terrain as a pathfinding scenario

**Milestone:** Four algorithms with the most controllable one (spline-based) producing highly tunable results. Spline editor gives artistic control. Benchmark data shows exactly which algorithm wins on which metrics. Can export terrain to pathfinding sandbox.

### Phase 5: WFC Structures & Export (Target: 3–4 weeks)

**Goal:** Structure generation via WFC, full Shovel Monster export package.

- Wave Function Collapse engine (2D/3D tile-based with adjacency constraints)
- Structure tile set: dungeon rooms, corridors, entrance halls, treasure rooms, boss chambers
- Structure placement: identify valid zones in noise-generated terrain, carve/place WFC structures
- Structure-terrain blending (transition zones at structure boundaries)
- Structure-integrated spawn points (boss rifts in deepest rooms, minor rifts in side rooms)
- Five-algorithm comparison mode (or selectable subset)
- Fly-through tour mode: auto-camera path through interesting terrain features
- Biome atlas: visual reference card showing each biome's characteristics
- Shovel Monster export documentation:
  - C# translation guide for each generation layer
  - Chunk-based streaming generation architecture
  - Noise library interface specification
  - Biome definition data format (ScriptableObject-ready)
  - Ore and spawn placement configuration format
  - Recommended algorithm combination based on benchmark results
  - Performance budgets for real-time chunk generation
- Integration test suite: generate 100 worlds, verify no degenerate terrain (fully flat, fully solid, no caves, disconnected surface)

**Milestone:** WFC structures create compelling points of interest within noise-generated landscapes. Full export package provides a clear blueprint for implementing world generation in Unity/C#. Recommended configuration identified from benchmark data.

---

## File Structure (Planned)

```
voxel-worldgen/
|-- src/
|   |-- world/
|   |   |-- voxel-grid.ts           # Voxel data structure, chunk storage
|   |   |-- chunk.ts                # 16x16x16 chunk
|   |   |-- block-types.ts          # Stone, dirt, grass, sand, water, ores, etc.
|   |   +-- block-registry.ts       # Block type definitions and properties
|   |-- generation/
|   |   |-- generator-interface.ts   # Shared interface all algorithms implement
|   |   |-- layered-perlin.ts        # Algorithm 1: basic Perlin stacking
|   |   |-- domain-warping.ts        # Algorithm 2: warped noise
|   |   |-- multi-pass.ts            # Algorithm 3: sequential sculpting + erosion
|   |   |-- spline-noise.ts          # Algorithm 4: multi-noise + spline mapping
|   |   |-- wfc-hybrid.ts            # Algorithm 5: WFC structures + noise terrain
|   |   |-- layers/
|   |   |   |-- terrain-shape.ts     # Layer 1: height map generation
|   |   |   |-- biome-assignment.ts  # Layer 2: temperature/humidity → biome
|   |   |   |-- cave-carver.ts       # Layer 3: underground caves and tunnels
|   |   |   |-- ore-placement.ts     # Layer 4: resource vein distribution
|   |   |   |-- surface-decoration.ts# Layer 5: trees, boulders, foliage
|   |   |   +-- spawn-placement.ts   # Layer 6: enemy rifts, resource nodes
|   |   +-- erosion/
|   |       |-- hydraulic.ts         # Particle-based hydraulic erosion
|   |       +-- thermal.ts           # Thermal erosion (cliff collapse)
|   |-- wfc/
|   |   |-- wfc-engine.ts            # Wave function collapse solver
|   |   |-- tile-set.ts              # Tile definitions and adjacency rules
|   |   +-- structure-templates.ts   # Dungeon, ruin, cave structure templates
|   |-- analysis/
|   |   |-- terrain-analyzer.ts      # Surface and underground metric computation
|   |   |-- navigability.ts          # A* path sampling for accessibility scoring
|   |   |-- biome-stats.ts           # Biome coverage and fragmentation
|   |   +-- ore-stats.ts             # Ore distribution analysis
|   |-- views/
|   |   |-- MetricsDashboard.tsx     # Default analytics view
|   |   |-- WorldView.tsx            # Three.js 3D terrain rendering
|   |   |-- CrossSection.tsx         # Y-level slice viewer
|   |   |-- ParameterTuner.tsx       # Per-algorithm parameter sliders
|   |   |-- SplineEditor.tsx         # Spline curve editor (Phase 4)
|   |   +-- ResultsSummary.tsx       # Post-generation comparison analysis
|   |-- components/
|   |   |-- TopBar.tsx               # Controls, seed input, algorithm selector
|   |   |-- KPICard.tsx              # Headline stat cards
|   |   |-- CompareTable.tsx         # Algorithm comparison table
|   |   |-- ViewToggle.tsx           # Dashboard vs 3D toggle
|   |   |-- VisualizationMode.tsx    # Natural/Biome/Cave/Ore/Spawn mode switcher
|   |   +-- AlgorithmSelector.tsx    # Choose which algorithms to compare
|   |-- rendering/
|   |   |-- voxel-renderer.ts        # Three.js instanced mesh + greedy meshing
|   |   |-- biome-renderer.ts        # Biome color overlay
|   |   |-- cave-renderer.ts         # Transparent overworld, cave-only view
|   |   |-- ore-renderer.ts          # Ore highlight visualization
|   |   |-- spawn-renderer.ts        # Rift and resource node markers
|   |   |-- cross-section.ts         # Slice plane rendering
|   |   +-- camera-controller.ts     # Orbit, pan, zoom, fly-through
|   |-- store/
|   |   +-- worldgen-store.ts        # Zustand store for generation state
|   |-- utils/
|   |   |-- noise.ts                 # Perlin/simplex/value noise with seed
|   |   |-- spline.ts                # Cubic spline interpolation
|   |   |-- voronoi.ts               # Voronoi cell computation (biomes, mountains)
|   |   |-- priority-queue.ts        # For A* navigability testing
|   |   |-- seed.ts                  # Seeded RNG
|   |   +-- chunk-utils.ts           # Chunk coordinate math
|   |-- App.tsx
|   +-- main.tsx
|-- tests/
|   |-- noise-determinism.test.ts
|   |-- layered-perlin.test.ts
|   |-- domain-warping.test.ts
|   |-- cave-carver.test.ts
|   |-- ore-placement.test.ts
|   |-- spawn-placement.test.ts
|   |-- navigability.test.ts
|   |-- wfc-engine.test.ts
|   +-- benchmarks/
|       +-- worldgen-benchmark.ts    # Automated multi-algorithm comparison
|-- index.html
|-- package.json
|-- tsconfig.json
|-- vitest.config.ts
+-- vite.config.ts
```

---

## Shovel Monster Export Notes

The following systems should be built with Unity/C# portability as a primary concern:

- **Generator Interface:** The shared `IWorldGenerator` interface (accept seed + config, produce voxel grid) maps directly to a C# interface. Each layer is a separate pass that can be swapped or configured independently
- **Noise Library:** Perlin/simplex noise is identical in any language. The seeded noise wrapper should use the same algorithm as Unity's Mathematics package for identical output
- **Chunk Streaming:** Generation must work per-chunk — each 16x16x16 chunk generates independently using only the seed and chunk coordinates. No global state. This enables Unity to generate chunks on demand as the player moves
- **Biome System:** Biome definitions as data (temperature range, humidity range, surface blocks, ore weights, decoration types) map to ScriptableObjects in Unity. The biome lookup table is a simple 2D texture or array
- **Cave Carving:** Both noise-based and agent-based cave systems are language-agnostic. Unity's Job System can parallelize cave carving across chunks
- **Ore Placement:** Depth-based ore tables with vein size distributions become ScriptableObject configurations. Each ore type is a data definition, not code
- **Spawn Placement:** Rift placement rules (distance, biome affinity, accessibility) transfer as configuration data. The placement algorithm runs as a post-processing pass after terrain generation
- **WFC Engine:** The core WFC solver is a standalone algorithm that works identically in C#. Tile sets are data definitions that can be authored in Unity's inspector
- **Erosion:** Hydraulic erosion is the most expensive step and may need to be optional or pre-computed in Unity. The Job System + Burst compiler can help, but real-time erosion during chunk streaming is likely too expensive. Consider running erosion as an offline world-baking step

The key architectural decision for Shovel Monster: **layer-based generation with per-chunk independence.** Each chunk can be generated from just its coordinates and the world seed. Layers run in order (shape → biomes → caves → ores → decoration → spawns) and each layer only reads from previous layers, never writes backward. This enables infinite streaming worlds.

---

## Cross-Sandbox Integration

This sandbox shares infrastructure and can exchange data with the other R&D sandboxes:

- **→ Pathfinding Sandbox:** Export generated terrain as a pathfinding scenario. Test whether NPCs can navigate the world this algorithm produces. The navigability analyzer uses the same A* implementation
- **→ AI Colony:** Generated biomes and resource distributions could feed into AI Colony's world generation, testing whether NPC AI behaves differently on noise-generated vs hand-crafted maps
- **Shared Infrastructure:** Voxel grid data structure, chunk storage, Three.js rendering pipeline, noise library, and seeded RNG are all reusable across sandboxes

---

## Open Questions & Future Ideas

- **Infinite world streaming:** Can the sandbox simulate chunk streaming — generating new chunks as the camera moves — to test generation performance under real-time constraints?
- **Biome-specific underground:** Should each biome have distinct cave aesthetics (ice caves in tundra, lush caves in forest, dry canyons in desert)?
- **Tectonic simulation:** A pre-pass that simulates continental drift to create geologically plausible mountain ranges and coastlines
- **River generation:** Post-process pass that traces water flow from peaks to sea level, carving river valleys
- **Village placement:** Extend spawn placement to include NPC village sites — flat areas near water with defensible terrain
- **Climate simulation:** Wind and rain shadow effects on biome assignment (mountains block moisture, creating deserts on the far side)
- **Difficulty zoning:** Automatically assign difficulty regions based on distance from spawn, terrain hostility, and resource scarcity

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-21 | 1.0 | Initial project plan. Five generation algorithms across five development phases. Six generation layers (terrain, biomes, caves, ores, decoration, spawns). Seven visualization modes. Navigability analysis with pathfinding integration. Terrain analysis metrics for automated comparison. Cross-sandbox integration notes. Shovel Monster export documentation. |
