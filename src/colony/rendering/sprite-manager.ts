/**
 * SpriteManager: provides textures by name, generating procedural fallbacks.
 */

import { Texture, type Renderer } from 'pixi.js'
import { generateAllTextures, SPRITE_NAMES } from './sprite-generator.ts'

export class SpriteManager {
  private textures: Map<string, Texture> = new Map()
  private _initialized = false

  /** Generate all procedural textures using the app's renderer */
  init(renderer: Renderer): void {
    this.textures = generateAllTextures(renderer) as Map<string, Texture>
    this._initialized = true
  }

  /** Get a texture by frame name */
  getTexture(name: string): Texture {
    return this.textures.get(name) ?? Texture.WHITE
  }

  get isInitialized(): boolean {
    return this._initialized
  }

  /** All registered sprite names */
  get names(): readonly string[] {
    return SPRITE_NAMES
  }

  destroy(): void {
    for (const tex of this.textures.values()) {
      tex.destroy(true)
    }
    this.textures.clear()
    this._initialized = false
  }
}
