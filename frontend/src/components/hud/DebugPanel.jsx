import { useGameStore } from '../../store/useGameStore'

export function DebugPanel() {
  const debugVisible = useGameStore((s) => s.debugVisible)
  const debugStats = useGameStore((s) => s.debugStats)

  if (!debugVisible) {
    return null
  }

  return (
    <div className="debug-panel">
      <div className="debug-title">Diagnóstico de Rede / Motor (F3)</div>
      <div>RTT (ping/pong): {debugStats.rtt} ms</div>
      <div>Inputs pendentes: {debugStats.pendingInputs}</div>
      <div>
        Última correção: {debugStats.lastCorrectionDistance.toFixed(4)} m
      </div>
      <div>Tick do servidor: {debugStats.serverTick}</div>
      <div>FPS: {debugStats.fps}</div>
      <div>
        Latência simulada (F4): ±{debugStats.fakeLatencyMs} ms (
        {debugStats.fakeLatencyMs * 2} ms RTT extra)
      </div>
    </div>
  )
}
