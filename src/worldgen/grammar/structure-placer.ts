import type { WorldgenGrid } from '../world/worldgen-grid.ts'
import { WorldgenBlockType } from '../world/block-types.ts'
import type { GrammarResult, PlacedRoom } from './grammar-engine.ts'

/**
 * Carves grammar-generated rooms into the world grid.
 * Each room is hollowed out and given a stone floor.
 */
export function placeStructures(grid: WorldgenGrid, result: GrammarResult): number {
  let carved = 0

  for (const room of result.rooms) {
    carved += carveRoom(grid, room)
  }

  return carved
}

function carveRoom(grid: WorldgenGrid, room: PlacedRoom): number {
  const { x, y, z, template } = room
  let carved = 0

  for (let dx = 0; dx < template.width; dx++) {
    for (let dy = 0; dy < template.height; dy++) {
      for (let dz = 0; dz < template.depth; dz++) {
        const bx = x + dx, by = y + dy, bz = z + dz
        if (!grid.isInBounds({ x: bx, y: by, z: bz })) continue

        const current = grid.getBlock({ x: bx, y: by, z: bz })
        if (current === WorldgenBlockType.Bedrock) continue

        if (dy === 0) {
          // Floor
          grid.setBlock({ x: bx, y: by, z: bz }, WorldgenBlockType.Stone)
        } else if (dx === 0 || dx === template.width - 1 ||
                   dz === 0 || dz === template.depth - 1 ||
                   dy === template.height - 1) {
          // Walls and ceiling — only carve if they're in the interior
          // Leave outer shell as stone for structural integrity
          if (dy < template.height - 1 && dx > 0 && dx < template.width - 1 &&
              dz > 0 && dz < template.depth - 1) {
            grid.setBlock({ x: bx, y: by, z: bz }, WorldgenBlockType.Air)
            carved++
          }
        } else {
          // Interior
          grid.setBlock({ x: bx, y: by, z: bz }, WorldgenBlockType.Air)
          carved++
        }
      }
    }
  }

  // Carve doorways at connection points
  for (const conn of room.template.connections) {
    const cx = x + conn.dx, cy = y + conn.dy, cz = z + conn.dz
    // Carve a 2-high opening
    for (let dy = 0; dy < 2; dy++) {
      if (grid.isInBounds({ x: cx, y: cy + dy, z: cz })) {
        grid.setBlock({ x: cx, y: cy + dy, z: cz }, WorldgenBlockType.Air)
        carved++
      }
    }
  }

  return carved
}
