import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const BACKEND_DIR = path.join(REPO_ROOT, 'backend')
const MAP_SETTINGS_PATH = path.join(
  BACKEND_DIR,
  'src',
  'main',
  'resources',
  'maps',
  'ufgd-campus.json'
)
const PHYSICS_SETTINGS_PATH = path.join(
  BACKEND_DIR,
  'src',
  'main',
  'resources',
  'game-physics.json'
)
const APPLICATION_PROPERTIES_PATH = path.join(
  BACKEND_DIR,
  'src',
  'main',
  'resources',
  'application.properties'
)
const DEFAULT_LAYOUT_PATH = path.join(SCRIPT_DIR, 'campus-layout.json')
const PREVIEW_SVG_PATH = path.join(SCRIPT_DIR, 'out', 'preview.svg')

const DEFAULT_BACKEND_PORT = 8080
const PORT_CHECK_TIMEOUT_MS = 350
const OUTPUT_SCHEMA_VERSION = 1
const DEFAULT_HORIZONTAL_SCALE = 1
const DEFAULT_STRUCTURES_RELATIVE_PATH = 'data/structures.json'
const STRUCTURES_PATH_PROPERTY_KEY = 'gdcenter.structures.file'

const MIN_WALL_SIDE_MARGIN = 0.5
const SPAWN_CLEARANCE_INFLATION = 0.5
const DEFAULT_PLAYER_WIDTH = 0.6
const DEFAULT_PLAYER_HEIGHT = 1.8
const DEFAULT_PLAYER_DEPTH = 0.6

const LAMP_POLE_WIDTH = 0.25
const LAMP_POLE_HEIGHT = 7
const LAMP_POLE_DEPTH = 0.25
const LAMP_POLE_COLOR = '#9e9e9e'

const LAMP_HEAD_WIDTH = 1.2
const LAMP_HEAD_HEIGHT = 0.25
const LAMP_HEAD_DEPTH = 0.4
const LAMP_HEAD_COLOR = '#cfd8dc'

const TREE_TRUNK_WIDTH = 0.5
const TREE_TRUNK_HEIGHT = 2.5
const TREE_TRUNK_DEPTH = 0.5
const TREE_TRUNK_COLOR = '#6d4c41'
const TREE_CANOPY_MIN_EDGE = 3.0
const TREE_CANOPY_MAX_EDGE = 4.0
const TREE_CANOPY_COLORS = ['#2e7d32', '#388e3c', '#43a047']

const SVG_GRID_STEP = 10
const SVG_PADDING = 6
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const FLOAT_EPSILON = 1e-6
const DECIMAL_PRECISION_FACTOR = 100

function roundToTwoDecimals(value) {
  const rounded =
    Math.round((value + Number.EPSILON) * DECIMAL_PRECISION_FACTOR) /
    DECIMAL_PRECISION_FACTOR
  return Object.is(rounded, -0) ? 0 : rounded
}

