const EPSILON = 1e-9

export function stepMovement(state, input, physics, ground, bounds, boxes = []) {
  const dt = 1.0 / physics.tickRate

  let x = state.x
  let y = state.y
  let z = state.z
  let vy = state.vy
  let onGround = state.onGround

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

  if (input.jump && onGround) {
    vy = physics.jumpSpeed
    onGround = false
  }

  vy -= physics.gravity * dt

  const halfW = physics.player.width * 0.5
  const halfD = physics.player.depth * 0.5
  const playerH = physics.player.height

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

  if (y <= ground.y) {
    y = ground.y
    vy = 0.0
    onGround = true
  }

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

function overlaps(px, py, pz, halfW, playerH, halfD, box) {
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
