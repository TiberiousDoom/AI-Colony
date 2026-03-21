/**
 * Minimap: small overview of terrain, villagers, structures, and camera viewport.
 * Supports click-to-pan.
 */

import { Container, Graphics } from 'pixi.js'
import type { World } from '../simulation/world.ts'
import { TileType } from '../simulation/world.ts'
import type { Villager, Position } from '../simulation/villager.ts'
import type { Structure } from '../simulation/structures.ts'
import type { Camera } from './camera.ts'

const TILE_COLORS: Record<TileType, number> = {
  [TileType.Grass]: 0x55aa55,
  [TileType.Forest]: 0x2d8a2d,
  [TileType.Stone]: 0x888888,
  [TileType.Water]: 0x4488cc,
  [TileType.FertileSoil]: 0x7a6644,
}

export class Minimap {
  readonly container: Container
  private readonly size: number
  private readonly worldWidth: number
  private readonly worldHeight: number
  private readonly terrainGfx: Graphics
  private readonly entitiesGfx: Graphics
  private readonly viewportGfx: Graphics
  private readonly bgGfx: Graphics
  private onPan: (worldX: number, worldY: number) => void
  private lastRenderTick = -1

  constructor(worldWidth: number, worldHeight: number, onPan: (worldX: number, worldY: number) => void, size = 96) {
    this.worldWidth = worldWidth
    this.worldHeight = worldHeight
    this.size = size
    this.onPan = onPan

    this.container = new Container()
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'

    // Background border
    this.bgGfx = new Graphics()
    this.bgGfx.rect(-1, -1, size + 2, size + 2).fill(0x000000)
    this.container.addChild(this.bgGfx)

    this.terrainGfx = new Graphics()
    this.entitiesGfx = new Graphics()
    this.viewportGfx = new Graphics()
    this.container.addChild(this.terrainGfx)
    this.container.addChild(this.entitiesGfx)
    this.container.addChild(this.viewportGfx)

    // Click-to-pan
    let dragging = false
    const handlePan = (e: { global: { x: number; y: number } }) => {
      const local = this.container.toLocal(e.global)
      const wx = Math.floor((local.x / this.size) * this.worldWidth)
      const wy = Math.floor((local.y / this.size) * this.worldHeight)
      this.onPan(wx, wy)
    }

    this.container.on('pointerdown', (e) => {
      dragging = true
      handlePan(e)
    })
    this.container.on('pointermove', (e) => {
      if (dragging) handlePan(e)
    })
    this.container.on('pointerup', () => { dragging = false })
    this.container.on('pointerupoutside', () => { dragging = false })
  }

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
    currentTick: number,
  ): void {
    // Only re-render terrain every 10 ticks
    const shouldRenderTerrain = this.lastRenderTick === -1 || currentTick - this.lastRenderTick >= 10
    if (shouldRenderTerrain) {
      this.lastRenderTick = currentTick
      this.renderTerrain(world)
      this.renderEntities(villagers, structures, campfirePosition, villageColor)
    }

    // Viewport rect always updates (camera may have moved)
    this.renderViewport(camera, mainCanvasWidth, mainCanvasHeight)
  }

  private renderTerrain(world: World): void {
    this.terrainGfx.clear()
    const tileW = this.size / this.worldWidth
    const tileH = this.size / this.worldHeight

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const tile = world.tiles[y][x]
        const color = TILE_COLORS[tile.type] ?? 0x55aa55
        this.terrainGfx.rect(x * tileW, y * tileH, tileW, tileH).fill(color)
      }
    }
  }

  private renderEntities(
    villagers: ReadonlyArray<Readonly<Villager>>,
    structures: ReadonlyArray<Readonly<Structure>>,
    campfirePosition: Position,
    villageColor: number,
  ): void {
    this.entitiesGfx.clear()
    const tileW = this.size / this.worldWidth
    const tileH = this.size / this.worldHeight

    // Structures (slightly brighter)
    for (const s of structures) {
      this.entitiesGfx.rect(s.position.x * tileW, s.position.y * tileH, tileW * 1.5, tileH * 1.5).fill(0xaaaaaa)
    }

    // Campfire
    this.entitiesGfx.circle(
      (campfirePosition.x + 0.5) * tileW,
      (campfirePosition.y + 0.5) * tileH,
      tileW,
    ).fill(0xffffff)

    // Villagers
    for (const v of villagers) {
      if (!v.alive) continue
      this.entitiesGfx.circle(
        (v.position.x + 0.5) * tileW,
        (v.position.y + 0.5) * tileH,
        tileW * 0.8,
      ).fill(villageColor)
    }
  }

  private renderViewport(camera: Camera, canvasWidth: number, canvasHeight: number): void {
    this.viewportGfx.clear()
    const tileW = this.size / this.worldWidth
    const tileH = this.size / this.worldHeight
    const bounds = camera.getVisibleBounds(canvasWidth, canvasHeight)

    const rx = bounds.minTileX * tileW
    const ry = bounds.minTileY * tileH
    const rw = (bounds.maxTileX - bounds.minTileX + 1) * tileW
    const rh = (bounds.maxTileY - bounds.minTileY + 1) * tileH

    this.viewportGfx.rect(rx, ry, rw, rh).stroke({ width: 1, color: 0xffffff })
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