function createMulberry32(seed) {
  let state = seed >>> 0
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function deriveSeedFromName(name) {
  const digest = crypto.createHash('sha1').update(String(name)).digest()
  return digest.readUInt32BE(0)
}

function buildDeterministicUuid(itemName, counter) {
  const bytes = Buffer.from(
    crypto
      .createHash('sha1')
      .update(`${itemName}:${counter}`)
      .digest()
      .subarray(0, 16)
  )
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function parseCliArgs(argv) {
  const options = {
    port: DEFAULT_BACKEND_PORT,
    force: false,
    outPath: null,
    layoutPath: DEFAULT_LAYOUT_PATH,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--force') {
      options.force = true
    } else if (arg === '--port') {
      const next = Number(argv[++i])
      if (!Number.isInteger(next) || next <= 0 || next > 65535) {
        throw new Error(`Invalid --port value: ${argv[i]}`)
      }
      options.port = next
    } else if (arg === '--out') {
      const next = argv[++i]
      if (!next) {
        throw new Error('Missing path after --out')
      }
      options.outPath = path.resolve(process.cwd(), next)
    } else if (arg === '--layout') {
      const next = argv[++i]
      if (!next) {
        throw new Error('Missing path after --layout')
      }
      options.layoutPath = path.resolve(process.cwd(), next)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function resolveConfiguredStructuresPath() {
  if (!fs.existsSync(APPLICATION_PROPERTIES_PATH)) {
    return path.join(BACKEND_DIR, DEFAULT_STRUCTURES_RELATIVE_PATH)
  }
  const content = fs.readFileSync(APPLICATION_PROPERTIES_PATH, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    if (key === STRUCTURES_PATH_PROPERTY_KEY && value) {
      return path.resolve(BACKEND_DIR, value)
    }
  }
  return path.join(BACKEND_DIR, DEFAULT_STRUCTURES_RELATIVE_PATH)
}

function loadJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function isHostPortListening(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    let settled = false
    const finish = (listening) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(listening)
    }
    socket.setTimeout(PORT_CHECK_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function isPortListening(port) {
  const ipv4Listening = await isHostPortListening('127.0.0.1', port)
  if (ipv4Listening) return true
  return isHostPortListening('::1', port)
}

function createRawBox(itemName, kind, x, y, z, width, height, depth, color) {
  return {
    itemName,
    kind,
    x,
    y,
    z,
    width,
    height,
    depth,
    color: String(color).toLowerCase(),
  }
}

function generateSlabBoxes(item, scale) {
  const base = item.base ?? 0
  const width = item.size[0] * scale
  const depth = item.size[1] * scale
  const height = item.height
  return [
    createRawBox(
      item.name,
      'floor',
      item.center[0] * scale,
      base + height / 2,
      item.center[1] * scale,
      width,
      height,
      depth,
      item.color
    ),
  ]
}

function generateBlockBoxes(item, scale) {
  const base = item.base ?? 0
  const width = item.size[0]
  const depth = item.size[1]
  const height = item.height
  return [
    createRawBox(
      item.name,
      'block',
      item.center[0] * scale,
      base + height / 2,
      item.center[1] * scale,
      width,
      height,
      depth,
      item.color
    ),
  ]
}

function generateWallSegments(
  itemName,
  sideName,
  wallSpan,
  wallHeight,
  wallThickness,
  wallColor,
  doorsOnSide,
  scale,
  minSize,
  mapSegmentToWorld
) {
  if (wallSpan < minSize || wallThickness < minSize || wallHeight < minSize) {
    throw new Error(
      `Building "${itemName}" (${sideName} wall) has dimensions smaller than minSize (${minSize} m).`
    )
  }

  if (!doorsOnSide || doorsOnSide.length === 0) {
    return [mapSegmentToWorld(0, wallSpan, 0, wallHeight)]
  }

  const sortedDoors = doorsOnSide
    .map((door) => ({
      offset: (door.offset ?? 0) * scale,
      width: door.width,
      height: door.height,
    }))
    .sort((a, b) => a.offset - b.offset)

  const halfSpan = wallSpan / 2
  let cursor = -halfSpan
  const boxes = []

  for (const door of sortedDoors) {
    if (
      !Number.isFinite(door.width) ||
      !Number.isFinite(door.height) ||
      door.width < minSize ||
      door.height < minSize
    ) {
      throw new Error(
        `Building "${itemName}" (${sideName} wall) has a door smaller than minSize (${minSize} m).`
      )
    }

    const lintelHeight = wallHeight - door.height
    if (lintelHeight < minSize - FLOAT_EPSILON) {
      throw new Error(
        `Building "${itemName}" (${sideName} wall) has a door height (${door.height} m) leaving lintel thinner than minSize (${minSize} m).`
      )
    }

    const doorStart = door.offset - door.width / 2
    const doorEnd = door.offset + door.width / 2
    const segmentBeforeLength = doorStart - cursor
    const remainingAfterLength = halfSpan - doorEnd

    if (
      segmentBeforeLength < MIN_WALL_SIDE_MARGIN - FLOAT_EPSILON ||
      remainingAfterLength < MIN_WALL_SIDE_MARGIN - FLOAT_EPSILON
    ) {
      throw new Error(
        `Building "${itemName}" (${sideName} wall) has a door at offset ${door.offset} (width ${door.width} m) that does not fit inside wall length ${roundToTwoDecimals(wallSpan)} m with at least ${MIN_WALL_SIDE_MARGIN} m margin on each side.`
      )
    }

    if (segmentBeforeLength < minSize - FLOAT_EPSILON) {
      throw new Error(
        `Building "${itemName}" (${sideName} wall) produces a wall segment thinner than minSize (${minSize} m).`
      )
    }

    const beforeCenter = cursor + segmentBeforeLength / 2
    boxes.push(mapSegmentToWorld(beforeCenter, segmentBeforeLength, 0, wallHeight))
    boxes.push(
      mapSegmentToWorld(door.offset, door.width, door.height, lintelHeight)
    )
    cursor = doorEnd
  }

  const finalSegmentLength = halfSpan - cursor
  if (finalSegmentLength < minSize - FLOAT_EPSILON) {
    throw new Error(
      `Building "${itemName}" (${sideName} wall) produces a trailing wall segment thinner than minSize (${minSize} m).`
    )
  }
  const finalCenter = cursor + finalSegmentLength / 2
  boxes.push(mapSegmentToWorld(finalCenter, finalSegmentLength, 0, wallHeight))

  return boxes
}

function generateBuildingBoxes(item, scale, minSize) {
  const cx = item.center[0] * scale
  const cz = item.center[1] * scale
  const footprintW = item.size[0] * scale
  const footprintD = item.size[1] * scale
  const wallH = item.wallHeight
  const wallT = item.wallThickness
  const wallColor = item.wallColor
  const doors = Array.isArray(item.doors) ? item.doors : []

  for (const door of doors) {
    if (!['north', 'south', 'east', 'west'].includes(door.side)) {
      throw new Error(
        `Building "${item.name}" has a door with invalid side "${door.side}".`
      )
    }
  }

  const northZ = cz - footprintD / 2 + wallT / 2
  const southZ = cz + footprintD / 2 - wallT / 2
  const westX = cx - footprintW / 2 + wallT / 2
  const eastX = cx + footprintW / 2 - wallT / 2
  const eastWestSpan = footprintD - 2 * wallT

  const boxes = []

  boxes.push(
    ...generateWallSegments(
      item.name,
      'north',
      footprintW,
      wallH,
      wallT,
      wallColor,
      doors.filter((d) => d.side === 'north'),
      scale,
      minSize,
      (localOffset, segLength, bottomY, segHeight) =>
        createRawBox(
          item.name,
          'wall',
          cx + localOffset,
          bottomY + segHeight / 2,
          northZ,
          segLength,
          segHeight,
          wallT,
          wallColor
        )
    )
  )

  boxes.push(
    ...generateWallSegments(
      item.name,
      'south',
      footprintW,
      wallH,
      wallT,
      wallColor,
      doors.filter((d) => d.side === 'south'),
      scale,
      minSize,
      (localOffset, segLength, bottomY, segHeight) =>
        createRawBox(
          item.name,
          'wall',
          cx + localOffset,
          bottomY + segHeight / 2,
          southZ,
          segLength,
          segHeight,
          wallT,
          wallColor
        )
    )
  )

  boxes.push(
    ...generateWallSegments(
      item.name,
      'west',
      eastWestSpan,
      wallH,
      wallT,
      wallColor,
      doors.filter((d) => d.side === 'west'),
      scale,
      minSize,
      (localOffset, segLength, bottomY, segHeight) =>
        createRawBox(
          item.name,
          'wall',
          westX,
          bottomY + segHeight / 2,
          cz + localOffset,
          wallT,
          segHeight,
          segLength,
          wallColor
        )
    )
  )

  boxes.push(
    ...generateWallSegments(
      item.name,
      'east',
      eastWestSpan,
      wallH,
      wallT,
      wallColor,
      doors.filter((d) => d.side === 'east'),
      scale,
      minSize,
      (localOffset, segLength, bottomY, segHeight) =>
        createRawBox(
          item.name,
          'wall',
          eastX,
          bottomY + segHeight / 2,
          cz + localOffset,
          wallT,
          segHeight,
          segLength,
          wallColor
        )
    )
  )

  const roofW = footprintW + 2 * item.roofOverhang
  const roofD = footprintD + 2 * item.roofOverhang
  const roofH = item.roofThickness
  boxes.push(
    createRawBox(
      item.name,
      'floor',
      cx,
      wallH + roofH / 2,
      cz,
      roofW,
      roofH,
      roofD,
      item.roofColor
    )
  )

  return boxes
}

function generateLampBoxes(item, scale) {
  const x = item.at[0] * scale
  const z = item.at[1] * scale
  return [
    createRawBox(
      item.name,
      'block',
      x,
      LAMP_POLE_HEIGHT / 2,
      z,
      LAMP_POLE_WIDTH,
      LAMP_POLE_HEIGHT,
      LAMP_POLE_DEPTH,
      LAMP_POLE_COLOR
    ),
    createRawBox(
      item.name,
      'block',
      x,
      LAMP_POLE_HEIGHT + LAMP_HEAD_HEIGHT / 2,
      z,
      LAMP_HEAD_WIDTH,
      LAMP_HEAD_HEIGHT,
      LAMP_HEAD_DEPTH,
      LAMP_HEAD_COLOR
    ),
  ]
}

function createSingleTreeBoxes(itemName, x, z, rng) {
  const canopyEdge = roundToTwoDecimals(
    TREE_CANOPY_MIN_EDGE +
      rng() * (TREE_CANOPY_MAX_EDGE - TREE_CANOPY_MIN_EDGE)
  )
  const colorIndex = Math.floor(rng() * TREE_CANOPY_COLORS.length)
  const canopyColor = TREE_CANOPY_COLORS[colorIndex]

  return [
    createRawBox(
      itemName,
      'block',
      x,
      TREE_TRUNK_HEIGHT / 2,
      z,
      TREE_TRUNK_WIDTH,
      TREE_TRUNK_HEIGHT,
      TREE_TRUNK_DEPTH,
      TREE_TRUNK_COLOR
    ),
    createRawBox(
      itemName,
      'block',
      x,
      TREE_TRUNK_HEIGHT + canopyEdge / 2,
      z,
      canopyEdge,
      canopyEdge,
      canopyEdge,
      canopyColor
    ),
  ]
}

function generateTreeRowBoxes(item, scale) {
  const fromX = item.from[0] * scale
  const fromZ = item.from[1] * scale
  const toX = item.to[0] * scale
  const toZ = item.to[1] * scale
  const step = item.step
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`treeRow "${item.name}" has an invalid step: ${step}`)
  }

  const totalDist = Math.hypot(toX - fromX, toZ - fromZ)
  const rng = createMulberry32(item.seed ?? deriveSeedFromName(item.name))
  const boxes = []

  if (totalDist < FLOAT_EPSILON) {
    boxes.push(...createSingleTreeBoxes(item.name, fromX, fromZ, rng))
    return boxes
  }

  for (let dist = 0; dist <= totalDist + FLOAT_EPSILON; dist += step) {
    const ratio = Math.min(1, dist / totalDist)
    const x = fromX + (toX - fromX) * ratio
    const z = fromZ + (toZ - fromZ) * ratio
    boxes.push(...createSingleTreeBoxes(item.name, x, z, rng))
  }

  return boxes
}

function buildGridCellCenters(minCoord, maxCoord, spacing) {
  const span = maxCoord - minCoord
  if (span < spacing) {
    return [(minCoord + maxCoord) / 2]
  }
  const centers = []
  for (
    let c = minCoord + spacing / 2;
    c <= maxCoord + FLOAT_EPSILON;
    c += spacing
  ) {
    centers.push(c)
  }
  return centers
}

function generateTreesPatchBoxes(item, scale) {
  const minX = Math.min(item.rect[0], item.rect[2]) * scale
  const maxX = Math.max(item.rect[0], item.rect[2]) * scale
  const minZ = Math.min(item.rect[1], item.rect[3]) * scale
  const maxZ = Math.max(item.rect[1], item.rect[3]) * scale
  const spacing = item.spacing
  const jitter = item.jitter ?? 0

  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new Error(`trees "${item.name}" has an invalid spacing: ${spacing}`)
  }

  const rng = createMulberry32(item.seed ?? deriveSeedFromName(item.name))
  const xCenters = buildGridCellCenters(minX, maxX, spacing)
  const zCenters = buildGridCellCenters(minZ, maxZ, spacing)
  const boxes = []

  for (const baseZ of zCenters) {
    for (const baseX of xCenters) {
      const offsetX = (rng() * 2 - 1) * jitter
      const offsetZ = (rng() * 2 - 1) * jitter
      boxes.push(
        ...createSingleTreeBoxes(item.name, baseX + offsetX, baseZ + offsetZ, rng)
      )
    }
  }

  return boxes
}

function splitAxisIfNeeded(center, totalSize, maxSize) {
  if (totalSize <= maxSize) {
    return [{ center, size: totalSize }]
  }
  const count = Math.ceil(totalSize / maxSize)
  const pieceSize = totalSize / count
  const startEdge = center - totalSize / 2
  const pieces = []
  for (let i = 0; i < count; i++) {
    pieces.push({
      center: startEdge + (i + 0.5) * pieceSize,
      size: pieceSize,
    })
  }
  return pieces
}

function splitBoxAboveMaxSize(rawBox, maxSize) {
  const xPieces = splitAxisIfNeeded(rawBox.x, rawBox.width, maxSize)
  const yPieces = splitAxisIfNeeded(rawBox.y, rawBox.height, maxSize)
  const zPieces = splitAxisIfNeeded(rawBox.z, rawBox.depth, maxSize)

  const results = []
  for (const yp of yPieces) {
    for (const zp of zPieces) {
      for (const xp of xPieces) {
        results.push({
          itemName: rawBox.itemName,
          kind: rawBox.kind,
          x: roundToTwoDecimals(xp.center),
          y: roundToTwoDecimals(yp.center),
          z: roundToTwoDecimals(zp.center),
          width: roundToTwoDecimals(xp.size),
          height: roundToTwoDecimals(yp.size),
          depth: roundToTwoDecimals(zp.size),
          color: rawBox.color,
        })
      }
    }
  }
  return results
}

function boxesOverlapAabb(a, b) {
  return (
    a.minX < b.maxX - FLOAT_EPSILON &&
    a.maxX > b.minX + FLOAT_EPSILON &&
    a.minY < b.maxY - FLOAT_EPSILON &&
    a.maxY > b.minY + FLOAT_EPSILON &&
    a.minZ < b.maxZ - FLOAT_EPSILON &&
    a.maxZ > b.minZ + FLOAT_EPSILON
  )
}

function validateGeneratedStructures(
  entries,
  mapSettings,
  playerDimensions
) {
  const { build, bounds, spawnPoints = [] } = mapSettings
  const { minSize, maxSize, maxStructures, maxY } = build
  const validKinds = new Set(Object.keys(build.kinds || {}))

  if (entries.length > maxStructures) {
    const lastItem = entries[entries.length - 1]?.itemName || 'layout'
    throw new Error(
      `Total structure count (${entries.length}) exceeds maxStructures (${maxStructures}) at item "${lastItem}".`
    )
  }

  const playerW = playerDimensions?.width ?? DEFAULT_PLAYER_WIDTH
  const playerH = playerDimensions?.height ?? DEFAULT_PLAYER_HEIGHT
  const playerD = playerDimensions?.depth ?? DEFAULT_PLAYER_DEPTH

  const inflatedSpawnBoxes = spawnPoints.map((sp, idx) => {
    const halfW = playerW / 2 + SPAWN_CLEARANCE_INFLATION
    const halfD = playerD / 2 + SPAWN_CLEARANCE_INFLATION
    const baseY = sp.y ?? 0
    return {
      index: idx,
      x: sp.x,
      z: sp.z,
      minX: sp.x - halfW,
      maxX: sp.x + halfW,
      minY: baseY - SPAWN_CLEARANCE_INFLATION,
      maxY: baseY + playerH + SPAWN_CLEARANCE_INFLATION,
      minZ: sp.z - halfD,
      maxZ: sp.z + halfD,
    }
  })

  for (const entry of entries) {
    const { itemName, structure } = entry
    const { kind, x, y, z, width, height, depth, color } = structure

    if (!validKinds.has(kind)) {
      throw new Error(`Item "${itemName}" has invalid kind "${kind}".`)
    }

    const nums = [x, y, z, width, height, depth]
    if (!nums.every((n) => Number.isFinite(n))) {
      throw new Error(`Item "${itemName}" produced non-finite numbers.`)
    }

    if (
      width < minSize - FLOAT_EPSILON ||
      width > maxSize + FLOAT_EPSILON ||
      height < minSize - FLOAT_EPSILON ||
      height > maxSize + FLOAT_EPSILON ||
      depth < minSize - FLOAT_EPSILON ||
      depth > maxSize + FLOAT_EPSILON
    ) {
      throw new Error(
        `Item "${itemName}" produced size (${width} x ${height} x ${depth}) outside [${minSize}, ${maxSize}].`
      )
    }

    if (!HEX_COLOR_PATTERN.test(color)) {
      throw new Error(`Item "${itemName}" has invalid color "${color}".`)
    }

    const minX = x - width / 2
    const maxX = x + width / 2
    const minY = y - height / 2
    const topY = y + height / 2
    const minZ = z - depth / 2
    const maxZ = z + depth / 2

    if (minY < -FLOAT_EPSILON) {
      throw new Error(
        `Item "${itemName}" has bottom y (${roundToTwoDecimals(minY)}) below 0.`
      )
    }
    if (topY > maxY + FLOAT_EPSILON) {
      throw new Error(
        `Item "${itemName}" has top y (${roundToTwoDecimals(topY)}) above maxY (${maxY}).`
      )
    }

    if (
      minX < bounds.minX - FLOAT_EPSILON ||
      maxX > bounds.maxX + FLOAT_EPSILON ||
      minZ < bounds.minZ - FLOAT_EPSILON ||
      maxZ > bounds.maxZ + FLOAT_EPSILON
    ) {
      throw new Error(
        `Item "${itemName}" extends outside map bounds [${bounds.minX}..${bounds.maxX}, ${bounds.minZ}..${bounds.maxZ}] with X [${roundToTwoDecimals(minX)}, ${roundToTwoDecimals(maxX)}] and Z [${roundToTwoDecimals(minZ)}, ${roundToTwoDecimals(maxZ)}].`
      )
    }

    const structureBox = { minX, maxX, minY, maxY: topY, minZ, maxZ }
    for (const spawnBox of inflatedSpawnBoxes) {
      if (boxesOverlapAabb(structureBox, spawnBox)) {
        throw new Error(
          `Item "${itemName}" overlaps spawn point #${spawnBox.index + 1} at (${spawnBox.x}, ${spawnBox.z}).`
        )
      }
    }
  }
}

function generateAllStructures(layout, mapSettings, playerDimensions) {
  const scale = layout.horizontalScale ?? DEFAULT_HORIZONTAL_SCALE
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`Invalid horizontalScale: ${scale}`)
  }

  const minSize = mapSettings.build.minSize
  const maxSize = mapSettings.build.maxSize
  const entries = []

  for (const item of layout.items || []) {
    if (!item || !item.name || !item.op) {
      throw new Error('Every layout item must have "op" and "name".')
    }

    let rawBoxes
    switch (item.op) {
      case 'slab':
        rawBoxes = generateSlabBoxes(item, scale)
        break
      case 'block':
        rawBoxes = generateBlockBoxes(item, scale)
        break
      case 'building':
        rawBoxes = generateBuildingBoxes(item, scale, minSize)
        break
      case 'lamp':
        rawBoxes = generateLampBoxes(item, scale)
        break
      case 'treeRow':
        rawBoxes = generateTreeRowBoxes(item, scale)
        break
      case 'trees':
        rawBoxes = generateTreesPatchBoxes(item, scale)
        break
      default:
        throw new Error(`Item "${item.name}" has unknown op "${item.op}".`)
    }

    let itemCounter = 0
    for (const rawBox of rawBoxes) {
      const splitPieces = splitBoxAboveMaxSize(rawBox, maxSize)
      for (const piece of splitPieces) {
        itemCounter += 1
        entries.push({
          itemName: item.name,
          structure: {
            id: buildDeterministicUuid(item.name, itemCounter),
            kind: piece.kind,
            x: piece.x,
            y: piece.y,
            z: piece.z,
            width: piece.width,
            height: piece.height,
            depth: piece.depth,
            color: piece.color,
          },
        })
      }
    }
  }

  validateGeneratedStructures(entries, mapSettings, playerDimensions)
  return entries.map((e) => e.structure)
}

