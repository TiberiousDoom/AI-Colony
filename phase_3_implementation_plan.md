# Phase 3: Visual Layer — Implementation Plan

**Version:** 1.0
**Date:** March 4, 2026
**Goal:** Add a pixel art simulation view as a toggle alongside the metrics dashboard. PixiJS rendering with terrain, villagers, structures, day/night, seasons, inspector, and minimap.

---

## Overview

Phase 3 adds the visual simulation view described in the master plan (Section 2: "Simulation View"). This transforms AI Colony from a data-only dashboard into a dual-view experience where users can watch villages in real time as pixel art simulations or analyze them as metrics.

Key deliverables:

1. **PixiJS rendering pipeline** — Tile grid, villager sprites, structures, resources rendered via PixiJS
2. **Sprite asset pipeline** — `free-tex-packer-cli` workflow to pack 16×16 PNGs into sprite sheets
3. **Camera controls** — Independent pan/zoom per village canvas
4. **Side-by-side dual canvas** — Two village worlds rendered simultaneously
5. **Day/night overlay** — Darken + blue tint at night, brighten during day
6. **Seasonal palette** — Green → gold → brown → white palette shifts per season
7. **Villager inspector** — Click a villager to see needs, action, and AI decision rationale
8. **Minimap** — Per-village overview showing population density and resource distribution
9. **View toggle** — Shared top bar to switch between metrics dashboard and simulation view

**Key architectural note:** The rendering layer is entirely read-only — it observes `CompetitionState` from the Zustand store and renders it. No simulation logic lives in the rendering layer. The existing `src/simulation/` and `src/utils/` directories remain DOM-free (enforced by `tests/dom-free.test.ts`). All PixiJS code lives in a new `src/rendering/` directory.

The plan is organized into 12 implementation steps across 5 blocks.

---

## Current State (Phase 2 Delivered)

| Component | Status | Key Files |
|-----------|--------|-----------|
| Competition engine | Dual-village with mirrored worlds | `competition-engine.ts` (683 lines) |
| Simulation engine | 30 ticks/day, seasons, warmth, structures | `simulation-engine.ts` (552 lines) |
| World generation | 64×64 noise-based, 5 tile types, blight | `world.ts` (310 lines) |
| Villager system | 4 needs, 12 actions, population growth | `villager.ts` (207 lines) |
| Action system | forage, eat, rest, chop, haul, fish, mine, build×2, warm_up, flee, idle | `actions.ts` (325 lines) |
| AI systems | Utility AI + Behavior Tree AI | `utility-ai.ts` (297 lines), `behavior-tree-ai.ts` (321 lines) |
| Store | Zustand with CompetitionEngine, rAF game loop | `simulation-store.ts` (163 lines) |
| Dashboard | Dual-village KPIs, overlaid charts, event log, quick-compare | `MetricsDashboard.tsx` (255 lines) |
| Save/Load | Serialization to localStorage | `serialization.ts` (143 lines) |
| Tests | 20 files, 217 tests, all passing | `tests/` |

**Phase 3 hooks already in code:**
- `CompetitionState.villages[].world.tiles[][]` exposes the full tile grid for rendering
- `Villager.position`, `Villager.path`, `Villager.currentAction` are available for sprite positioning and animation
- `CompetitionState.timeOfDay` and `CompetitionState.season` are available for visual overlays
- `IAISystem.decide()` returns `AIDecision.reason` string for inspector display
- `AIWorldView` is a read-only snapshot perfect for rendering consumption
- `VillageState.structures[]` with position data for structure rendering
- `Tile.type`, `Tile.resourceAmount` for terrain and resource visualization
- `package.json` does NOT yet include PixiJS (listed in master plan tech stack but not installed in Phase 1)

---

## Implementation Blocks

### Block A: Rendering Infrastructure
Steps 1–2. Install PixiJS, set up the rendering pipeline, create the sprite asset system.

### Block B: World & Entity Rendering
Steps 3–5. Tile map rendering, villager sprites with animation, structure and resource rendering.

### Block C: Visual Effects
Steps 6–7. Day/night overlay and seasonal palette changes.

### Block D: Dual Canvas & Interaction
Steps 8–10. Side-by-side village canvases, villager inspector panel, minimap.

### Block E: Integration & Testing
Steps 11–12. View toggle, acceptance criteria, and tests.

---

## Step 1: PixiJS Setup & Rendering Architecture

**Goal:** Install PixiJS, create the core rendering abstraction, and establish the rendering pipeline pattern.

### Design

The rendering layer is a pure observer of simulation state. It reads `CompetitionState` from the Zustand store and draws it. The rendering lifecycle is:

1. Store updates `competitionState` (via game loop)
2. React component detects state change
3. React passes state to PixiJS renderer
4. PixiJS updates sprites/positions/tints

PixiJS Application instances are managed as refs inside React components. This avoids re-creating the WebGL context on re-renders. The React component handles:
- Creating/destroying the PixiJS Application
- Passing state updates to the renderer
- Handling DOM events (click, wheel, drag) and forwarding them to the camera/inspector

### Dependencies

```bash
npm install pixi.js
```

PixiJS v8+ uses the modern `Application` API with `await app.init()`. The rendering system targets WebGL2 with Canvas fallback.

### New files

**`src/rendering/types.ts`** (new file)
```typescript
import type { VillageState, CompetitionState } from '../simulation/competition-engine.ts'

/** Configuration for a single village renderer */
export interface VillageRendererConfig {
  villageId: string
  width: number       // Canvas width in pixels
  height: number      // Canvas height in pixels
  tileSize: number    // Rendered tile size in pixels (default: 16, scaled by zoom)
}

/** Camera state for pan/zoom */
export interface CameraState {
  x: number           // Camera center in world coordinates
  y: number           // Camera center in world coordinates
  zoom: number        // Zoom level (1.0 = 1 pixel per tile pixel, 2.0 = 2x zoom)
  minZoom: number
  maxZoom: number
}

/** Which villager (if any) is selected in the inspector */
export interface InspectorSelection {
  villagerId: string
  villageId: string
}
```

