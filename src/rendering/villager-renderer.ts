/**
 * VillagerRenderer: animated villager sprites with position interpolation.
 */

import { Container, Sprite, Graphics } from 'pixi.js'
import type { Villager } from '../simulation/villager.ts'
import type { SpriteManager } from './sprite-manager.ts'
import { actionToAnimation, tickAnimation } from './animation.ts'

interface VillagerSprite {
  sprite: Sprite
  healthBar: Graphics
  prevX: number
  prevY: number
  animation: string
  frame: number
  frameTick: number
  fadeAlpha: number // 1 = alive, fading to 0 = dying
  lastTick: number
}

export class VillagerRenderer {
  readonly container: Container
  private sprites: Map<string, VillagerSprite> = new Map()
  private spriteManager: SpriteManager
  private tileSize: number
  private villageTint: number
  private selectedId: string | null = null
  private selectionRing: Sprite | null = null

  constructor(spriteManager: SpriteManager, tileSize: number, villageTint: number) {
    this.spriteManager = spriteManager
    this.tileSize = tileSize
    this.villageTint = villageTint
    this.container = new Container()
  }

  /** Sync villager sprites with current state */
  update(villagers: ReadonlyArray<Readonly<Villager>>, tickProgress: number, currentTick: number): void {
    const aliveIds = new Set<string>()

    for (const v of villagers) {
      aliveIds.add(v.id)
      let entry = this.sprites.get(v.id)

      if (!entry) {
        // New villager — create sprite
        const sprite = new Sprite(this.spriteManager.getTexture('villager_rest_0'))
        sprite.width = this.tileSize
        sprite.height = this.tileSize
        sprite.tint = this.villageTint
        sprite.anchor.set(0.5, 0.5)

        const healthBar = new Graphics()
        this.container.addChild(sprite)
        this.container.addChild(healthBar)

        entry = {
          sprite,
          healthBar,
          prevX: v.position.x,
          prevY: v.position.y,
          animation: 'idle',
          frame: 0,
          frameTick: 0,
          fadeAlpha: 1,
          lastTick: currentTick,
        }
        this.sprites.set(v.id, entry)
      }

      // Snapshot prevPosition when tick advances
      if (currentTick !== entry.lastTick) {
        entry.prevX = entry.sprite.x / this.tileSize - 0.5
        entry.prevY = entry.sprite.y / this.tileSize - 0.5
        entry.lastTick = currentTick
      }

      if (!v.alive) {
        // Fade out dead villagers
        entry.fadeAlpha = Math.max(0, entry.fadeAlpha - 0.05)
        entry.sprite.alpha = entry.fadeAlpha
        entry.healthBar.visible = false
        if (entry.fadeAlpha <= 0) {
          this.removeVillager(v.id)
          aliveIds.delete(v.id)
        }
        continue
      }

      // Interpolate position
      const lerpX = entry.prevX + (v.position.x - entry.prevX) * tickProgress
      const lerpY = entry.prevY + (v.position.y - entry.prevY) * tickProgress
      entry.sprite.x = (lerpX + 0.5) * this.tileSize
      entry.sprite.y = (lerpY + 0.5) * this.tileSize

      // Update animation
      const newAnim = actionToAnimation(v.currentAction)
      if (newAnim !== entry.animation) {
        entry.animation = newAnim
        entry.frame = 0
        entry.frameTick = 0
      }
      const animResult = tickAnimation(entry.animation, entry.frame, entry.frameTick)
      entry.frame = animResult.frame
      entry.frameTick = animResult.frameTick
      entry.sprite.texture = this.spriteManager.getTexture(animResult.textureName)

      // Health bar
      const healthNeed = v.needs.get('health')
      if (healthNeed) {
        const ratio = healthNeed.current / healthNeed.max
        const barWidth = this.tileSize * 0.8
        const barHeight = 2
        entry.healthBar.clear()
        // Background
        entry.healthBar.rect(0, 0, barWidth, barHeight).fill(0x333333)
        // Fill
        const color = ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xcccc44 : 0xcc4444
        entry.healthBar.rect(0, 0, barWidth * ratio, barHeight).fill(color)
        entry.healthBar.x = entry.sprite.x - barWidth / 2
        entry.healthBar.y = entry.sprite.y - this.tileSize / 2 - 4
        entry.healthBar.visible = true
      }

      // Carried resource indicator
      if (v.carrying) {
        const dotColor = v.carrying.type === 'food' ? 0x44aa44 : v.carrying.type === 'wood' ? 0x8b4513 : 0x888888
        entry.sprite.tint = dotColor // Slightly tint when carrying
      } else {
        entry.sprite.tint = this.villageTint
      }
    }

    // Remove sprites for villagers no longer in the list
    for (const [id] of this.sprites) {
      if (!aliveIds.has(id)) {
        this.removeVillager(id)
      }
    }

    // Update selection ring
    this.updateSelectionRing()
  }

  private removeVillager(id: string): void {
    const entry = this.sprites.get(id)
    if (entry) {
      this.container.removeChild(entry.sprite)
      this.container.removeChild(entry.healthBar)
      entry.sprite.destroy()
      entry.healthBar.destroy()
      this.sprites.delete(id)
    }
  }

  private updateSelectionRing(): void {
    if (this.selectedId) {
      const entry = this.sprites.get(this.selectedId)
      if (entry) {
        if (!this.selectionRing) {
          this.selectionRing = new Sprite(this.spriteManager.getTexture('selection_ring'))
          this.selectionRing.anchor.set(0.5, 0.5)
          this.selectionRing.width = this.tileSize * 1.4
          this.selectionRing.height = this.tileSize * 1.4
          this.container.addChild(this.selectionRing)
        }
        this.selectionRing.x = entry.sprite.x
        this.selectionRing.y = entry.sprite.y
        this.selectionRing.visible = true
      }
    } else if (this.selectionRing) {
      this.selectionRing.visible = false
    }
  }

  /** Get villager at world coordinates (for click detection) */
  getVillagerAt(worldX: number, worldY: number): string | null {
    const tileX = Math.floor(worldX / this.tileSize)
    const tileY = Math.floor(worldY / this.tileSize)

    for (const [id, entry] of this.sprites) {
      const vx = Math.floor(entry.sprite.x / this.tileSize)
      const vy = Math.floor(entry.sprite.y / this.tileSize)
      if (Math.abs(vx - tileX) <= 0 && Math.abs(vy - tileY) <= 0) {
        return id
      }
    }
    return null
  }

  /** Highlight selected villager */
  setSelected(villagerId: string | null): void {
    this.selectedId = villagerId
  }

  /** Get all villager IDs in order for keyboard cycling */
  getVillagerIds(): string[] {
    return [...this.sprites.keys()]
  }

  destroy(): void {
    this.container.destroy({ children: true })
    this.sprites.clear()
  }
}
