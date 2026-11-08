import { useGameStore } from '../../store/useGameStore'
import { BuildPanel } from './BuildPanel'
import { DebugPanel } from './DebugPanel'
import { PointerLockOverlay } from './PointerLockOverlay'
import { StatusPanel } from './StatusPanel'

export function Hud({ engineRef, onRequestPointerLock }) {
  const screen = useGameStore((s) => s.screen)
  const buildMode = useGameStore((s) => s.buildMode)

  return (
    <>
      {screen === 'playing' && (
        <>
          <StatusPanel />
          <DebugPanel />
          <BuildPanel engineRef={engineRef} />
          {!buildMode && <div className="crosshair" />}
        </>
      )}
      <PointerLockOverlay onRequestPointerLock={onRequestPointerLock} />
    </>
  )
}