**`src/rendering/camera.ts`** (new file)
```typescript
export class Camera {
  x: number
  y: number
  zoom: number
  readonly minZoom: number
  readonly maxZoom: number

  constructor(worldWidth: number, worldHeight: number, tileSize: number)

  /** Convert screen coordinates to world tile coordinates */
  screenToWorld(screenX: number, screenY: number, canvasWidth: number, canvasHeight: number): { x: number; y: number }

  /** Convert world coordinates to screen coordinates */
  worldToScreen(worldX: number, worldY: number, canvasWidth: number, canvasHeight: number): { x: number; y: number }

  /** Pan by screen-space delta */
  pan(dx: number, dy: number): void

  /** Zoom toward a screen-space point */
  zoomAt(screenX: number, screenY: number, delta: number, canvasWidth: number, canvasHeight: number): void

  /** Clamp camera to world bounds */
  clamp(worldWidth: number, worldHeight: number, canvasWidth: number, canvasHeight: number): void

  /** Get the visible tile range for culling */
  getVisibleBounds(canvasWidth: number, canvasHeight: number, tileSize: number): {
    minTileX: number; maxTileX: number; minTileY: number; maxTileY: number
  }
}
```

**`src/rendering/sprite-manager.ts`** (new file)

Manages sprite sheet loading and frame lookup. Provides a unified API for getting textures by name. Falls back to procedural textures if the sprite sheet hasn't loaded yet.

```typescript
import { Assets, Texture, Rectangle } from 'pixi.js'

export class SpriteManager {
  private textures: Map<string, Texture> = new Map()
  private loaded: boolean = false

  /** Load the packed sprite sheet atlas */
  async load(): Promise<void>

  /** Get a texture by frame name (e.g., 'terrain_forest', 'villager_walk_0') */
  getTexture(name: string): Texture

  /** Generate a procedural fallback texture (colored rectangle) */
  private createFallback(name: string): Texture

  /** Is the sprite sheet loaded? */
  get isLoaded(): boolean
}
```

### Files to modify

**`package.json`**
- Add `pixi.js` to dependencies

### Tests to write

**`tests/camera.test.ts`** (new file)
- Screen-to-world coordinate conversion at zoom 1.0
- Screen-to-world at zoom 2.0
- World-to-screen round-trips correctly
- Pan updates camera position
- Zoom at center maintains center point
- Zoom at edge shifts camera appropriately
- Clamp prevents camera from leaving world bounds
- Visible bounds calculation returns correct tile range
- Visible bounds expand when zoomed out, shrink when zoomed in

---

## Step 2: Sprite Asset Pipeline

**Goal:** Set up `free-tex-packer-cli` and create the initial set of 16×16 placeholder sprites.

### Design

The master plan specifies using `free-tex-packer-cli` as a dev dependency. Individual 16×16 PNG source files are packed into a sprite sheet with a JSON atlas. PixiJS loads the atlas via `Assets.load()`.

**Sprite inventory for Phase 3:**

| Category | Sprites | Count |
|----------|---------|-------|
| Terrain | grass, forest, stone, water, fertile_soil, campfire | 6 |
| Villager walk | walk_0, walk_1, walk_2, walk_3 | 4 |
| Villager work | work_0, work_1, work_2, work_3 | 4 |
| Villager rest | rest_0, rest_1, rest_2, rest_3 | 4 |
| Villager flee | flee_0, flee_1, flee_2, flee_3 | 4 |
| Structures | shelter, storage | 2 |
| Resources | food_pile, wood_pile, stone_pile | 3 |
| UI | selection_ring, minimap_dot | 2 |
| **Total** | | **29** |

A single 256×256 sprite sheet accommodates all 29 frames (256÷16 = 16 frames per row, 16×16 = 256 possible frames).

**Placeholder sprite style:** Simple, recognizable shapes using flat colors. Each sprite is a 16×16 PNG with transparency. These are functional placeholders — real pixel art can replace them later by dropping new PNGs in the source folder and re-running the packer.

### Design decisions

**Committed packed output:** Per the master plan: "The packed output (`src/assets/sprites/packed/`) should be committed to git rather than treated as a generated artifact — this way the project works immediately after cloning without requiring the packer to be run first."

**Programmatic sprite generation:** Since we don't have an artist, we'll create a small Node.js script (`scripts/generate-placeholders.ts`) that generates the 16×16 PNG source files programmatically using basic Canvas API operations. This script is a dev tool, not part of the runtime. It generates recognizable placeholder art:
- Terrain: flat fills with minimal detail (forest = dark green with light center "tree crown", stone = gray with dark cracks, water = blue with lighter wave lines)
- Villagers: 8×8 body centered in the 16×16 frame, head above, legs below. Walk frames shift legs. Color: warm tan/brown
- Structures: triangular roof for shelter, box shape for storage
- Resources: small piles with appropriate coloring

### New files

**`scripts/generate-placeholders.ts`** (new file)
- Uses Node.js `canvas` package (dev dependency) to generate 16×16 PNGs
- Outputs to `src/assets/sprites/source/`
- Run manually: `npx tsx scripts/generate-placeholders.ts`

**`src/assets/sprites/source/`** — directory of individual 16×16 PNGs (generated, committed)