function formatBackupTimestamp(date) {
  const pad2 = (n) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad2(date.getMonth() + 1)
  const dd = pad2(date.getDate())
  const hh = pad2(date.getHours())
  const min = pad2(date.getMinutes())
  const ss = pad2(date.getSeconds())
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`
}

function backupAndWriteStructuresFile(outputPath, structures) {
  const outDir = path.dirname(outputPath)
  fs.mkdirSync(outDir, { recursive: true })

  let backupPath = null
  if (fs.existsSync(outputPath)) {
    const timestamp = formatBackupTimestamp(new Date())
    backupPath = path.join(outDir, `structures.backup-${timestamp}.json`)
    fs.copyFileSync(outputPath, backupPath)
  }

  const payload = {
    version: OUTPUT_SCHEMA_VERSION,
    structures,
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return backupPath
}

function writePreviewSvg(previewPath, structures, mapSettings) {
  const { bounds, ground, spawnPoints = [] } = mapSettings
  const viewMinX = bounds.minX - SVG_PADDING
  const viewMinY = bounds.minZ - SVG_PADDING
  const viewWidth = bounds.maxX - bounds.minX + SVG_PADDING * 2
  const viewHeight = bounds.maxZ - bounds.minZ + SVG_PADDING * 2

  const sorted = [...structures].sort(
    (a, b) => a.y + a.height / 2 - (b.y + b.height / 2)
  )

  const lines = []
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewMinX} ${viewMinY} ${viewWidth} ${viewHeight}" width="900" height="900">`
  )
  lines.push(
    `  <rect x="${viewMinX}" y="${viewMinY}" width="${viewWidth}" height="${viewHeight}" fill="#1e293b" />`
  )
  lines.push(
    `  <rect x="${bounds.minX}" y="${bounds.minZ}" width="${bounds.maxX - bounds.minX}" height="${bounds.maxZ - bounds.minZ}" fill="${ground?.color || '#4caf50'}" />`
  )

  lines.push('  <g stroke="rgba(255,255,255,0.22)" stroke-width="0.2">')
  for (let gx = bounds.minX; gx <= bounds.maxX; gx += SVG_GRID_STEP) {
    lines.push(
      `    <line x1="${gx}" y1="${bounds.minZ}" x2="${gx}" y2="${bounds.maxZ}" />`
    )
  }
  for (let gz = bounds.minZ; gz <= bounds.maxZ; gz += SVG_GRID_STEP) {
    lines.push(
      `    <line x1="${bounds.minX}" y1="${gz}" x2="${bounds.maxX}" y2="${gz}" />`
    )
  }
  lines.push('  </g>')

  lines.push('  <g stroke="rgba(0,0,0,0.35)" stroke-width="0.12">')
  for (const s of sorted) {
    const rx = roundToTwoDecimals(s.x - s.width / 2)
    const ry = roundToTwoDecimals(s.z - s.depth / 2)
    lines.push(
      `    <rect x="${rx}" y="${ry}" width="${s.width}" height="${s.depth}" fill="${s.color}" />`
    )
  }
  lines.push('  </g>')

  lines.push('  <g fill="#facc15" stroke="#0f172a" stroke-width="0.25">')
  for (const sp of spawnPoints) {
    lines.push(`    <circle cx="${sp.x}" cy="${sp.z}" r="0.9" />`)
  }
  lines.push('  </g>')

  const arrowX = bounds.maxX - 10
  const arrowY = bounds.minZ + 14
  lines.push('  <g>')
  lines.push(
    `    <line x1="${arrowX}" y1="${arrowY}" x2="${arrowX}" y2="${arrowY - 8}" stroke="#ffffff" stroke-width="0.7" />`
  )
  lines.push(
    `    <polygon points="${arrowX},${arrowY - 10.5} ${arrowX - 2},${arrowY - 6.5} ${arrowX + 2},${arrowY - 6.5}" fill="#ffffff" />`
  )
  lines.push(
    `    <text x="${arrowX}" y="${arrowY + 4}" fill="#ffffff" font-family="sans-serif" font-size="3.5" font-weight="bold" text-anchor="middle">N</text>`
  )
  lines.push('  </g>')
  lines.push('</svg>')

  fs.mkdirSync(path.dirname(previewPath), { recursive: true })
  fs.writeFileSync(previewPath, `${lines.join('\n')}\n`, 'utf8')
}

