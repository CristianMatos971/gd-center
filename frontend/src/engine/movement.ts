/**
 * Pure deterministic movement simulation shared with backend MovementSystem.java.
 * No framework imports. One call to stepMovement() = one fixed simulation step (dt = 1 / tickRate).
 */
import type {
  BoundsConfig,
  MapBox,
  PhysicsConfig,
  PlayerInput,
  PlayerState,
} from '../game/types'

export type MovementState = Pick<
  PlayerState,
  'x' | 'y' | 'z' | 'vy' | 'onGround'
>
export type StepInput = Omit<PlayerInput, 'seq'>
export type StepPhysics = PhysicsConfig
export interface StepGround {
  y: number
}
export type StepBounds = BoundsConfig
export type StepBox = Omit<MapBox, 'color'>

const EPSILON = 1e-9

export function stepMovement(
  state: MovementState,
  input: StepInput,
  physics: StepPhysics,
  ground: StepGround,
  bounds: StepBounds,
  boxes: StepBox[] = []
): MovementState {
  const dt = 1.0 / physics.tickRate

  let x = state.x
  let y = state.y
  let z = state.z
  let vy = state.vy
  let onGround = state.onGround

  // 1. Horizontal direction = (forward - back) * forwardVector + (right - left) * rightVector.
  // forward = (-sin(yaw), 0, -cos(yaw)), right = (cos(yaw), 0, -sin(yaw)).
  const forwardAxis = (input.forward ? 1.0 : 0.0) - (input.back ? 1.0 : 0.0)
  const rightAxis = (input.right ? 1.0 : 0.0) - (input.left ? 1.0 : 0.0)

  const sinYaw = Math.sin(input.yaw)
  const cosYaw = Math.cos(input.yaw)

  const forwardX = -sinYaw
  const forwardZ = -cosYaw
  const rightX = cosYaw
  const rightZ = -sinYaw

  let dirX = forwardAxis * forwardX + rightAxis * rightX
  let dirZ = forwardAxis * forwardZ + rightAxis * rightZ
  const len = Math.hypot(dirX, dirZ)
  if (len > 0.0) {
    dirX /= len
    dirZ /= len
  }

  const speed = input.run ? physics.runSpeed : physics.walkSpeed
  const vx = dirX * speed
  const vz = dirZ * speed

  // 2. Jump
  if (input.jump && onGround) {
    vy = physics.jumpSpeed
    onGround = false
  }

  // 3. Gravity (applied every step, even when standing)
  vy -= physics.gravity * dt

  const halfW = physics.player.width * 0.5
  const halfD = physics.player.depth * 0.5
  const playerH = physics.player.height

  // 4a. Move X by vx * dt and resolve box overlaps along X
  x += vx * dt
  if (vx !== 0.0) {
    for (const box of boxes) {
      if (overlaps(x, y, z, halfW, playerH, halfD, box)) {
        const boxMinX = box.x - box.width * 0.5
        const boxMaxX = box.x + box.width * 0.5
        if (vx > 0.0) {
          x = boxMinX - halfW
        } else {
          x = boxMaxX + halfW
        }
      }
    }
  }

  // 4b. Move Z by vz * dt and resolve box overlaps along Z
  z += vz * dt
  if (vz !== 0.0) {
    for (const box of boxes) {
      if (overlaps(x, y, z, halfW, playerH, halfD, box)) {
        const boxMinZ = box.z - box.depth * 0.5
        const boxMaxZ = box.z + box.depth * 0.5
        if (vz > 0.0) {
          z = boxMinZ - halfD
        } else {
          z = boxMaxZ + halfD
        }
      }
    }
  }

  // 4c. Move Y: set onGround = false, move y by vy * dt, resolve vertical overlaps
  onGround = false
  y += vy * dt
  for (const box of boxes) {
    if (overlaps(x, y, z, halfW, playerH, halfD, box)) {
      const boxMinY = box.y - box.height * 0.5
      const boxMaxY = box.y + box.height * 0.5
      if (vy <= 0.0) {
        y = boxMaxY
        vy = 0.0
        onGround = true
      } else {
        y = boxMinY - playerH
        vy = 0.0
      }
    }
  }

  // 5. Ground plane
  if (y <= ground.y) {
    y = ground.y
    vy = 0.0
    onGround = true
  }

  // 6. Clamp x and z inside bounds, shrunk by half the player width
  const minX = bounds.minX + halfW
  const maxX = bounds.maxX - halfW
  const minZ = bounds.minZ + halfD
  const maxZ = bounds.maxZ - halfD

  if (x < minX) x = minX
  if (x > maxX) x = maxX
  if (z < minZ) z = minZ
  if (z > maxZ) z = maxZ

  return { x, y, z, vy, onGround }
}

function overlaps(
  px: number,
  py: number,
  pz: number,
  halfW: number,
  playerH: number,
  halfD: number,
  box: StepBox
): boolean {
  const pMinX = px - halfW
  const pMaxX = px + halfW
  const pMinY = py
  const pMaxY = py + playerH
  const pMinZ = pz - halfD
  const pMaxZ = pz + halfD

  const bMinX = box.x - box.width * 0.5
  const bMaxX = box.x + box.width * 0.5
  const bMinY = box.y - box.height * 0.5
  const bMaxY = box.y + box.height * 0.5
  const bMinZ = box.z - box.depth * 0.5
  const bMaxZ = box.z + box.depth * 0.5

  return (
    pMaxX > bMinX + EPSILON &&
    pMinX < bMaxX - EPSILON &&
    pMaxY > bMinY + EPSILON &&
    pMinY < bMaxY - EPSILON &&
    pMaxZ > bMinZ + EPSILON &&
    pMinZ < bMaxZ - EPSILON
  )
}
