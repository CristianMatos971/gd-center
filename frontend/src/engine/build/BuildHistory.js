const MAX_HISTORY_ENTRIES = 50
const COORD_TOLERANCE = 1e-3

function matchesSpec(structure, spec) {
  return (
    structure.kind === spec.kind &&
    structure.color.toLowerCase() === spec.color.toLowerCase() &&
    Math.abs(structure.x - spec.x) < COORD_TOLERANCE &&
    Math.abs(structure.y - spec.y) < COORD_TOLERANCE &&
    Math.abs(structure.z - spec.z) < COORD_TOLERANCE &&
    Math.abs(structure.width - spec.width) < COORD_TOLERANCE &&
    Math.abs(structure.height - spec.height) < COORD_TOLERANCE &&
    Math.abs(structure.depth - spec.depth) < COORD_TOLERANCE
  )
}

function sameTransformAndStyle(a, b) {
  return (
    a.color.toLowerCase() === b.color.toLowerCase() &&
    Math.abs(a.x - b.x) < COORD_TOLERANCE &&
    Math.abs(a.y - b.y) < COORD_TOLERANCE &&
    Math.abs(a.z - b.z) < COORD_TOLERANCE &&
    Math.abs(a.width - b.width) < COORD_TOLERANCE &&
    Math.abs(a.height - b.height) < COORD_TOLERANCE &&
    Math.abs(a.depth - b.depth) < COORD_TOLERANCE
  )
}

export class BuildHistory {
  constructor(networkClient, onStateChange) {
    this.networkClient = networkClient
    this.onStateChange = onStateChange
    this.undoStack = []
    this.redoStack = []
    this.pendingAdds = []
  }

  get canUndo() {
    return this.undoStack.length > 0
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  notify() {
    this.onStateChange?.({
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    })
  }

  recordPendingPlace(spec) {
    this.pendingAdds.push({
      mode: 'new_place',
      spec: { ...spec },
    })
  }

  recordUpdate(beforeStructure, afterStructure) {
    if (!beforeStructure || !afterStructure) return
    if (sameTransformAndStyle(beforeStructure, afterStructure)) return

    this.pushUndo({
      type: 'update',
      before: { ...beforeStructure },
      after: { ...afterStructure },
    })
    this.redoStack = []
    this.notify()
  }

  recordRemove(removedStructure) {
    if (!removedStructure) return
    this.pushUndo({
      type: 'remove',
      structure: { ...removedStructure },
    })
    this.redoStack = []
    this.notify()
  }

  handleStructuresAdded(addedStructures = []) {
    if (addedStructures.length === 0 || this.pendingAdds.length === 0) return

    let changed = false
    for (const s of addedStructures) {
      const idx = this.pendingAdds.findIndex((p) => matchesSpec(s, p.spec))
      if (idx === -1) continue

      const pending = this.pendingAdds.splice(idx, 1)[0]
      if (pending.mode === 'new_place') {
        this.pushUndo({
          type: 'place',
          structure: { ...s },
        })
        this.redoStack = []
        changed = true
      } else if (pending.mode === 'rebind_id' && pending.oldId) {
        this.rebindStructureId(pending.oldId, s.id)
      }
    }

    if (changed) {
      this.notify()
    }
  }

  handleRejected() {
    if (this.pendingAdds.length > 0) {
      this.pendingAdds.shift()
    }
  }

  undo() {
    if (this.undoStack.length === 0) return
    const action = this.undoStack.pop()
    this.redoStack.push(action)

    switch (action.type) {
      case 'place':
        this.networkClient.sendBuildRemove(action.structure.id)
        break
      case 'remove':
        this.pendingAdds.push({
          mode: 'rebind_id',
          oldId: action.structure.id,
          spec: { ...action.structure },
        })
        this.networkClient.sendBuildPlace(action.structure)
        break
      case 'update':
        this.networkClient.sendBuildUpdate(action.before)
        break
    }

    this.notify()
  }

  redo() {
    if (this.redoStack.length === 0) return
    const action = this.redoStack.pop()
    this.undoStack.push(action)

    switch (action.type) {
      case 'place':
        this.pendingAdds.push({
          mode: 'rebind_id',
          oldId: action.structure.id,
          spec: { ...action.structure },
        })
        this.networkClient.sendBuildPlace(action.structure)
        break
      case 'remove':
        this.networkClient.sendBuildRemove(action.structure.id)
        break
      case 'update':
        this.networkClient.sendBuildUpdate(action.after)
        break
    }

    this.notify()
  }

  rebindStructureId(oldId, newId) {
    const updateEntry = (entry) => {
      if (entry.structure && entry.structure.id === oldId) {
        entry.structure.id = newId
      }
      if (entry.before && entry.before.id === oldId) {
        entry.before.id = newId
      }
      if (entry.after && entry.after.id === oldId) {
        entry.after.id = newId
      }
    }
    this.undoStack.forEach(updateEntry)
    this.redoStack.forEach(updateEntry)
  }

  pushUndo(entry) {
    this.undoStack.push(entry)
    if (this.undoStack.length > MAX_HISTORY_ENTRIES) {
      this.undoStack.shift()
    }
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
    this.pendingAdds = []
    this.notify()
  }
}
