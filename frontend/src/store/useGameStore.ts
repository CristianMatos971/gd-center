import { create } from 'zustand'
import type { DebugStats, Map } from '../game/types'

export type ScreenState = 'login' | 'connecting' | 'playing' | 'error'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface GameUIState {
  screen: ScreenState
  playerName: string
  playerId: string | null
  mapData: Map | null
  connectionStatus: ConnectionStatus
  errorMessage: string | null
  pointerLocked: boolean
  onlinePlayers: Record<string, string> // id -> name
  debugVisible: boolean
  debugStats: DebugStats

  setPlayerName: (name: string) => void
  setScreen: (screen: ScreenState) => void
  setMapData: (map: Map | null) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setErrorMessage: (msg: string | null) => void
  setPointerLocked: (locked: boolean) => void
  setPlayerId: (id: string | null) => void
  setOnlinePlayers: (players: Record<string, string>) => void
  upsertOnlinePlayer: (id: string, name: string) => void
  removeOnlinePlayer: (id: string) => void
  toggleDebugVisible: () => void
  updateDebugStats: (partial: Partial<DebugStats>) => void
  resetToLogin: (errorMessage?: string | null) => void
}

const initialDebugStats: DebugStats = {
  rtt: 0,
  pendingInputs: 0,
  lastCorrectionDistance: 0,
  serverTick: 0,
  fps: 0,
  fakeLatencyMs: 0,
}

export const useGameStore = create<GameUIState>((set) => ({
  screen: 'login',
  playerName: '',
  playerId: null,
  mapData: null,
  connectionStatus: 'disconnected',
  errorMessage: null,
  pointerLocked: false,
  onlinePlayers: {},
  debugVisible: false,
  debugStats: { ...initialDebugStats },

  setPlayerName: (playerName) => set({ playerName }),
  setScreen: (screen) => set({ screen }),
  setMapData: (mapData) => set({ mapData }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setPlayerId: (playerId) => set({ playerId }),
  setOnlinePlayers: (onlinePlayers) => set({ onlinePlayers }),
  upsertOnlinePlayer: (id, name) =>
    set((state) => ({
      onlinePlayers: { ...state.onlinePlayers, [id]: name },
    })),
  removeOnlinePlayer: (id) =>
    set((state) => {
      const next = { ...state.onlinePlayers }
      delete next[id]
      return { onlinePlayers: next }
    }),
  toggleDebugVisible: () =>
    set((state) => ({ debugVisible: !state.debugVisible })),
  updateDebugStats: (partial) =>
    set((state) => ({
      debugStats: { ...state.debugStats, ...partial },
    })),
  resetToLogin: (errorMessage = null) =>
    set({
      screen: errorMessage ? 'error' : 'login',
      playerId: null,
      connectionStatus: 'disconnected',
      errorMessage,
      pointerLocked: false,
      onlinePlayers: {},
      debugStats: { ...initialDebugStats },
    }),
}))
