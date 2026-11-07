import { create } from 'zustand'

const initialDebugStats = {
  rtt: 0,
  pendingInputs: 0,
  lastCorrectionDistance: 0,
  serverTick: 0,
  fps: 0,
  fakeLatencyMs: 0,
}

export const useGameStore = create((set) => ({
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
