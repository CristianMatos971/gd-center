import { useGameStore } from '../../store/useGameStore'
import { BuildPanel } from './BuildPanel'
import { DebugPanel } from './DebugPanel'
import { PointerLockOverlay } from './PointerLockOverlay'
import { StatusPanel } from './StatusPanel'

export function Hud({ engineRef, onRequestPointerLock }) {
  const screen = useGameStore((s) => s.screen)
  const buildMode = useGameStore((s) => s.buildMode)
  const pointerLocked = useGameStore((s) => s.pointerLocked)

  return (
    <>
      {screen === 'playing' && (
        <>
          <div className="hud-left-stack">
            <StatusPanel />
            <BuildPanel engineRef={engineRef} />
          </div>
          <DebugPanel />
          {(!buildMode || pointerLocked) && <div className="crosshair" />}
        </>
      )}
      <PointerLockOverlay onRequestPointerLock={onRequestPointerLock} />
    </>
  )
}
