/**
 * VillageRenderer: orchestrates all sub-renderers for a single village viewport.
 */

import { Container, Graphics } from 'pixi.js'
import type { VillageState } from '../simulation/competition-engine.ts'
import type { Season } from '../simulation/villager.ts'
import type { TimeOfDay } from '../simulation/actions.ts'
import { Camera } from './camera.ts'
import { TileRenderer } from './tile-renderer.ts'
import { VillagerRenderer } from './villager-renderer.ts'
import { StructureRenderer } from './structure-renderer.ts'
import { StockpileRenderer } from './stockpile-renderer.ts'
import { LightingOverlay } from './lighting.ts'
import { Minimap } from './minimap.ts'
import type { SpriteManager } from './sprite-manager.ts'
import { getStockpileCap } from '../simulation/structures.ts'

const TILE_SIZE = 16
const MINIMAP_SIZE = 96
const MINIMAP_MARGIN = 8

export class VillageRenderer {
  readonly rootContainer: Container
  readonly camera: Camera
  private tileRenderer: TileRenderer
  private villagerRenderer: VillagerRenderer
  private structureRenderer: StructureRenderer
  private stockpileRenderer: StockpileRenderer
  private lighting: LightingOverlay
  private minimap: Minimap
  private clipMask: Graphics
  private initialized = false
  private viewportWidth = 0
  private viewportHeight = 0

  constructor(
    spriteManager: SpriteManager,
    villageTint: number,
    worldWidth: number,
    worldHeight: number,
  ) {
    this.rootContainer = new Container()
    this.camera = new Camera(worldWidth, worldHeight, TILE_SIZE)

    this.tileRenderer = new TileRenderer(spriteManager, TILE_SIZE)
    this.villagerRenderer = new VillagerRenderer(spriteManager, TILE_SIZE, villageTint)
    this.structureRenderer = new StructureRenderer(spriteManager, TILE_SIZE)
    this.stockpileRenderer = new StockpileRenderer(TILE_SIZE)
    this.lighting = new LightingOverlay(0, 0) // Resized during init
    this.minimap = new Minimap(worldWidth, worldHeight, (wx, wy) => {
      this.camera.centerOn(wx, wy)
    }, MINIMAP_SIZE)
    this.clipMask = new Graphics()
  }

  /** Initialize within the shared canvas */
  init(viewportX: number, viewportWidth: number, viewportHeight: number): void {
    this.viewportWidth = viewportWidth
    this.viewportHeight = viewportHeight
    this.rootContainer.x = viewportX

    // Clip mask for viewport
    this.clipMask.clear()
    this.clipMask.rect(0, 0, viewportWidth, viewportHeight).fill(0xffffff)
    this.rootContainer.mask = this.clipMask
    this.rootContainer.addChild(this.clipMask)

    // World content container (transformed by camera)
    const worldContainer = new Container()
    worldContainer.addChild(this.tileRenderer.container)
    worldContainer.addChild(this.structureRenderer.container)
    worldContainer.addChild(this.stockpileRenderer.container)
    worldContainer.addChild(this.villagerRenderer.container)
    this.rootContainer.addChild(worldContainer)

    // Lighting overlay (screen-space, not transformed by camera)
    this.lighting.resize(viewportWidth, viewportHeight)
    this.rootContainer.addChild(this.lighting.container)

    // Minimap (screen-space, bottom-left)
    this.minimap.container.x = MINIMAP_MARGIN
    this.minimap.container.y = viewportHeight - MINIMAP_SIZE - MINIMAP_MARGIN
    this.rootContainer.addChild(this.minimap.container)

    this.initialized = true
  }

  /** Full render update from village state */
  render(village: VillageState, timeOfDay: TimeOfDay, season: Season, tickProgress: number, deltaMs: number, currentTick: number): void {
    if (!this.initialized) return

    // Initialize tiles on first render or world change
    if (!this.tileRenderer.container.children.length) {
      this.tileRenderer.setWorld(village.world, village.campfirePosition)
    }

    // Update camera transform on all world-space renderers
    this.tileRenderer.updateCamera(this.camera, this.viewportWidth, this.viewportHeight)

    // Apply same transform to other world-space containers
    const t = this.camera.getTransform(this.viewportWidth, this.viewportHeight)
    this.structureRenderer.container.x = t.x
    this.structureRenderer.container.y = t.y
    this.structureRenderer.container.scale.set(t.scale)
    this.stockpileRenderer.container.x = t.x
    this.stockpileRenderer.container.y = t.y
    this.stockpileRenderer.container.scale.set(t.scale)
    this.villagerRenderer.container.x = t.x
    this.villagerRenderer.container.y = t.y
    this.villagerRenderer.container.scale.set(t.scale)

    // Update sub-renderers
    this.tileRenderer.updateTiles(village.world)
    this.tileRenderer.applySeason(season, village.world)
    this.villagerRenderer.update(village.villagers, tickProgress, currentTick)
    this.structureRenderer.update(village.structures)
    this.stockpileRenderer.update(village.stockpile, village.campfirePosition, getStockpileCap(village.structures))
    this.lighting.update(timeOfDay, village.campfirePosition, this.camera, TILE_SIZE, deltaMs)
    this.minimap.update(
      village.world, village.villagers, village.structures,
      village.campfirePosition, this.villagerRenderer.container.tint || 0x3b82f6,
      this.camera, this.viewportWidth, this.viewportHeight, currentTick,
    )

    this.camera.clamp(this.viewportWidth, this.viewportHeight)
  }

  /** Handle resize */
  resize(viewportX: number, viewportWidth: number, viewportHeight: number): void {
    this.viewportWidth = viewportWidth
    this.viewportHeight = viewportHeight
    this.rootContainer.x = viewportX

    this.clipMask.clear()
    this.clipMask.rect(0, 0, viewportWidth, viewportHeight).fill(0xffffff)
    this.lighting.resize(viewportWidth, viewportHeight)
    this.minimap.container.y = viewportHeight - MINIMAP_SIZE - MINIMAP_MARGIN
  }

  /** Get villager ID at screen coordinates (relative to this viewport) */
  hitTest(localX: number, localY: number): string | null {
    const world = this.camera.screenToWorld(localX, localY, this.viewportWidth, this.viewportHeight)
    return this.villagerRenderer.getVillagerAt(world.x, world.y)
  }

  /** Get all villager IDs for keyboard cycling */
  getVillagerIds(): string[] {
    return this.villagerRenderer.getVillagerIds()
  }

  setSelectedVillager(id: string | null): void {
    this.villagerRenderer.setSelected(id)
  }

  destroy(): void {
    this.tileRenderer.destroy()
    this.villagerRenderer.destroy()
    this.structureRenderer.destroy()
    this.stockpileRenderer.destroy()
    this.lighting.destroy()
    this.minimap.destroy()
    this.rootContainer.destroy({ children: true })
  }
}
