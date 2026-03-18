export enum BlockType {
  Air = 0,
  Solid = 1,
  Ladder = 2,
  Stair = 3,
  Platform = 4,
}

export function isSolidBlock(type: BlockType): boolean {
  return type === BlockType.Solid || type === BlockType.Platform
}

export function isPlatform(type: BlockType): boolean {
  return type === BlockType.Platform
}

export function isClimbable(type: BlockType): boolean {
  return type === BlockType.Ladder
}

export function isStair(type: BlockType): boolean {
  return type === BlockType.Stair
}
