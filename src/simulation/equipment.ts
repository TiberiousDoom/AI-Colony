/**
 * Equipment system: weapon and armor types, stats, and helpers.
 */

import type { VillageStockpile } from './villager.ts'
import { CRAFTING } from '../config/game-constants.ts'

export type WeaponType = 'wooden_spear' | 'stone_axe' | 'stone_sword'
export type ArmorType = 'leather_tunic' | 'wooden_shield' | 'stone_mail'
export type EquipmentSlot = 'weapon' | 'armor'

export interface EquipmentStats {
  type: WeaponType | ArmorType
  slot: EquipmentSlot
  cost: { wood: number; stone: number }
  craftTicks: number
  /** Weapon: bonus damage added to base attack */
  bonusDamage: number
  /** Armor: fraction of incoming damage reduced (0.15 = 15%) */
  damageReduction: number
}

export interface VillagerEquipment {
  weapon: WeaponType | null
  armor: ArmorType | null
}

export const WEAPON_TYPES: WeaponType[] = ['wooden_spear', 'stone_axe', 'stone_sword']
export const ARMOR_TYPES: ArmorType[] = ['leather_tunic', 'wooden_shield', 'stone_mail']

export function getEquipmentStats(type: WeaponType | ArmorType): EquipmentStats {
  const stats = CRAFTING.EQUIPMENT[type]
  return stats
}

export function createDefaultEquipment(): VillagerEquipment {
  return { weapon: null, armor: null }
}

/** Get bonus attack damage from equipped weapon (0 if unarmed) */
export function getWeaponBonusDamage(equipment: VillagerEquipment): number {
  if (!equipment.weapon) return 0
  return CRAFTING.EQUIPMENT[equipment.weapon].bonusDamage
}

/** Get damage reduction fraction from equipped armor (0 if unarmored) */
export function getArmorReduction(equipment: VillagerEquipment): number {
  if (!equipment.armor) return 0
  return CRAFTING.EQUIPMENT[equipment.armor].damageReduction
}

/** Check if stockpile can afford the given equipment */
export function canAffordEquipment(stockpile: Readonly<VillageStockpile>, type: WeaponType | ArmorType): boolean {
  const stats = CRAFTING.EQUIPMENT[type]
  return stockpile.wood >= stats.cost.wood && stockpile.stone >= stats.cost.stone
}

/** Deduct equipment cost from stockpile */
export function deductEquipmentCost(stockpile: VillageStockpile, type: WeaponType | ArmorType): void {
  const stats = CRAFTING.EQUIPMENT[type]
  stockpile.wood -= stats.cost.wood
  stockpile.stone -= stats.cost.stone
}

/** Weapon tier: higher = better. Returns -1 for null. */
function weaponTier(w: WeaponType | null): number {
  if (!w) return -1
  return WEAPON_TYPES.indexOf(w)
}

/** Armor tier: higher = better. Returns -1 for null. */
function armorTier(a: ArmorType | null): number {
  if (!a) return -1
  return ARMOR_TYPES.indexOf(a)
}

/** Find the best weapon the village can afford that's an upgrade over current */
export function bestCraftableWeapon(stockpile: Readonly<VillageStockpile>, current: WeaponType | null): WeaponType | null {
  const currentTier = weaponTier(current)
  let best: WeaponType | null = null
  for (const w of WEAPON_TYPES) {
    if (weaponTier(w) > currentTier && canAffordEquipment(stockpile, w)) {
      best = w
    }
  }
  // If no upgrade found but unarmed, try cheapest
  if (!best && current === null) {
    for (const w of WEAPON_TYPES) {
      if (canAffordEquipment(stockpile, w)) return w
    }
  }
  return best
}

/** Find the best armor the village can afford that's an upgrade over current */
export function bestCraftableArmor(stockpile: Readonly<VillageStockpile>, current: ArmorType | null): ArmorType | null {
  const currentTier = armorTier(current)
  let best: ArmorType | null = null
  for (const a of ARMOR_TYPES) {
    if (armorTier(a) > currentTier && canAffordEquipment(stockpile, a)) {
      best = a
    }
  }
  if (!best && current === null) {
    for (const a of ARMOR_TYPES) {
      if (canAffordEquipment(stockpile, a)) return a
    }
  }
  return best
}
