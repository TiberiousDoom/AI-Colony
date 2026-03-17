import { BlockType } from './block-types.ts'
import { Chunk } from './chunk.ts'
import { CHUNK_SIZE, worldToChunk, worldToLocal, chunkKey } from './chunk-utils.ts'
import type { VoxelCoord, ChunkCoord } from '../pathfinding/types.ts'

export class VoxelGrid {
  readonly worldSize: number
  private chunks: Map<string, Chunk> = new Map()
  private chunksPerAxis: number

  constructor(worldSize: number = 32) {
    this.worldSize = worldSize
    this.chunksPerAxis = Math.ceil(worldSize / CHUNK_SIZE)
  }

  isInBounds(pos: VoxelCoord): boolean {
    return (
      pos.x >= 0 && pos.x < this.worldSize &&
      pos.y >= 0 && pos.y < this.worldSize &&
      pos.z >= 0 && pos.z < this.worldSize
    )
  }

  private getOrCreateChunk(cc: ChunkCoord): Chunk {
    const key = chunkKey(cc)
    let chunk = this.chunks.get(key)
    if (!chunk) {
      chunk = new Chunk()
      this.chunks.set(key, chunk)
    }
    return chunk
  }

  getChunk(cc: ChunkCoord): Chunk | undefined {
    return this.chunks.get(chunkKey(cc))
  }

  getBlock(pos: VoxelCoord): BlockType {
    if (!this.isInBounds(pos)) return BlockType.Air
    const cc = worldToChunk(pos)
    const chunk = this.chunks.get(chunkKey(cc))
    if (!chunk) return BlockType.Air
    const local = worldToLocal(pos)
    return chunk.getBlock(local.x, local.y, local.z)
  }

  setBlock(pos: VoxelCoord, type: BlockType): void {
    if (!this.isInBounds(pos)) return
    const cc = worldToChunk(pos)
    const chunk = this.getOrCreateChunk(cc)
    const local = worldToLocal(pos)
    chunk.setBlock(local.x, local.y, local.z, type)
  }

  getDirtyChunks(): ChunkCoord[] {
    const dirty: ChunkCoord[] = []
    for (const [key, chunk] of this.chunks) {
      if (chunk.dirty) {
        const parts = key.split(',')
        dirty.push({
          cx: parseInt(parts[0]),
          cy: parseInt(parts[1]),
          cz: parseInt(parts[2]),
        })
      }
    }
    return dirty
  }

  clearDirtyFlags(): void {
    for (const chunk of this.chunks.values()) {
      chunk.clearDirty()
    }
  }

  get chunkCount(): number {
    return this.chunks.size
  }

  getMemoryBytes(): number {
    let total = 0
    for (const chunk of this.chunks.values()) {
      total += chunk.getMemoryBytes()
    }
    return total
  }
}
