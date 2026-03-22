import type { SeededRNG } from '../../shared/seed.ts'
import type { RoomTemplate, ConnectionPoint } from './room-templates.ts'
import { getOppositeDirection, getDirectionOffset } from './room-templates.ts'
import { selectRule } from './rules.ts'

export interface PlacedRoom {
  template: RoomTemplate
  x: number
  y: number
  z: number
  depth: number
  openConnections: ConnectionPoint[]
}

export interface GrammarResult {
  rooms: PlacedRoom[]
}

/**
 * Shape grammar expansion engine.
 * Starts with an entrance and expands by attaching rooms to open connections.
 */
export function expandGrammar(
  rng: SeededRNG,
  startX: number,
  startY: number,
  startZ: number,
  maxExpansions: number,
  worldWidth: number,
  worldHeight: number,
  worldDepth: number,
): GrammarResult {
  const rooms: PlacedRoom[] = []

  // Start with a small entrance room
  const entranceRule = selectRule(0, rng)
  const entranceRoom: PlacedRoom = {
    template: entranceRule.template,
    x: startX,
    y: startY,
    z: startZ,
    depth: 0,
    openConnections: [...entranceRule.template.connections],
  }
  rooms.push(entranceRoom)

  for (let i = 0; i < maxExpansions && rooms.length < maxExpansions + 1; i++) {
    // Find a room with open connections
    const candidates = rooms.filter(r => r.openConnections.length > 0)
    if (candidates.length === 0) break

    const parentRoom = candidates[rng.nextInt(0, candidates.length - 1)]
    const connIdx = rng.nextInt(0, parentRoom.openConnections.length - 1)
    const conn = parentRoom.openConnections[connIdx]

    // Select a new room to attach
    const rule = selectRule(parentRoom.depth + 1, rng)
    const newTemplate = rule.template

    // Find a matching connection on the new room (opposite direction)
    const neededDir = getOppositeDirection(conn.direction)
    const matchingConn = newTemplate.connections.find(c => c.direction === neededDir)
    if (!matchingConn) {
      // Remove this connection and try again
      parentRoom.openConnections.splice(connIdx, 1)
      continue
    }

    // Calculate new room position
    const dirOffset = getDirectionOffset(conn.direction)
    const newX = parentRoom.x + conn.dx + dirOffset.dx * 2 - matchingConn.dx
    const newY = parentRoom.y + conn.dy + dirOffset.dy * 2 - matchingConn.dy
    const newZ = parentRoom.z + conn.dz + dirOffset.dz * 2 - matchingConn.dz

    // Bounds check
    if (newX < 2 || newX + newTemplate.width > worldWidth - 2 ||
        newY < 2 || newY + newTemplate.height > worldHeight - 2 ||
        newZ < 2 || newZ + newTemplate.depth > worldDepth - 2) {
      parentRoom.openConnections.splice(connIdx, 1)
      continue
    }

    // Collision check with existing rooms
    let overlaps = false
    for (const existing of rooms) {
      if (boxesOverlap(
        newX, newY, newZ, newTemplate.width, newTemplate.height, newTemplate.depth,
        existing.x, existing.y, existing.z,
        existing.template.width, existing.template.height, existing.template.depth,
      )) {
        overlaps = true
        break
      }
    }
    if (overlaps) {
      parentRoom.openConnections.splice(connIdx, 1)
      continue
    }

    // Place the new room
    const newRoom: PlacedRoom = {
      template: newTemplate,
      x: newX, y: newY, z: newZ,
      depth: parentRoom.depth + 1,
      openConnections: newTemplate.connections
        .filter(c => c !== matchingConn)
        .map(c => ({ ...c })),
    }
    rooms.push(newRoom)

    // Remove used connection from parent
    parentRoom.openConnections.splice(connIdx, 1)
  }

  return { rooms }
}

function boxesOverlap(
  ax: number, ay: number, az: number, aw: number, ah: number, ad: number,
  bx: number, by: number, bz: number, bw: number, bh: number, bd: number,
): boolean {
  return ax < bx + bw && ax + aw > bx &&
         ay < by + bh && ay + ah > by &&
         az < bz + bd && az + ad > bz
}
