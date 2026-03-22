import { WorldgenBlockType } from './block-types.ts'
import { CHUNK_VOLUME, localIndex } from './chunk-utils.ts'

export class WorldgenChunk {
  private data: Uint8Array
  private _dirty = false

  constructor() {
    this.data = new Uint8Array(CHUNK_VOLUME)
  }

  getBlock(lx: number, ly: number, lz: number): WorldgenBlockType {
    return this.data[localIndex(lx, ly, lz)] as WorldgenBlockType
  }

  setBlock(lx: number, ly: number, lz: number, type: WorldgenBlockType): void {
    const idx = localIndex(lx, ly, lz)
    if (this.data[idx] !== type) {
      this.data[idx] = type
      this._dirty = true
    }
  }

  get dirty(): boolean {
    return this._dirty
  }

  clearDirty(): void {
    this._dirty = false
  }

  markDirty(): void {
    this._dirty = true
  }
}
