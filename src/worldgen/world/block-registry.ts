import { WorldgenBlockType } from './block-types.ts'

export interface BlockProperties {
  color: number
  solid: boolean
  transparent: boolean
  category: 'terrain' | 'ore' | 'vegetation' | 'fluid' | 'special'
}

const registry: Record<number, BlockProperties> = {
  [WorldgenBlockType.Air]:          { color: 0x000000, solid: false, transparent: true,  category: 'special' },
  [WorldgenBlockType.Stone]:        { color: 0x808080, solid: true,  transparent: false, category: 'terrain' },
  [WorldgenBlockType.Dirt]:         { color: 0x8b6914, solid: true,  transparent: false, category: 'terrain' },
  [WorldgenBlockType.Grass]:        { color: 0x4caf50, solid: true,  transparent: false, category: 'terrain' },
  [WorldgenBlockType.Sand]:         { color: 0xf0e68c, solid: true,  transparent: false, category: 'terrain' },
  [WorldgenBlockType.Water]:        { color: 0x2196f3, solid: false, transparent: true,  category: 'fluid' },
  [WorldgenBlockType.Snow]:         { color: 0xf5f5f5, solid: true,  transparent: false, category: 'terrain' },
  [WorldgenBlockType.Mud]:          { color: 0x5d4037, solid: true,  transparent: false, category: 'terrain' },
  [WorldgenBlockType.LayeredStone]: { color: 0xbf8040, solid: true,  transparent: false, category: 'terrain' },
  [WorldgenBlockType.Coal]:         { color: 0x333333, solid: true,  transparent: false, category: 'ore' },
  [WorldgenBlockType.Iron]:         { color: 0xc0c0c0, solid: true,  transparent: false, category: 'ore' },
  [WorldgenBlockType.Copper]:       { color: 0xb87333, solid: true,  transparent: false, category: 'ore' },
  [WorldgenBlockType.Gold]:         { color: 0xffd700, solid: true,  transparent: false, category: 'ore' },
  [WorldgenBlockType.Gem]:          { color: 0x00bcd4, solid: true,  transparent: false, category: 'ore' },
  [WorldgenBlockType.Crystal]:      { color: 0xe040fb, solid: true,  transparent: false, category: 'ore' },
  [WorldgenBlockType.Wood]:         { color: 0x795548, solid: true,  transparent: false, category: 'vegetation' },
  [WorldgenBlockType.Leaves]:       { color: 0x2e7d32, solid: true,  transparent: true,  category: 'vegetation' },
  [WorldgenBlockType.Cactus]:       { color: 0x388e3c, solid: true,  transparent: false, category: 'vegetation' },
  [WorldgenBlockType.DeadBush]:     { color: 0x8d6e63, solid: false, transparent: true,  category: 'vegetation' },
  [WorldgenBlockType.Flower]:       { color: 0xff5722, solid: false, transparent: true,  category: 'vegetation' },
  [WorldgenBlockType.Bedrock]:      { color: 0x1a1a1a, solid: true,  transparent: false, category: 'special' },
  [WorldgenBlockType.Ice]:          { color: 0xb3e5fc, solid: true,  transparent: true,  category: 'terrain' },
}

export function getBlockProperties(type: WorldgenBlockType): BlockProperties {
  return registry[type] ?? registry[WorldgenBlockType.Air]
}

export function getBlockColor(type: WorldgenBlockType): number {
  return (registry[type] ?? registry[WorldgenBlockType.Air]).color
}
