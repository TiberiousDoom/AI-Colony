import { WorldgenBlockType } from './block-types.ts'
import { WorldgenChunk } from './chunk.ts'
import { worldToChunk, worldToLocal, chunkKey } from './chunk-utils.ts'
import type { VoxelCoord, ChunkCoord } from '../../shared/types.ts'

export class WorldgenGrid {
  readonly worldWidth: number
  readonly worldHeight: number
  readonly worldDepth: number
  private chunks: Map<string, WorldgenChunk> = new Map()

  constructor(worldWidth: number = 128, worldHeight: number = 64, worldDepth: number = 128) {
    this.worldWidth = worldWidth
    this.worldHeight = worldHeight
    this.worldDepth = worldDepth
  }

  isInBounds(pos: VoxelCoord): boolean {
    return (
      pos.x >= 0 && pos.x < this.worldWidth &&
      pos.y >= 0 && pos.y < this.worldHeight &&
      pos.z >= 0 && pos.z < this.worldDepth
    )
  }

  private getOrCreateChunk(cc: ChunkCoord): WorldgenChunk {
    const key = chunkKey(cc)
    let chunk = this.chunks.get(key)
    if (!chunk) {
      chunk = new WorldgenChunk()
      this.chunks.set(key, chunk)
    }
    return chunk
  }

  getChunk(cc: ChunkCoord): WorldgenChunk | undefined {
    return this.chunks.get(chunkKey(cc))
  }

  getBlock(pos: VoxelCoord): WorldgenBlockType {
    if (!this.isInBounds(pos)) return WorldgenBlockType.Air
    const cc = worldToChunk(pos)
    const chunk = this.chunks.get(chunkKey(cc))
    if (!chunk) return WorldgenBlockType.Air
    const local = worldToLocal(pos)
    return chunk.getBlock(local.x, local.y, local.z)
  }

  setBlock(pos: VoxelCoord, type: WorldgenBlockType): void {
    if (!this.isInBounds(pos)) return
    const cc = worldToChunk(pos)
    const chunk = this.getOrCreateChunk(cc)
    const local = worldToLocal(pos)
    chunk.setBlock(local.x, local.y, local.z, type)
  }

  get chunkCount(): number {
    return this.chunks.size
  }
}
