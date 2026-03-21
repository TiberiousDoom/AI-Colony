/**
 * Custom scenario parser — creates a ScenarioDefinition from a JSON object.
 */

import type { ScenarioDefinition } from '../scenario-runner.ts'
import { BlockType } from '../../world/block-types.ts'
import { createAgent } from '../../agents/agent.ts'

export interface CustomScenarioJSON {
  name: string
  worldSize: number
  seed: number
  totalTicks: number
  blocks: Array<{ x: number; y: number; z: number; type: number }>
  agents: Array<{
    spawn: { x: number; y: number; z: number }
    destination: { x: number; y: number; z: number }
  }>
  tickEvents?: Array<{
    tick: number
    changes: Array<{ x: number; y: number; z: number; type: number }>
  }>
}

export function parseCustomScenario(json: string): CustomScenarioJSON {
  return JSON.parse(json) as CustomScenarioJSON
}

export function createCustomScenario(data: CustomScenarioJSON): ScenarioDefinition {
  const tickScript = new Map<number, (engine: Parameters<ScenarioDefinition['setup']>[0]) => void>()

  // Register tick events
  if (data.tickEvents) {
    for (const evt of data.tickEvents) {
      tickScript.set(evt.tick, (engine) => {
        for (const change of evt.changes) {
          engine.queueTerrainChange(
            { x: change.x, y: change.y, z: change.z },
            change.type as BlockType,
          )
        }
      })
    }
  }

  return {
    name: data.name || 'Custom Scenario',
    worldSize: data.worldSize || 32,
    seed: data.seed || 1,
    totalTicks: data.totalTicks || 500,
    setup: (engine) => {
      // Place blocks
      for (const block of data.blocks) {
        engine.grid.setBlock(
          { x: block.x, y: block.y, z: block.z },
          block.type as BlockType,
        )
      }

      // Spawn agents with destinations
      for (const agentDef of data.agents) {
        const agent = createAgent(agentDef.spawn)
        engine.agentManager.addAgent(agent)
        engine.agentManager.assignDestination(agent, agentDef.destination)
      }
    },
    tickScript,
  }
}
