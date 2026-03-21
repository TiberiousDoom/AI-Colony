import { BlockType } from './block-types.ts'
import { CHUNK_SIZE, localIndex } from './chunk-utils.ts'

const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE // 512

export class Chunk {
  private data: Uint8Array
  private _dirty = false

  constructor() {
    this.data = new Uint8Array(CHUNK_VOLUME)
    // Default to Air (0)
  }

  getBlock(lx: number, ly: number, lz: number): BlockType {
    return this.data[localIndex(lx, ly, lz)] as BlockType
  }

  setBlock(lx: number, ly: number, lz: number, type: BlockType): void {
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

  getMemoryBytes(): number {
    return CHUNK_VOLUME // 1 byte per voxel
  }
}
