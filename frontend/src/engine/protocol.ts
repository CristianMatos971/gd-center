import type { PlayerState } from '../types/game'

export interface WelcomeMessage {
  type: 'welcome'
  playerId: string
  tickRate: number
  snapshotRate: number
  self: PlayerState
  players: Array<{
    id: string
    name: string
    state: PlayerState
  }>
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
