import type { VoxelCoord, ChunkCoord } from '../../shared/types.ts'

export const CHUNK_SIZE = 16
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE // 4096

export function worldToChunk(pos: VoxelCoord): ChunkCoord {
  return {
    cx: Math.floor(pos.x / CHUNK_SIZE),
    cy: Math.floor(pos.y / CHUNK_SIZE),
    cz: Math.floor(pos.z / CHUNK_SIZE),
  }
}

export function worldToLocal(pos: VoxelCoord): VoxelCoord {
  return {
    x: ((pos.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    y: ((pos.y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    z: ((pos.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
  }
}

export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cy},${coord.cz}`
}

export function localIndex(lx: number, ly: number, lz: number): number {
  return ly * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx
}