function computeSummary(structures) {
  const byKind = { wall: 0, floor: 0, block: 0 }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const s of structures) {
    byKind[s.kind] = (byKind[s.kind] ?? 0) + 1
    minX = Math.min(minX, s.x - s.width / 2)
    maxX = Math.max(maxX, s.x + s.width / 2)
    minY = Math.min(minY, s.y - s.height / 2)
    maxY = Math.max(maxY, s.y + s.height / 2)
    minZ = Math.min(minZ, s.z - s.depth / 2)
    maxZ = Math.max(maxZ, s.z + s.depth / 2)
  }

  return {
    total: structures.length,
    byKind,
    boundingBox: {
      minX: roundToTwoDecimals(minX),
      maxX: roundToTwoDecimals(maxX),
      minY: roundToTwoDecimals(minY),
      maxY: roundToTwoDecimals(maxY),
      minZ: roundToTwoDecimals(minZ),
      maxZ: roundToTwoDecimals(maxZ),
    },
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  const mapSettings = loadJsonFile(MAP_SETTINGS_PATH, 'Map settings file')
  const physicsSettings = fs.existsSync(PHYSICS_SETTINGS_PATH)
    ? loadJsonFile(PHYSICS_SETTINGS_PATH, 'Physics settings file')
    : null
  const layout = loadJsonFile(options.layoutPath, 'Campus layout file')

  const structures = generateAllStructures(
    layout,
    mapSettings,
    physicsSettings?.player
  )

  if (!options.force) {
    const listening = await isPortListening(options.port)
    if (listening) {
      console.error(
        'Stop the backend first: it rewrites the structures file on shutdown.'
      )
      process.exit(1)
    }
  }

  const outputPath = options.outPath || resolveConfiguredStructuresPath()
  const backupPath = backupAndWriteStructuresFile(outputPath, structures)
  writePreviewSvg(PREVIEW_SVG_PATH, structures, mapSettings)

  const summary = computeSummary(structures)
  console.log(`Total structures: ${summary.total}`)
  console.log(
    `By kind: wall=${summary.byKind.wall}, floor=${summary.byKind.floor}, block=${summary.byKind.block}`
  )
  console.log(
    `Bounding box: X [${summary.boundingBox.minX}, ${summary.boundingBox.maxX}], Y [${summary.boundingBox.minY}, ${summary.boundingBox.maxY}], Z [${summary.boundingBox.minZ}, ${summary.boundingBox.maxZ}]`
  )
  if (backupPath) {
    console.log(`Backup written: ${backupPath}`)
  }
  console.log(`Output written: ${outputPath}`)
  console.log(`Preview written: ${PREVIEW_SVG_PATH}`)
}

main().catch((err) => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
