export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down'

export interface ConnectionPoint {
  dx: number  // offset from room origin
  dy: number
  dz: number
  direction: Direction
}

export interface RoomTemplate {
  name: string
  width: number
  height: number
  depth: number
  connections: ConnectionPoint[]
  spawnType?: 'boss' | 'treasure' | 'guard' | null
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    name: 'Small Room',
    width: 6, height: 5, depth: 6,
    connections: [
      { dx: 3, dy: 1, dz: 0, direction: 'north' },
      { dx: 3, dy: 1, dz: 5, direction: 'south' },
      { dx: 0, dy: 1, dz: 3, direction: 'west' },
      { dx: 5, dy: 1, dz: 3, direction: 'east' },
    ],
  },
  {
    name: 'Large Hall',
    width: 10, height: 6, depth: 10,
    connections: [
      { dx: 5, dy: 1, dz: 0, direction: 'north' },
      { dx: 5, dy: 1, dz: 9, direction: 'south' },
      { dx: 0, dy: 1, dz: 5, direction: 'west' },
      { dx: 9, dy: 1, dz: 5, direction: 'east' },
    ],
  },
  {
    name: 'Corridor EW',
    width: 8, height: 4, depth: 3,
    connections: [
      { dx: 0, dy: 1, dz: 1, direction: 'west' },
      { dx: 7, dy: 1, dz: 1, direction: 'east' },
    ],
  },
  {
    name: 'Corridor NS',
    width: 3, height: 4, depth: 8,
    connections: [
      { dx: 1, dy: 1, dz: 0, direction: 'north' },
      { dx: 1, dy: 1, dz: 7, direction: 'south' },
    ],
  },
  {
    name: 'Stair Down',
    width: 5, height: 8, depth: 5,
    connections: [
      { dx: 2, dy: 5, dz: 0, direction: 'north' },
      { dx: 2, dy: 1, dz: 4, direction: 'south' },
    ],
  },
  {
    name: 'Treasure Room',
    width: 7, height: 5, depth: 7,
    connections: [
      { dx: 3, dy: 1, dz: 0, direction: 'north' },
    ],
    spawnType: 'treasure',
  },
  {
    name: 'Boss Chamber',
    width: 12, height: 7, depth: 12,
    connections: [
      { dx: 6, dy: 1, dz: 0, direction: 'north' },
      { dx: 6, dy: 1, dz: 11, direction: 'south' },
    ],
    spawnType: 'boss',
  },
  {
    name: 'Guard Post',
    width: 5, height: 4, depth: 5,
    connections: [
      { dx: 2, dy: 1, dz: 0, direction: 'north' },
      { dx: 2, dy: 1, dz: 4, direction: 'south' },
      { dx: 0, dy: 1, dz: 2, direction: 'west' },
    ],
    spawnType: 'guard',
  },
]

export function getOppositeDirection(dir: Direction): Direction {
  switch (dir) {
    case 'north': return 'south'
    case 'south': return 'north'
    case 'east': return 'west'
    case 'west': return 'east'
    case 'up': return 'down'
    case 'down': return 'up'
  }
}

export function getDirectionOffset(dir: Direction): { dx: number; dy: number; dz: number } {
  switch (dir) {
    case 'north': return { dx: 0, dy: 0, dz: -1 }
    case 'south': return { dx: 0, dy: 0, dz: 1 }
    case 'east':  return { dx: 1, dy: 0, dz: 0 }
    case 'west':  return { dx: -1, dy: 0, dz: 0 }
    case 'up':    return { dx: 0, dy: 1, dz: 0 }
    case 'down':  return { dx: 0, dy: -1, dz: 0 }
  }
}
