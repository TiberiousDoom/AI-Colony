export enum WorldgenBlockType {
  Air = 0,
  Stone = 1,
  Dirt = 2,
  Grass = 3,
  Sand = 4,
  Water = 5,
  Snow = 6,
  Mud = 7,
  LayeredStone = 8,
  Coal = 9,
  Iron = 10,
  Copper = 11,
  Gold = 12,
  Gem = 13,
  Crystal = 14,
  Wood = 15,
  Leaves = 16,
  Cactus = 17,
  DeadBush = 18,
  Flower = 19,
  Bedrock = 20,
  Ice = 21,
}

export function isSolid(type: WorldgenBlockType): boolean {
  return type !== WorldgenBlockType.Air && type !== WorldgenBlockType.Water
}

export function isTransparent(type: WorldgenBlockType): boolean {
  return type === WorldgenBlockType.Air || type === WorldgenBlockType.Water ||
    type === WorldgenBlockType.Leaves
}
