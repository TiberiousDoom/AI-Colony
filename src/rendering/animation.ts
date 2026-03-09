/**
 * Animation definitions: frame names, speed, looping.
 */

import type { VillagerAction } from '../simulation/villager.ts'

export interface AnimationDef {
  frames: string[]       // Sprite frame names
  speed: number          // Render frames per animation frame
  loop: boolean
}

export const ANIMATIONS: Record<string, AnimationDef> = {
  walk:  { frames: ['villager_walk_0', 'villager_walk_1', 'villager_walk_2', 'villager_walk_3'], speed: 8, loop: true },
  work:  { frames: ['villager_work_0', 'villager_work_1', 'villager_work_2', 'villager_work_3'], speed: 12, loop: true },
  rest:  { frames: ['villager_rest_0', 'villager_rest_1', 'villager_rest_2', 'villager_rest_3'], speed: 16, loop: true },
  flee:  { frames: ['villager_flee_0', 'villager_flee_1', 'villager_flee_2', 'villager_flee_3'], speed: 4, loop: true },
  idle:  { frames: ['villager_rest_0'], speed: 1, loop: false },
  death: { frames: ['villager_rest_0'], speed: 1, loop: false },
}

const ACTION_TO_ANIM: Record<VillagerAction, string> = {
  idle: 'idle',
  forage: 'work',
  eat: 'rest',
  rest: 'rest',
  chop_wood: 'work',
  haul: 'walk',
  fish: 'work',
  mine_stone: 'work',
  build_shelter: 'work',
  build_storage: 'work',
  build_watchtower: 'work',
  build_farm: 'work',
  build_wall: 'work',
  build_well: 'work',
  warm_up: 'rest',
  cool_down: 'rest',
  flee: 'flee',
}

/** Maps a villager action to an animation name */
export function actionToAnimation(action: VillagerAction): string {
  return ACTION_TO_ANIM[action] ?? 'idle'
}

/** Advance animation by one render frame, return current frame name */
export function tickAnimation(
  animName: string,
  currentFrame: number,
  frameTick: number,
): { frame: number; frameTick: number; textureName: string } {
  const anim = ANIMATIONS[animName] ?? ANIMATIONS.idle
  const nextTick = frameTick + 1
  if (nextTick >= anim.speed) {
    let nextFrame = currentFrame + 1
    if (nextFrame >= anim.frames.length) {
      nextFrame = anim.loop ? 0 : anim.frames.length - 1
    }
    return { frame: nextFrame, frameTick: 0, textureName: anim.frames[nextFrame] }
  }
  return { frame: currentFrame, frameTick: nextTick, textureName: anim.frames[currentFrame] }
}
