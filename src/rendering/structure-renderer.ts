/**
 * StructureRenderer: renders built structures on the map.
 */

import { Container, Sprite } from 'pixi.js'
import type { Structure } from '../simulation/structures.ts'
import type { SpriteManager } from './sprite-manager.ts'

export class StructureRenderer {
  readonly container: Container
  private sprites: Map<string, Sprite> = new Map()
  private spriteManager: SpriteManager
  private tileSize: number

  constructor(spriteManager: SpriteManager, tileSize: number) {
    this.spriteManager = spriteManager
    this.tileSize = tileSize
    this.container = new Container()
  }

  /** Sync structure sprites with current state */
  update(structures: ReadonlyArray<Readonly<Structure>>): void {
    const activeKeys = new Set<string>()

    for (const s of structures) {
      const key = `${s.type}_${s.position.x}_${s.position.y}`
      activeKeys.add(key)

      if (!this.sprites.has(key)) {
        const texName = s.type === 'shelter' ? 'structure_shelter' : 'structure_storage'
        const sprite = new Sprite(this.spriteManager.getTexture(texName))
        sprite.x = s.position.x * this.tileSize
        sprite.y = s.position.y * this.tileSize
        sprite.width = this.tileSize
        sprite.height = this.tileSize
        this.container.addChild(sprite)
        this.sprites.set(key, sprite)
      }
    }

    // Remove sprites for structures that no longer exist
    for (const [key, sprite] of this.sprites) {
      if (!activeKeys.has(key)) {
        this.container.removeChild(sprite)
        sprite.destroy()
        this.sprites.delete(key)
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true })
    this.sprites.clear()
  }
}
