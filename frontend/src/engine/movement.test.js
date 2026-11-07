import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lerpAngle } from './GameEngine'
import { stepMovement } from './movement'

describe('stepMovement golden vectors', () => {
  const vectorsPath = path.resolve(
    __dirname,
    '../../../shared/movement-vectors.json'
  )
  const raw = fs.readFileSync(vectorsPath, 'utf-8')
  const golden = JSON.parse(raw)

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

  it('interpolates yaw across the -PI/+PI wrap boundary via shortest arc', () => {
    const a = Math.PI - 0.1
    const b = -Math.PI + 0.1
    const mid = lerpAngle(a, b, 0.5)
    expect(Math.abs(Math.cos(mid))).toBeGreaterThan(0.99)
  })
})
