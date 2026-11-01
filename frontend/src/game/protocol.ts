import type { PlayerState, RemotePlayerInfo } from './types'

// ============================================================================
// Client-to-Server Messages (Discriminated Union on `type`)
// ============================================================================

export interface JoinClientMessage {
  type: 'join'
  name: string
}

export interface InputClientMessage {
  type: 'input'
  seq: number
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  run: boolean
  jump: boolean
  yaw: number
  pitch: number
}

export interface PingClientMessage {
  type: 'ping'
  t: number
}

export type ClientMessage =
  | JoinClientMessage
  | InputClientMessage
  | PingClientMessage

// ============================================================================
// Server-to-Client Messages (Discriminated Union on `type`)
// ============================================================================

export interface WelcomeMessage {
  type: 'welcome'
  playerId: string
  tickRate: number
  snapshotRate: number
  self: PlayerState
  players: RemotePlayerInfo[]
}

export interface PlayerJoinedMessage {
  type: 'player_joined'
  id: string
  name: string
  state: PlayerState
}

export interface PlayerLeftMessage {
  type: 'player_left'
  id: string
}

export interface SnapshotPlayerEntry {
  id: string
  x: number
  y: number
  z: number
  vy: number
  onGround: boolean
  yaw: number
  pitch: number
  seq: number
}

export interface SnapshotMessage {
  type: 'snapshot'
  tick: number
  players: SnapshotPlayerEntry[]
}

export interface PongMessage {
  type: 'pong'
  t: number
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export type ServerMessage =
  | WelcomeMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | SnapshotMessage
  | PongMessage
  | ErrorMessage
