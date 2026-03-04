/**
 * TileRenderer: renders the 64x64 tile grid using PixiJS sprites.
 */

import { Container, Sprite } from 'pixi.js'
import type { World } from '../simulation/world.ts'
import { TileType } from '../simulation/world.ts'
import type { SpriteManager } from './sprite-manager.ts'
import type { Camera } from './camera.ts'
import type { Position, Season } from '../simulation/villager.ts'
import { getTileTint } from './palette.ts'

const TILE_TYPE_TO_SPRITE: Record<TileType, string> = {
  [TileType.Grass]: 'terrain_grass',
  [TileType.Forest]: 'terrain_forest',
  [TileType.Stone]: 'terrain_stone',
  [TileType.Water]: 'terrain_water',
  [TileType.FertileSoil]: 'terrain_fertile',
}

export class TileRenderer {
  readonly container: Container
  private tileSprites: Sprite[][] = []
  private spriteManager: SpriteManager
  private tileSize: number
  private currentSeason: Season | null = null

  constructor(spriteManager: SpriteManager, tileSize: number) {
    this.spriteManager = spriteManager
    this.tileSize = tileSize
    this.container = new Container()
    this.container.cullable = true
  }

  /** Create tile sprites for a world (called once on init or world change) */
  setWorld(world: World, campfirePosition: Position): void {
    // Clear existing
    this.container.removeChildren()
    this.tileSprites = []

    for (let y = 0; y < world.height; y++) {
      const row: Sprite[] = []
      for (let x = 0; x < world.width; x++) {
        const tile = world.tiles[y][x]
        const isCampfire = x === campfirePosition.x && y === campfirePosition.y
        const texName = isCampfire ? 'terrain_campfire' : TILE_TYPE_TO_SPRITE[tile.type]
        const sprite = new Sprite(this.spriteManager.getTexture(texName))
        sprite.x = x * this.tileSize
        sprite.y = y * this.tileSize
        sprite.width = this.tileSize
        sprite.height = this.tileSize

        // Resource depletion alpha
        if (!isCampfire && tile.maxResource > 0) {
          sprite.alpha = 0.4 + 0.6 * (tile.resourceAmount / tile.maxResource)
        }

        this.container.addChild(sprite)
        row.push(sprite)
      }
      this.tileSprites.push(row)
    }
  }

  /** Update only dirty tiles (resource depletion, blight) */
  updateTiles(world: World): void {
    if (world.dirtyTiles.size === 0) return

    for (const key of world.dirtyTiles) {
      const [xStr, yStr] = key.split(',')
      const x = parseInt(xStr, 10)
      const y = parseInt(yStr, 10)
      const sprite = this.tileSprites[y]?.[x]
      if (!sprite) continue
      const tile = world.tiles[y][x]
      if (tile.maxResource > 0) {
        sprite.alpha = 0.4 + 0.6 * (tile.resourceAmount / tile.maxResource)
      }
    }
    world.dirtyTiles.clear()
  }

  /** Apply seasonal tint to terrain sprites */
  applySeason(season: Season, world: World): void {
    if (season === this.currentSeason) return
    this.currentSeason = season

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const tile = world.tiles[y][x]
        const sprite = this.tileSprites[y]?.[x]
        if (sprite) {
          sprite.tint = getTileTint(tile.type, season)
        }
      }
    }
  }

  /** Update camera transform (position + zoom) */
  updateCamera(camera: Camera, canvasWidth: number, canvasHeight: number): void {
    const t = camera.getTransform(canvasWidth, canvasHeight)
    this.container.x = t.x
    this.container.y = t.y
    this.container.scale.set(t.scale)
  }

  destroy(): void {
    this.container.destroy({ children: true })
    this.tileSprites = []
  }
}
