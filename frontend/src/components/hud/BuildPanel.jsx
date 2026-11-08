import { useEffect, useRef } from 'react'
import { useGameStore } from '../../store/useGameStore'

const KIND_LABELS = [
  { key: 'wall', label: 'Parede', shortcut: '1' },
  { key: 'floor', label: 'Piso', shortcut: '2' },
  { key: 'block', label: 'Bloco', shortcut: '3' },
]

export function BuildPanel({ engineRef }) {
  const mapData = useGameStore((s) => s.mapData)
  const buildMode = useGameStore((s) => s.buildMode)
  const selectedKind = useGameStore((s) => s.selectedKind)
  const draftSize = useGameStore((s) => s.draftSize)
  const draftColor = useGameStore((s) => s.draftColor)
  const selectedStructureId = useGameStore((s) => s.selectedStructureId)
  const selectedStructurePos = useGameStore((s) => s.selectedStructurePos)
  const rejectionToast = useGameStore((s) => s.rejectionToast)
  const canUndo = useGameStore((s) => s.canUndo)
  const canRedo = useGameStore((s) => s.canRedo)
  const pointerLocked = useGameStore((s) => s.pointerLocked)

  const selectBuildKind = useGameStore((s) => s.selectBuildKind)
  const clearRejectionToast = useGameStore((s) => s.clearRejectionToast)

  const colorInputRef = useRef(null)

  useEffect(() => {
    const ctrl = engineRef?.current?.buildController
    if (!ctrl) return
    ctrl.setOpenColorPickerCallback(() => {
      const input = colorInputRef.current
      if (!input) return
      if (typeof input.showPicker === 'function') {
        try {
          input.showPicker()
          return
        } catch {
          input.click()
          return
        }
      }
      input.click()
    })
    return () => {
      ctrl.setOpenColorPickerCallback(null)
    }
  }, [engineRef, buildMode])

  useEffect(() => {
    if (!rejectionToast) return
    const timer = window.setTimeout(() => {
      clearRejectionToast()
    }, 2600)
    return () => clearTimeout(timer)
  }, [rejectionToast, clearRejectionToast])

  if (!buildMode || !mapData?.build) {
    return null
  }

  const { grid, minSize, maxSize } = mapData.build
  const getBuildCtrl = () => engineRef?.current?.buildController

  return (
    <>
      {rejectionToast && (
        <div className="build-toast" role="status">
          {rejectionToast.message}
        </div>
      )}

      <div className="build-panel">
        <div className="build-panel-header">
          <span className="build-panel-title">Modo Construção</span>
          <button
            type="button"
            className="build-btn build-btn-exit"
            onClick={() => getBuildCtrl()?.exitBuildMode()}
          >
            Sair (B)
          </button>
        </div>

        <div className="build-btn-row">
          <button
            type="button"
            className={`build-btn ${pointerLocked ? 'active' : ''}`}
            onClick={() => getBuildCtrl()?.toggleFreeLook()}
          >
            Free Look (F): {pointerLocked ? 'Ativo' : 'Livre'}
          </button>
          <button
            type="button"
            className="build-btn"
            disabled={!canUndo}
            onClick={() => getBuildCtrl()?.undo()}
          >
            Desfazer
          </button>
          <button
            type="button"
            className="build-btn"
            disabled={!canRedo}
            onClick={() => getBuildCtrl()?.redo()}
          >
            Refazer
          </button>
        </div>

        <div className="build-section">
          <span className="build-section-label">Tipo para Colocar (1 / 2 / 3)</span>
          <div className="build-btn-row">
            {KIND_LABELS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`build-btn ${
                  !selectedStructureId && selectedKind === item.key
                    ? 'active'
                    : ''
                }`}
                onClick={() => {
                  const ctrl = getBuildCtrl()
                  if (ctrl) {
                    ctrl.verticalOffset = 0
                  }
                  selectBuildKind(item.key)
                }}
              >
                {item.label} ({item.shortcut})
              </button>
            ))}
          </div>
        </div>

        {selectedStructureId && selectedStructurePos && (
          <div className="build-section">
            <span className="build-section-label">
              Posição do Objeto (Arraste ou Setas/PgUp/PgDn)
            </span>
            <div className="build-dimensions-grid">
              <label className="build-field">
                <span>X</span>
                <input
                  type="number"
                  step={grid}
                  value={selectedStructurePos.x}
                  onChange={(e) =>
                    getBuildCtrl()?.updateSelectedPositionField(
                      'x',
                      e.target.value
                    )
                  }
                />
              </label>
              <label className="build-field">
                <span>Y</span>
                <input
                  type="number"
                  step={grid}
                  value={selectedStructurePos.y}
                  onChange={(e) =>
                    getBuildCtrl()?.updateSelectedPositionField(
                      'y',
                      e.target.value
                    )
                  }
                />
              </label>
              <label className="build-field">
                <span>Z</span>
                <input
                  type="number"
                  step={grid}
                  value={selectedStructurePos.z}
                  onChange={(e) =>
                    getBuildCtrl()?.updateSelectedPositionField(
                      'z',
                      e.target.value
                    )
                  }
                />
              </label>
            </div>
          </div>
        )}

        <div className="build-section">
          <span className="build-section-label">Dimensões (m)</span>
          <div className="build-dimensions-grid">
            <label className="build-field">
              <span>Largura</span>
              <input
                type="number"
                step={grid}
                min={minSize}
                max={maxSize}
                value={draftSize.width}
                onChange={(e) =>
                  getBuildCtrl()?.updateDraftDimension('width', e.target.value)
                }
              />
            </label>
            <label className="build-field">
              <span>Altura</span>
              <input
                type="number"
                step={grid}
                min={minSize}
                max={maxSize}
                value={draftSize.height}
                onChange={(e) =>
                  getBuildCtrl()?.updateDraftDimension('height', e.target.value)
                }
              />
            </label>
            <label className="build-field">
              <span>Profund.</span>
              <input
                type="number"
                step={grid}
                min={minSize}
                max={maxSize}
                value={draftSize.depth}
                onChange={(e) =>
                  getBuildCtrl()?.updateDraftDimension('depth', e.target.value)
                }
              />
            </label>
          </div>
        </div>

        <div className="build-section build-row-inline">
          <label className="build-color-label">
            <span>Cor (X)</span>
            <input
              ref={colorInputRef}
              type="color"
              value={draftColor}
              onChange={(e) => getBuildCtrl()?.updateDraftColor(e.target.value)}
            />
          </label>

          <button
            type="button"
            className="build-btn"
            onClick={() => getBuildCtrl()?.rotate90()}
          >
            Girar 90° (R)
          </button>

          <button
            type="button"
            className="build-btn"
            onClick={() => getBuildCtrl()?.copyHoveredOrSelectedStructure()}
          >
            Copiar (G)
          </button>

          <button
            type="button"
            className="build-btn build-btn-danger"
            onClick={() => getBuildCtrl()?.removeSelectedOrHoveredStructure()}
          >
            Remover (Q)
          </button>
        </div>

        <div className="build-shortcuts">
          <div>
            <strong>Mouse Esq:</strong> Colocar |{' '}
            <strong>Mouse Dir:</strong> Selecionar / Arrastar
          </div>
          <div>
            <strong>F:</strong> Free Look | <strong>Q:</strong> Remover |{' '}
            <strong>X:</strong> Cor | <strong>R:</strong> Girar |{' '}
            <strong>G:</strong> Copiar
          </div>
          <div>
            <strong>WASD/Espaço/C/Shift:</strong> Voar |{' '}
            <strong>Setas/PgUp/PgDn:</strong> Mover
          </div>
        </div>
      </div>
    </>
  )
}