**`src/assets/sprites/packed/`** — sprite sheet + JSON atlas (generated, committed)

### Dependencies

```bash
npm install --save-dev free-tex-packer-cli canvas
```

### Package.json script

```json
{
  "pack-sprites": "free-tex-packer-cli --project src/assets/sprites/source/ --output src/assets/sprites/packed/"
}
```

### Tests to write

**`tests/sprite-manager.test.ts`** (new file)
- SpriteManager provides fallback textures when atlas not loaded
- Texture names follow the naming convention
- All expected frame names are defined in the sprite inventory constant

---

## Step 3: Tile Map Renderer

**Goal:** Render the 64×64 tile grid for a single village with camera pan/zoom.

### Design

The tile map is the base rendering layer. Each tile is a 16×16 sprite from the sprite sheet (or a fallback colored rectangle). Tiles are created once when the world is first rendered and updated only when tile state changes (resource depletion, blight).

**Rendering approach:**
- Create a `Container` holding all tile sprites
- Position each sprite at `(tileX * tileSize, tileY * tileSize)`
- Apply camera transform to the container (position + scale)
- Cull tiles outside the visible viewport for performance
- Resource depletion is shown via alpha: `alpha = 0.4 + 0.6 * (resourceAmount / maxResource)` for harvestable tiles

**Campfire rendering:** The campfire position gets a special sprite (warm orange glow effect using a tinted sprite or simple overlay).

### New files

**`src/rendering/tile-renderer.ts`** (new file)
```typescript
import { Container, Sprite } from 'pixi.js'
import type { World } from '../simulation/world.ts'
import type { SpriteManager } from './sprite-manager.ts'
import type { Camera } from './camera.ts'
import type { Position, Season } from '../simulation/villager.ts'

export class TileRenderer {
  readonly container: Container
  private tileSprites: Sprite[][]
  private world: World | null = null

  constructor(spriteManager: SpriteManager, tileSize: number)

  /** Create tile sprites for a world (called once on init or world change) */
  setWorld(world: World, campfirePosition: Position): void

  /** Update tile visuals (resource depletion, blight) */
  updateTiles(world: World): void

  /** Apply seasonal tint to terrain sprites */
  applySeason(season: Season): void

  /** Update camera transform (position + zoom) */
  updateCamera(camera: Camera, canvasWidth: number, canvasHeight: number): void

  /** Dispose all sprites */
  destroy(): void
}
```

### Tests to write

**`tests/tile-renderer.test.ts`** (new file)
- Creates correct number of tile sprites (64×64 = 4096)
- Tile sprites positioned at correct world coordinates
- Resource depletion reduces tile alpha
- Blighted tiles render with zero alpha
- Campfire tile uses campfire texture
- updateCamera applies correct transform to container

---

## Step 4: Villager Sprites & Animation System

**Goal:** Render villagers as animated sprites that move along their paths and play action-appropriate animations.

### Design

Each alive villager gets an `AnimatedSprite` (or a `Sprite` with manual frame cycling). The animation state maps to the villager's `currentAction`:

| Action | Animation | Notes |
|--------|-----------|-------|
| `idle` | rest_0 (static) | Standing still |
| `forage`, `chop_wood`, `mine_stone`, `fish` | work_0..3 (loop) | Gathering actions |
| `eat`, `rest`, `warm_up` | rest_0..3 (loop) | Restful actions |
| `haul`, walking to target | walk_0..3 (loop) | Moving |
| `flee` | flee_0..3 (loop, faster) | Running away |
| `build_shelter`, `build_storage` | work_0..3 (loop) | Construction |

**Movement interpolation:** Villagers move tile-by-tile per tick. Between ticks, the renderer interpolates position using `lerp(prevPosition, currentPosition, tickProgress)` where `tickProgress` is derived from the elapsed time since the last tick. This creates smooth movement instead of teleporting tile-to-tile.

