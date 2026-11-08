import { useEffect } from 'react'
import { useGameStore } from '../../store/useGameStore'

const KIND_LABELS = [
  { key: 'wall', label: 'Parede', shortcut: '1' },
  { key: 'floor', label: 'Piso', shortcut: '2' },
  { key: 'block', label: 'Bloco', shortcut: '3' },
]

export function BuildPanel({ engineRef }) {
  const mapData = useGameStore((s) => s.mapData)
  const buildMode = useGameStore((s) => s.buildMode)
  const buildTool = useGameStore((s) => s.buildTool)
  const selectedKind = useGameStore((s) => s.selectedKind)
  const draftSize = useGameStore((s) => s.draftSize)
  const draftColor = useGameStore((s) => s.draftColor)
  const selectedStructureId = useGameStore((s) => s.selectedStructureId)
  const rejectionToast = useGameStore((s) => s.rejectionToast)
  const canUndo = useGameStore((s) => s.canUndo)
  const canRedo = useGameStore((s) => s.canRedo)

  const selectBuildKind = useGameStore((s) => s.selectBuildKind)
  const setBuildTool = useGameStore((s) => s.setBuildTool)
  const clearRejectionToast = useGameStore((s) => s.clearRejectionToast)

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
          <div className="build-btn-row">
            <button
              type="button"
              className="build-btn"
              disabled={!canUndo}
              onClick={() => getBuildCtrl()?.undo()}
            >
              Desfazer (Ctrl+Z)
            </button>
            <button
              type="button"
              className="build-btn"
              disabled={!canRedo}
              onClick={() => getBuildCtrl()?.redo()}
            >
              Refazer (Ctrl+Y)
            </button>
            <button
              type="button"
              className="build-btn build-btn-exit"
              onClick={() => getBuildCtrl()?.exitBuildMode()}
            >
              Sair (B)
            </button>
          </div>
        </div>

        <div className="build-section">
          <span className="build-section-label">Ferramenta (Q)</span>
          <div className="build-btn-row">
            <button
              type="button"
              className={`build-btn ${buildTool === 'place' ? 'active' : ''}`}
              onClick={() => {
                getBuildCtrl()?.clearPendingDebounce()
                setBuildTool('place')
              }}
            >
              Colocar
            </button>
            <button
              type="button"
              className={`build-btn ${buildTool === 'select' ? 'active' : ''}`}
              onClick={() => {
                getBuildCtrl()?.clearPendingDebounce()
                setBuildTool('select')
              }}
            >
              Selecionar
            </button>
            <button
              type="button"
              className="build-btn"
              onClick={() => getBuildCtrl()?.copyHoveredOrSelectedStructure()}
            >
              Copiar p/ Rascunho (G / Alt+Clique)
            </button>
          </div>
        </div>

        <div className="build-section">
          <span className="build-section-label">Tipo (1 / 2 / 3)</span>
          <div className="build-btn-row">
            {KIND_LABELS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`build-btn ${
                  buildTool === 'place' && selectedKind === item.key
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
              <span>Profundidade</span>
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
            <span>Cor</span>
            <input
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
            className="build-btn build-btn-danger"
            disabled={!selectedStructureId}
            onClick={() => getBuildCtrl()?.removeSelectedStructure()}
          >
            Remover (Del)
          </button>
        </div>

        <div className="build-shortcuts">
          <strong>Atalhos:</strong> Botão Direito: Olhar | WASD/Espaço/C/Shift:
          Voar | 1/2/3: Tipo | Q: Ferramenta | R: Girar | G / Alt+Clique: Copiar
          | Ctrl+Z/Y: Desfazer/Refazer | PgUp/PgDn: Offset Y | Del: Remover
        </div>
      </div>
    </>
  )
}
