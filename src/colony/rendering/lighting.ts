/**
 * LightingOverlay: day/night visual overlay with campfire glow.
 */

import { Container, Graphics } from 'pixi.js'
import type { TimeOfDay } from '../simulation/actions.ts'
import type { Position } from '../simulation/villager.ts'
import type { Camera } from './camera.ts'

const NIGHT_ALPHA = 0.45
const NIGHT_COLOR = 0x0a1628
const TRANSITION_SPEED = 0.01 // alpha per ms (~0.3s for full transition)

export class LightingOverlay {
  readonly container: Container
  private overlay: Graphics
  private campfireGlow: Graphics
  private currentAlpha = 0
  private targetAlpha = 0
  private canvasWidth: number
  private canvasHeight: number

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth
    this.canvasHeight = canvasHeight
    this.container = new Container()

    this.overlay = new Graphics()
    this.campfireGlow = new Graphics()

    this.container.addChild(this.overlay)
    this.container.addChild(this.campfireGlow)

    this.drawOverlay()
  }

  private drawOverlay(): void {
    this.overlay.clear()
    this.overlay.rect(0, 0, this.canvasWidth, this.canvasHeight).fill(NIGHT_COLOR)
    this.overlay.alpha = this.currentAlpha
  }

  /** Update overlay based on time of day (with smooth transition) */
  update(timeOfDay: TimeOfDay, campfirePosition: Position, camera: Camera, tileSize: number, deltaMs: number): void {
    this.targetAlpha = timeOfDay === 'night' ? NIGHT_ALPHA : 0

    // Smooth transition
    if (this.currentAlpha !== this.targetAlpha) {
      const step = TRANSITION_SPEED * deltaMs
      if (this.currentAlpha < this.targetAlpha) {
        this.currentAlpha = Math.min(this.targetAlpha, this.currentAlpha + step)
      } else {
        this.currentAlpha = Math.max(this.targetAlpha, this.currentAlpha - step)
      }
      this.overlay.alpha = this.currentAlpha
    }

    // Campfire glow (visible at night)
    this.campfireGlow.clear()
    if (this.currentAlpha > 0.05) {
      const t = camera.getTransform(this.canvasWidth, this.canvasHeight)
      const cx = (campfirePosition.x + 0.5) * tileSize * t.scale + t.x
      const cy = (campfirePosition.y + 0.5) * tileSize * t.scale + t.y
      const radius = 3 * tileSize * t.scale

      // Radial glow layers
      this.campfireGlow.circle(cx, cy, radius).fill({ color: 0xff6600, alpha: 0.08 })
      this.campfireGlow.circle(cx, cy, radius * 0.6).fill({ color: 0xffaa00, alpha: 0.12 })
      this.campfireGlow.circle(cx, cy, radius * 0.3).fill({ color: 0xffdd44, alpha: 0.15 })
    }
  }

  /** Resize overlay when canvas size changes */
  resize(canvasWidth: number, canvasHeight: number): void {
    this.canvasWidth = canvasWidth
    this.canvasHeight = canvasHeight
    this.drawOverlay()
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