**Villager coloring:** Each village has a color (blue #3b82f6 for Utility AI, orange #f97316 for BT). Villager sprites are tinted with their village color so you can tell which village they belong to on the shared canvas (and later in Phase 6 shared world mode).

**Dead villagers:** Removed from the sprite layer. A brief fade-out animation (0.5s alpha reduction) when a villager dies provides visual feedback.

**Health indicator:** A 1-pixel-high colored bar above each villager sprite shows relative health. Green > 50, yellow 25–50, red < 25. Only visible when zoomed in enough (zoom > 1.5).

### New files

**`src/rendering/villager-renderer.ts`** (new file)
```typescript
import { Container, Sprite } from 'pixi.js'
import type { Villager, VillagerAction } from '../simulation/villager.ts'
import type { SpriteManager } from './sprite-manager.ts'

/** Maps action to animation name */
export function actionToAnimation(action: VillagerAction): string

export class VillagerRenderer {
  readonly container: Container
  private sprites: Map<string, { sprite: Sprite; prevX: number; prevY: number; animation: string; frame: number; frameTick: number }>

  constructor(spriteManager: SpriteManager, tileSize: number, villageTint: number)

  /** Sync villager sprites with current state (add new, remove dead, update positions) */
  update(villagers: ReadonlyArray<Readonly<Villager>>, tickProgress: number): void

  /** Get villager at screen position (for click detection) */
  getVillagerAt(worldX: number, worldY: number): string | null

  /** Highlight selected villager */
  setSelected(villagerId: string | null): void

  /** Dispose all sprites */
  destroy(): void
}
```

**`src/rendering/animation.ts`** (new file)
```typescript
/** Animation definitions: frame names, speed, looping */
export interface AnimationDef {
  frames: string[]       // Sprite frame names
  speed: number          // Ticks per frame
  loop: boolean
}

export const ANIMATIONS: Record<string, AnimationDef> = {
  walk:  { frames: ['villager_walk_0', 'villager_walk_1', 'villager_walk_2', 'villager_walk_3'], speed: 4, loop: true },
  work:  { frames: ['villager_work_0', 'villager_work_1', 'villager_work_2', 'villager_work_3'], speed: 6, loop: true },
  rest:  { frames: ['villager_rest_0', 'villager_rest_1', 'villager_rest_2', 'villager_rest_3'], speed: 8, loop: true },
  flee:  { frames: ['villager_flee_0', 'villager_flee_1', 'villager_flee_2', 'villager_flee_3'], speed: 2, loop: true },
  idle:  { frames: ['villager_rest_0'], speed: 1, loop: false },
  death: { frames: ['villager_rest_0'], speed: 1, loop: false },
}

/** Advance animation by one render frame, return current frame name */
export function tickAnimation(animation: string, currentFrame: number, frameTick: number): { frame: number; frameTick: number; textureName: string }
```

### Tests to write

**`tests/animation.test.ts`** (new file)
- actionToAnimation maps all 12 action types correctly
- Walk animation cycles through 4 frames
- Flee animation cycles faster than walk
- Rest animation loops at slower speed
- Idle animation stays on frame 0
- tickAnimation advances frame at correct rate
- tickAnimation loops when loop=true
- All animation frame names exist in sprite inventory

---

## Step 5: Structure & Resource Rendering

**Goal:** Render built structures and resource indicators (carried items, stockpile size).

### Design

**Structures:** Each structure in `VillageState.structures[]` gets a sprite placed at its `position`. Structure sprites are static (no animation).

| Structure | Sprite Name | Visual |
|-----------|-------------|--------|
| Shelter | `structure_shelter` | Small triangular roof, warm brown |
| Storage | `structure_storage` | Rectangular box, darker brown |

**Stockpile visualization:** Near the campfire, render a small visual indicator of resource levels. Three small colored dots/bars showing relative food (green), wood (brown), and stone (gray) levels. These use simple `Graphics` primitives, not sprites.

**Carried resources:** When a villager has `carrying !== null`, render a small colored dot on the villager sprite to indicate they're hauling:
- Food: green dot
- Wood: brown dot
- Stone: gray dot

### New files

**`src/rendering/structure-renderer.ts`** (new file)
```typescript
import { Container, Sprite } from 'pixi.js'
import type { Structure } from '../simulation/structures.ts'
import type { SpriteManager } from './sprite-manager.ts'

export class StructureRenderer {
  readonly container: Container

  constructor(spriteManager: SpriteManager, tileSize: number)

  /** Sync structure sprites with current state */
  update(structures: ReadonlyArray<Readonly<Structure>>): void

  destroy(): void
}
```

**`src/rendering/stockpile-renderer.ts`** (new file)
```typescript
import { Container, Graphics } from 'pixi.js'
import type { VillageStockpile, Position } from '../simulation/villager.ts'

export class StockpileRenderer {
  readonly container: Container

  constructor(tileSize: number)

  /** Update stockpile visual near campfire */
  update(stockpile: Readonly<VillageStockpile>, campfirePosition: Position, stockpileCap: number): void

  destroy(): void
}
```

### Tests to write

No dedicated tests — structure rendering is tested visually and via integration in the village renderer test.

---

## Step 6: Day/Night Visual Overlay

**Goal:** Simple day/night lighting that makes daytime bright and night dark with a blue tint.

### Design

A full-screen semi-transparent rectangle overlays the entire village canvas.

| Time of Day | Overlay | Effect |
|-------------|---------|--------|
| Day | None (alpha 0) | Full brightness |
| Night | Dark blue (#0a1628) at alpha 0.45 | Darkened with blue tint |

**Transition:** When `timeOfDay` changes, animate the overlay alpha over ~0.3 seconds using a simple linear interpolation. This prevents the jarring instant switch.

**Campfire glow:** During night, render a small radial gradient (orange → transparent) around the campfire position. This uses a `Graphics` circle with alpha gradient, providing a warm glow that contrasts with the blue night overlay. Radius: ~3 tiles.

### New files

**`src/rendering/lighting.ts`** (new file)
```typescript
import { Container, Graphics } from 'pixi.js'
import type { TimeOfDay } from '../simulation/actions.ts'
import type { Position } from '../simulation/villager.ts'

export class LightingOverlay {
  readonly container: Container

  constructor(canvasWidth: number, canvasHeight: number)

  /** Update overlay based on time of day (with smooth transition) */
  update(timeOfDay: TimeOfDay, campfirePosition: Position, camera: Camera, tileSize: number, deltaMs: number): void

  /** Resize overlay when canvas size changes */
  resize(canvasWidth: number, canvasHeight: number): void

  destroy(): void
}
```

### Tests to write

**`tests/lighting.test.ts`** (new file)
- Day time overlay has alpha 0
- Night time overlay has alpha 0.45
- Transition interpolates smoothly between states
- Campfire glow renders at correct world position

---

## Step 7: Seasonal Visual Changes

**Goal:** Terrain color shifts per season, making the visual world feel alive.

### Design

Each season applies a different tint/palette to terrain tiles:

| Season | Grass Tint | Forest Tint | Ground Feel | Notes |
|--------|-----------|-------------|-------------|-------|
| Spring | Fresh green (#66cc66) | Bright green (#339933) | Vibrant | Growth bonus visual |
| Summer | Standard green (#55aa55) | Standard (#2d8a2d) | Normal | Baseline |
| Autumn | Gold/amber (#ccaa44) | Orange/brown (#aa6633) | Warm | Harvest feel |
| Winter | White/pale (#ccccdd) | Dark gray-green (#556655) | Muted, cold | Sparse |

**Implementation:** The `TileRenderer.applySeason()` method applies a `tint` property to each tile sprite based on its type and the current season. The tint is multiplied with the base sprite color. Using `Sprite.tint` is efficient — it's a GPU operation.

**Water:** Water tiles don't change tint with seasons (always blue). This is intentional — water is a consistent visual anchor.

**Transition:** Season changes are instant (no smooth blend). The master plan doesn't specify transitions and seasons change once per 7 days, so the instant switch is acceptable.

### Files to modify

**`src/rendering/tile-renderer.ts`**
- Implement `applySeason(season)` using per-tile-type tint maps
- Called each frame when season changes

### Constants

**`src/rendering/palette.ts`** (new file)
```typescript
import type { Season } from '../simulation/villager.ts'
import { TileType } from '../simulation/world.ts'

/** Tint color per tile type per season (hex numbers for PixiJS Sprite.tint) */
export const SEASONAL_TINTS: Record<Season, Partial<Record<TileType, number>>> = {
  spring: {
    [TileType.Grass]: 0x66cc66,
    [TileType.Forest]: 0x339933,
    [TileType.FertileSoil]: 0x8b7355,
  },
  summer: {
    [TileType.Grass]: 0x55aa55,
    [TileType.Forest]: 0x2d8a2d,
    [TileType.FertileSoil]: 0x7a6644,
  },
  autumn: {
    [TileType.Grass]: 0xccaa44,
    [TileType.Forest]: 0xaa6633,
    [TileType.FertileSoil]: 0x997744,
  },
  winter: {
    [TileType.Grass]: 0xccccdd,
    [TileType.Forest]: 0x556655,
    [TileType.FertileSoil]: 0xaaaaaa,
  },
}

/** Village identification colors */
export const VILLAGE_COLORS = {
  utility: 0x3b82f6,   // Blue
  bt: 0xf97316,        // Orange
} as const
```

### Tests to write

**`tests/palette.test.ts`** (new file)
- All four seasons have tint definitions
- All terrain tile types have seasonal tints
- Tint values are valid hex numbers
- Water has no seasonal tint (stays blue)

---

## Step 8: Village Canvas Component (Side-by-Side)

**Goal:** Create the React component that hosts a PixiJS canvas for one village, then compose two side-by-side.

### Design

Each village gets its own `<VillageCanvas>` React component containing:
- A PixiJS `Application` instance (created via ref)
- Its own `Camera` instance for independent pan/zoom
- A `TileRenderer`, `VillagerRenderer`, `StructureRenderer`, `StockpileRenderer`, and `LightingOverlay`
- Mouse/touch event handlers for:
  - **Pan:** Middle-click drag or touch drag
  - **Zoom:** Mouse wheel or pinch gesture
  - **Click:** Left-click to select villager (opens inspector)

The `<SimulationView>` component composes two `<VillageCanvas>` components side by side, each rendering one `VillageState`. It also holds the inspector panel and minimaps.

**Layout:**
```
+-----------------------------+-----------------------------+
|       Village A Canvas      |       Village B Canvas      |
|    (pan/zoom independent)   |    (pan/zoom independent)   |
|                             |                             |
+----------+------------------+----------+------------------+
| Minimap A|                  | Minimap B|                  |
+----------+                  +----------+                  |
+-----------------------------------------------------------+
|                    Inspector Panel                        |
+-----------------------------------------------------------+
```

**Responsive sizing:** Each canvas takes 50% of available width. Height is the remaining space below the top bar. The inspector panel overlays from the bottom when a villager is selected.

### New files

**`src/rendering/village-renderer.ts`** (new file)

The orchestrator that wires together all sub-renderers for a single village.

```typescript
import { Application, Container } from 'pixi.js'
import type { VillageState } from '../simulation/competition-engine.ts'
import type { Season } from '../simulation/villager.ts'
import type { TimeOfDay } from '../simulation/actions.ts'
import { Camera } from './camera.ts'
import { TileRenderer } from './tile-renderer.ts'
import { VillagerRenderer } from './villager-renderer.ts'
import { StructureRenderer } from './structure-renderer.ts'
import { StockpileRenderer } from './stockpile-renderer.ts'
import { LightingOverlay } from './lighting.ts'
import type { SpriteManager } from './sprite-manager.ts'

export class VillageRenderer {
  readonly app: Application
  readonly camera: Camera
  private tileRenderer: TileRenderer
  private villagerRenderer: VillagerRenderer
  private structureRenderer: StructureRenderer
  private stockpileRenderer: StockpileRenderer
  private lighting: LightingOverlay
  private currentSeason: Season | null = null
  private initialized: boolean = false

  constructor(spriteManager: SpriteManager, villageTint: number, tileSize?: number)

  /** Initialize the PixiJS application (async — WebGL context creation) */
  async init(canvas: HTMLCanvasElement): Promise<void>

  /** Full render update from village state */
  render(village: VillageState, timeOfDay: TimeOfDay, season: Season, tickProgress: number, deltaMs: number): void

  /** Handle resize */
  resize(width: number, height: number): void

  /** Get villager ID at screen coordinates */
  hitTest(screenX: number, screenY: number): string | null

  /** Destroy all resources */
  destroy(): void
}
```

**`src/components/VillageCanvas.tsx`** (new file)

React wrapper that manages a `VillageRenderer` lifecycle.

```typescript
interface VillageCanvasProps {
  village: VillageState
  timeOfDay: TimeOfDay
  season: Season
  villageTint: number
  spriteManager: SpriteManager
  onVillagerClick?: (villagerId: string) => void
}
```

**`src/views/SimulationView.tsx`** (new file)

Top-level simulation view composing two `VillageCanvas` components, minimaps, and the inspector panel.

```typescript
export function SimulationView(): JSX.Element
```

### Files to modify

**`src/store/simulation-store.ts`**
- Add `tickProgress: number` to store (0–1 fraction within current tick, for interpolation)
- Updated during game loop: `tickProgress = accumulator / TICK_INTERVAL_MS`

### Tests to write

**`tests/village-renderer.test.ts`** (new file)
- VillageRenderer creates all sub-renderers
- Camera responds to pan/zoom inputs
- hitTest returns correct villager ID
- Render doesn't crash with empty village (all dead)
- Render handles season change

---

## Step 9: Villager Inspector Panel

**Goal:** Click a villager to see their needs, current action, and AI decision rationale.

### Design

The inspector is a React overlay panel that appears at the bottom of the simulation view when a villager is clicked. It shows:

**Header:**
- Villager name, village name (color-coded)
- Current action with progress bar (`actionTicksRemaining / getEffectiveDuration`)

**Needs bars:**
- Four horizontal bars: Hunger, Energy, Health, Warmth
- Color-coded: green (>60), yellow (25–60), red (<25)
- Numeric value displayed on each bar

**AI Decision Rationale:**
- **Utility AI:** The `reason` string from `AIDecision` (e.g., "forage: 0.82 (hunger urgency)"). Additionally, display the top 5 scored actions with their scores as a ranked list. This requires extending the Utility AI to optionally expose its scoring breakdown.
- **Behavior Tree:** The `reason` string (e.g., "Critical Needs > hunger < 25 > eat"). Display the active BT path as a breadcrumb trail.

**Position info:**
- Current tile coordinates
- Target position (if moving)
- Carrying (if hauling)

**Close behavior:** Clicking the same villager again, clicking empty space, or pressing Escape closes the inspector.

### Design decision: AI scoring exposure

To show Utility AI scores in the inspector, we need access to the scoring breakdown — not just the final decision. Rather than modifying `IAISystem.decide()` (which would affect all AI systems), we add an optional `getLastScores()` method to the AI interface:

```typescript
export interface IAISystem {
  readonly name: string
  decide(villager, worldView, rng): AIDecision
  /** Optional: return scoring breakdown from the last decide() call (for inspector display) */
  getLastScores?(): Array<{ action: string; score: number; reason: string }>
}
```

This is optional — only Utility AI implements it. BT AI returns the tree path via the `reason` string.

### New files

**`src/components/VillagerInspector.tsx`** (new file)
```typescript
interface VillagerInspectorProps {
  villager: Villager
  villageName: string
  villageColor: string
  aiName: string
  /** Last AI scores (Utility AI only) */
  scores?: Array<{ action: string; score: number; reason: string }>
  onClose: () => void
}

export function VillagerInspector(props: VillagerInspectorProps): JSX.Element
```

**`src/components/NeedBar.tsx`** (new file)
```typescript
interface NeedBarProps {
  label: string
  value: number
  max: number
}

export function NeedBar({ label, value, max }: NeedBarProps): JSX.Element
```

### Files to modify

**`src/simulation/ai/ai-interface.ts`**
- Add optional `getLastScores?()` to `IAISystem`

**`src/simulation/ai/utility-ai.ts`**
- Store the scoring breakdown from the last `decide()` call
- Implement `getLastScores()` returning the stored breakdown

**`src/views/SimulationView.tsx`**
- Track selected villager state
- Pass inspector props when a villager is selected

### Tests to write

**`tests/villager-inspector.test.ts`** (new file, DOM test with jsdom)
- Renders villager name and village name
- Shows 4 need bars with correct values
- Need bars color correctly (green/yellow/red)
- Shows current action
- Shows AI reason string
- Closes when onClose is called
- Utility AI scores displayed as ranked list
- BT AI shows reason as breadcrumb

---

## Step 10: Minimap

**Goal:** Small overview per village showing terrain, population density, and resource distribution.

### Design

Each village gets a minimap in the bottom-left corner of its canvas area. The minimap is a small canvas (`96×96 pixels` for the 64×64 world — each tile is 1.5px) rendered separately from the main viewport.

**Rendering:**
- Terrain: 1.5×1.5 pixel blocks colored by tile type (simplified: green for grass/forest, gray for stone, blue for water, brown for fertile)
- Villagers: bright colored dots (village color) at their positions
- Structures: slightly brighter pixels at structure positions
- Campfire: small white dot at campfire position
- Viewport box: white outline rectangle showing the main camera's current view bounds

**Update frequency:** The minimap re-renders every 10 ticks (roughly 3 times per day) to avoid per-tick overhead. Population positions update at this rate too.

**Implementation:** The minimap uses a separate PixiJS `Container` with `Graphics` objects, not individual sprites (at this scale, sprites would be overkill).

### New files

**`src/rendering/minimap.ts`** (new file)
```typescript
import { Container, Graphics } from 'pixi.js'
import type { World } from '../simulation/world.ts'
import type { Villager, Position } from '../simulation/villager.ts'
import type { Structure } from '../simulation/structures.ts'
import type { Camera } from './camera.ts'

export class Minimap {
  readonly container: Container
  private readonly size: number      // Minimap size in pixels
  private readonly worldWidth: number
  private readonly worldHeight: number

  constructor(worldWidth: number, worldHeight: number, size?: number)

  /** Render minimap from current state */
  update(
    world: World,
    villagers: ReadonlyArray<Readonly<Villager>>,
    structures: ReadonlyArray<Readonly<Structure>>,
    campfirePosition: Position,
    villageColor: number,
    camera: Camera,
    mainCanvasWidth: number,
    mainCanvasHeight: number,
  ): void

  destroy(): void
}
```

### Tests to write

**`tests/minimap.test.ts`** (new file)
- Minimap renders at correct size
- Terrain colors map correctly to tile types
- Villager dots appear at correct scaled positions
- Viewport rectangle reflects camera bounds
- Update can be called repeatedly without memory leak

---

## Step 11: View Toggle & Integration

**Goal:** Toggle between metrics dashboard and simulation view via the shared top bar.

### Design

Add a view toggle to the `TopBar` component. The toggle switches the main content area between `MetricsDashboard` and `SimulationView`. Both views share the same top bar (controls, speed, seed, season display).

**Toggle behavior:**
- Default view: Metrics Dashboard (per master plan: "Stealth Mode")
- Toggle button: icon-style button in the top bar showing current view mode
- State managed in the simulation store as `viewMode: 'metrics' | 'simulation'`
- Switching views does NOT pause the simulation — it continues running
- PixiJS resources are created lazily (only when simulation view is first opened) and retained when switching back to metrics to avoid WebGL context recreation overhead

**Lazy initialization:** The `SpriteManager` loads the sprite atlas on first view switch. A loading indicator ("Loading sprites...") is shown while the atlas loads. Subsequent view switches are instant.

### Files to modify

**`src/store/simulation-store.ts`**
- Add `viewMode: 'metrics' | 'simulation'` to store state
- Add `setViewMode(mode)` action
- Add `tickProgress: number` for render interpolation (if not added in Step 8)

**`src/App.tsx`**
- Conditionally render `MetricsDashboard` or `SimulationView` based on `viewMode`
- Create `SpriteManager` instance at app level (shared between both canvases)
- Handle sprite loading state

**`src/components/TopBar.tsx`**
- Add view toggle button (left side, near title)
- Button label: "Chart" / "Sim" or icon-based toggle
- Active view highlighted

**`src/components/ViewToggle.tsx`** (new file)
```typescript
interface ViewToggleProps {
  viewMode: 'metrics' | 'simulation'
  onToggle: (mode: 'metrics' | 'simulation') => void
}

export function ViewToggle({ viewMode, onToggle }: ViewToggleProps): JSX.Element
```

### Tests to write

**`tests/view-toggle.test.ts`** (new file, DOM test with jsdom)
- Toggle switches between 'metrics' and 'simulation'
- Default view is 'metrics'
- Toggling does not affect isRunning state
- View mode persists across renders

---

## Step 12: Acceptance Criteria & Testing

**Goal:** Ensure all Phase 3 features work correctly and Phase 1+2 tests still pass.

### New acceptance checks to add to `src/utils/acceptance-checks.ts`

**Rendering checks:**
- [ ] PixiJS canvas initializes without errors
- [ ] Tile grid renders for both villages
- [ ] Villager sprites appear and animate
- [ ] Structures render at correct positions
- [ ] Day/night overlay toggles correctly
- [ ] Seasonal tints change each season
- [ ] Camera pan/zoom works independently per village

**Inspector checks:**
- [ ] Clicking a villager opens the inspector
- [ ] Inspector shows needs, action, and AI rationale
- [ ] Inspector closes on click-away or Escape
- [ ] Utility AI shows scoring breakdown
- [ ] BT AI shows active tree path

**Minimap checks:**
- [ ] Minimap renders terrain overview
- [ ] Minimap shows villager positions
- [ ] Minimap viewport rectangle matches camera

**Integration checks:**
- [ ] View toggle switches between metrics and simulation
- [ ] Simulation continues running across view switches
- [ ] Both villages render side by side
- [ ] Sprint sheet loads correctly

### Phase 1+2 regression

**`tests/dom-free.test.ts`**
- Add new rendering files to the DOM-free check EXCLUSION list (rendering files ARE allowed to use DOM/PixiJS)
- Verify that `src/simulation/` and `src/utils/` files remain DOM-free
- Add `src/rendering/` files to a new "rendering-layer" validation that verifies they don't import from `src/simulation/` in ways that would create circular dependencies

### New test files

**`tests/rendering-integration.test.ts`** (new file)
- Sprite inventory covers all required frame names
- Camera coordinate transforms are consistent
- Animation system maps all action types
- Palette covers all seasons and relevant tile types
- All rendering modules can be imported without errors

---

## Dependency Graph

```
Step 1: PixiJS Setup & Rendering Architecture
  ↓
Step 2: Sprite Asset Pipeline  ←  depends on PixiJS setup
  ↓
Step 3: Tile Map Renderer  ←  depends on sprites + camera
  ↓
Step 4: Villager Sprites & Animation  ←  depends on tile renderer (layering)
  ↓
Step 5: Structure & Resource Rendering  ←  depends on tile renderer
  ↓
Step 6: Day/Night Overlay  ←  depends on tile renderer (overlay on top)
  ↓
Step 7: Seasonal Palette  ←  depends on tile renderer (tint system)
  ↓
Step 8: Village Canvas (Side-by-Side)  ←  depends on ALL renderers above
  ├─→ Step 9: Villager Inspector  ←  depends on village canvas (click handling)
  └─→ Step 10: Minimap  ←  depends on village canvas (positioning)
  ↓
Step 11: View Toggle & Integration  ←  depends on village canvas + inspector + minimap
  ↓
Step 12: Acceptance & Testing  ←  depends on everything
```

Note: Steps 6 (day/night) and 7 (seasons) are independent of each other and can be parallelized. Steps 9 (inspector) and 10 (minimap) are independent and can be parallelized.

---

## New File Summary

| File | Purpose | Approx Size |
|------|---------|-------------|
| `src/rendering/types.ts` | Rendering type definitions | ~30 lines |
| `src/rendering/camera.ts` | Camera pan/zoom/coordinate transforms | ~120 lines |
| `src/rendering/sprite-manager.ts` | Sprite sheet loading and fallback textures | ~100 lines |
| `src/rendering/tile-renderer.ts` | Tile grid rendering with resource depletion | ~150 lines |
| `src/rendering/villager-renderer.ts` | Villager sprite management and interpolation | ~180 lines |
| `src/rendering/animation.ts` | Animation definitions and frame advancement | ~80 lines |
| `src/rendering/structure-renderer.ts` | Structure sprite rendering | ~60 lines |
| `src/rendering/stockpile-renderer.ts` | Stockpile visual near campfire | ~50 lines |
| `src/rendering/lighting.ts` | Day/night overlay with campfire glow | ~100 lines |
| `src/rendering/palette.ts` | Seasonal tint constants and village colors | ~50 lines |
| `src/rendering/village-renderer.ts` | Orchestrator wiring all sub-renderers | ~200 lines |
| `src/rendering/minimap.ts` | Minimap overview renderer | ~120 lines |
| `src/views/SimulationView.tsx` | Top-level simulation view layout | ~150 lines |
| `src/components/VillageCanvas.tsx` | React wrapper for PixiJS village canvas | ~180 lines |
| `src/components/VillagerInspector.tsx` | Inspector panel for selected villager | ~200 lines |
| `src/components/NeedBar.tsx` | Horizontal need bar component | ~40 lines |
| `src/components/ViewToggle.tsx` | Metrics/Simulation view switcher | ~50 lines |
| `scripts/generate-placeholders.ts` | Placeholder sprite generator script | ~200 lines |
| `src/assets/sprites/source/*.png` | 29 individual 16×16 PNGs | (binary) |
| `src/assets/sprites/packed/*` | Sprite sheet + JSON atlas | (binary) |
| `tests/camera.test.ts` | Camera coordinate/zoom tests | ~80 lines |
| `tests/sprite-manager.test.ts` | Sprite loading/fallback tests | ~40 lines |
| `tests/tile-renderer.test.ts` | Tile grid rendering tests | ~60 lines |
| `tests/animation.test.ts` | Animation system tests | ~60 lines |
| `tests/lighting.test.ts` | Day/night overlay tests | ~40 lines |
| `tests/palette.test.ts` | Seasonal tint tests | ~30 lines |
| `tests/minimap.test.ts` | Minimap rendering tests | ~40 lines |
| `tests/villager-inspector.test.ts` | Inspector panel DOM tests | ~80 lines |
| `tests/view-toggle.test.ts` | View toggle DOM tests | ~30 lines |
| `tests/village-renderer.test.ts` | Village renderer integration tests | ~60 lines |
| `tests/rendering-integration.test.ts` | Cross-cutting rendering tests | ~50 lines |

**Total new files:** ~31 (including assets)
**Total estimated new code:** ~2,600 lines (TypeScript/TSX)
**Files to modify:** ~5 existing files (`package.json`, `App.tsx`, `TopBar.tsx`, `simulation-store.ts`, `ai-interface.ts`, `utility-ai.ts`)

---

## Key Design Decisions

### 1. Procedural fallback sprites

The `SpriteManager` always works — even if the sprite sheet fails to load. It generates solid-colored `Texture` objects as fallbacks. This means the simulation view is functional immediately during development, and real pixel art can be swapped in at any time.

### 2. Independent camera per village

Each village canvas has its own `Camera` instance. Users can zoom into one village while the other stays zoomed out. This is important for inspection — you might want to closely watch one village's response to an event while keeping the other in overview.

### 3. Rendering layer reads only

The rendering layer never writes to simulation state. It reads `CompetitionState` and renders it. This maintains the DOM-free guarantee for `src/simulation/` and keeps the rendering layer swappable (a future Phase could replace PixiJS with a different renderer).

### 4. Tick interpolation for smooth movement

The store tracks `tickProgress` (0–1 within the current tick). The villager renderer lerps positions between the previous tick and current tick using this value. At 1× speed (1 tick/second), this makes villager movement smooth rather than snapping tile-to-tile once per second.

### 5. Lazy sprite loading

Sprites are loaded only when the simulation view is first opened. Users who only use the metrics dashboard never pay the cost of loading PixiJS textures. This keeps the initial load fast.

### 6. Minimap as Canvas primitive graphics

The minimap uses PixiJS `Graphics` (rectangles and dots) rather than individual sprites. At 1.5px per tile, sprites would be wasteful. Graphics primitives are batched efficiently and render the whole minimap in a single draw call.

---

## Milestone Deliverable

> Full dual-view experience. Metrics dashboard as default, toggle to watch the villages visually. Click villagers to see their AI thinking in real time.

When Phase 3 is complete:
- User clicks "Sim" toggle to switch from the metrics dashboard to the simulation view
- Two village worlds rendered side-by-side as 16×16 pixel art tile grids via PixiJS
- Villagers animate: walking between tiles, working at resources, resting, fleeing from predators
- Structures (shelters, storage) appear on the map when built
- Day/night cycle darkens the world at night with a blue tint; campfire glows
- Seasons change the visual palette: vibrant spring → warm autumn → cold white winter
- Camera pans (drag) and zooms (scroll wheel) independently per village
- Clicking a villager opens an inspector showing needs bars, current action, and AI decision rationale (Utility AI shows scores, BT shows tree path)
- Minimap in each village corner shows terrain, villager positions, and camera viewport
- All 217+ existing Phase 1+2 tests still pass, ~30 new rendering/UI tests added
- The simulation continues running smoothly while switching between views
