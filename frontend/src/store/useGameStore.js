import { create } from 'zustand'

const initialDebugStats = {
  rtt: 0,
  pendingInputs: 0,
  lastCorrectionDistance: 0,
  serverTick: 0,
  fps: 0,
  fakeLatencyMs: 0,
}

export const REJECTION_MESSAGES_PT_BR = {
  INVALID: 'Pedido inválido.',
  OUT_OF_BOUNDS: 'Fora dos limites do mapa.',
  TOO_MANY: 'Limite de estruturas atingido.',
  BLOCKED_BY_PLAYER: 'Há um jogador no local.',
  NOT_FOUND: 'Estrutura não encontrada.',
  RATE_LIMITED: 'Muitos pedidos. Aguarde um instante.',
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

  buildMode: false,
  buildTool: 'place',
  selectedKind: 'wall',
  draftSize: { width: 4, height: 3, depth: 0.3 },
  draftColor: '#cccccc',
  selectedStructureId: null,
  rejectionToast: null,

  setPlayerName: (playerName) => set({ playerName }),
  setScreen: (screen) => set({ screen }),
  setMapData: (mapData) => {
    const defaultWall = mapData?.build?.kinds?.wall
    set({
      mapData,
      selectedKind: 'wall',
      draftSize: defaultWall
        ? {
            width: defaultWall.width,
            height: defaultWall.height,
            depth: defaultWall.depth,
          }
        : { width: 4, height: 3, depth: 0.3 },
      draftColor: defaultWall?.color || '#cccccc',
    })
  },
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

  setBuildMode: (buildMode) =>
    set({
      buildMode,
      selectedStructureId: null,
    }),
  setBuildTool: (buildTool) =>
    set((state) => ({
      buildTool,
      selectedStructureId:
        buildTool === 'place' ? null : state.selectedStructureId,
    })),
  selectBuildKind: (kind) =>
    set((state) => {
      const spec = state.mapData?.build?.kinds?.[kind]
      if (!spec) {
        return { selectedKind: kind, buildTool: 'place', selectedStructureId: null }
      }
      return {
        selectedKind: kind,
        buildTool: 'place',
        selectedStructureId: null,
        draftSize: {
          width: spec.width,
          height: spec.height,
          depth: spec.depth,
        },
        draftColor: spec.color,
      }
    }),
  setDraftSize: (partialSize) =>
    set((state) => ({
      draftSize: { ...state.draftSize, ...partialSize },
    })),
  setDraftColor: (draftColor) => set({ draftColor }),
  setSelectedStructure: (structure) =>
    set((state) => {
      if (!structure) {
        return { selectedStructureId: null }
      }
      return {
        selectedStructureId: structure.id,
        draftSize: {
          width: structure.width,
          height: structure.height,
          depth: structure.depth,
        },
        draftColor: structure.color || state.draftColor,
      }
    }),
  showRejectionToast: (code) =>
    set({
      rejectionToast: {
        id: Date.now() + Math.random(),
        code,
        message: REJECTION_MESSAGES_PT_BR[code] || REJECTION_MESSAGES_PT_BR.INVALID,
      },
    }),
  clearRejectionToast: () => set({ rejectionToast: null }),

  resetToLogin: (errorMessage = null) =>
    set({
      screen: errorMessage ? 'error' : 'login',
      playerId: null,
      connectionStatus: 'disconnected',
      errorMessage,
      pointerLocked: false,
      onlinePlayers: {},
      debugStats: { ...initialDebugStats },
      buildMode: false,
      buildTool: 'place',
      selectedStructureId: null,
      rejectionToast: null,
    }),
}))
