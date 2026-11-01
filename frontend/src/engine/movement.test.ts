import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  stepMovement,
  type MovementState,
  type StepBounds,
  type StepBox,
  type StepGround,
  type StepInput,
  type StepPhysics,
} from './movement'

interface GoldenScenario {
  name: string
  description: string
  physics: StepPhysics
  ground: StepGround
  bounds: StepBounds
  boxes: StepBox[]
  initialState: MovementState
  inputs: StepInput[]
  expectedFinalState: MovementState
}

interface GoldenFile {
  scenarios: GoldenScenario[]
}

describe('stepMovement golden vectors', () => {
  const vectorsPath = path.resolve(
    __dirname,
    '../../../shared/movement-vectors.json'
  )
  const raw = fs.readFileSync(vectorsPath, 'utf-8')
  const golden: GoldenFile = JSON.parse(raw)

  it('has at least 8 golden scenarios', () => {
    expect(golden.scenarios.length).toBeGreaterThanOrEqual(8)
  })

  for (const scenario of golden.scenarios) {
    it(`matches golden scenario: ${scenario.name}`, () => {
      let state = { ...scenario.initialState }
      for (const input of scenario.inputs) {
        state = stepMovement(
          state,
          input,
          scenario.physics,
          scenario.ground,
          scenario.bounds,
          scenario.boxes
        )
      }

      const expected = scenario.expectedFinalState
      expect(Math.abs(state.x - expected.x)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(state.y - expected.y)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(state.z - expected.z)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(state.vy - expected.vy)).toBeLessThanOrEqual(1e-6)
      expect(state.onGround).toBe(expected.onGround)
    })
  }
})
