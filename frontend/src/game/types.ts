export interface MapBox {
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  color?: string
}

export interface PlayerDimensions {
  width: number
  height: number
  depth: number
  eyeHeight: number
}

export interface PhysicsConfig {
  tickRate: number
  gravity: number
  walkSpeed: number
  runSpeed: number
  jumpSpeed: number
  player: PlayerDimensions
}

export interface BoundsConfig {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface GroundConfig {
  y: number
  color: string
}

export interface SkyConfig {
  color: string
}

export interface SpawnPoint {
  x: number
  y: number
  z: number
  yaw: number
}

export interface Map {
  version: number
  name: string
  sky: SkyConfig
  ground: GroundConfig
  bounds: BoundsConfig
  spawnPoints: SpawnPoint[]
  boxes: MapBox[]
  physics: PhysicsConfig
}

export type MapData = Map

export interface PlayerState {
  x: number
  y: number
  z: number
  vy: number
  onGround: boolean
  yaw: number
  pitch: number
}

export interface PlayerInput {
  seq?: number
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  run: boolean
  jump: boolean
  yaw: number
  pitch: number
}

export interface RemotePlayerInfo {
  id: string
  name: string
  state: PlayerState
}

export interface DebugStats {
  rtt: number
  pendingInputs: number
  lastCorrectionDistance: number
  serverTick: number
  fps: number
  fakeLatencyMs: number
}
