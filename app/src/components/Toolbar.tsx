import type { Project } from '../types'
import type { Delimiter } from '../lib/export-csv'
import { useProject } from '../store/project'
import { MOD_LABEL } from '../lib/shortcuts'

interface Props {
  project: Project
  dirty: boolean
  lastSavedAt: number | null
  delimiter: Delimiter
  setDelimiter: (d: Delimiter) => void
  onSave: () => void
  onExportCsv: () => void
  onExportSrt: () => void
  onHelp: () => void
  onHistory: () => void
}

export function Toolbar({
  project,
  dirty,
  lastSavedAt,
  delimiter,
  setDelimiter,
  onSave,
  onExportCsv,
  onExportSrt,
  onHelp,
  onHistory,
}: Props) {
  const setTimecodeOffset = useProject((s) => s.setTimecodeOffset)
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const canUndo = useProject((s) => s.past.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const reviewed = project.cues.filter((c) => c.reviewed).length
  const total = project.cues.length

  return (
    <div className="toolbar">
      <strong className="brand">Subbit</strong>
      <span className="progress">
        {reviewed}/{total} reviewed
      </span>

      <span className="btn-group">
        <button onClick={undo} disabled={!canUndo} title={`Undo (${MOD_LABEL}+Z)`}>
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title={`Redo (${MOD_LABEL}+Shift+Z)`}>
          Redo
        </button>
      </span>

      <label className="field">
        Offset
        <input
          value={project.timecodeOffset}
          onChange={(e) => setTimecodeOffset(e.target.value)}
          size={11}
        />
      </label>
      <span className="field">fps {project.fps}</span>

      <label className="field">
        Export as
        <select value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)}>
          <option value={'\t'}>TSV (tab)</option>
          <option value={','}>CSV (comma)</option>
        </select>
      </label>

      <span className="spacer" />

      <span className="save-state">
        {dirty ? 'Unsaved changes' : lastSavedAt ? 'Saved' : ''}
      </span>
      <button onClick={onHistory} title="Version history">
        History
      </button>
      <button onClick={onSave} title="Save project (Cmd/Ctrl+S)">
        Save project
      </button>
      <button onClick={onExportSrt}>Export .srt</button>
      <button className="primary" onClick={onExportCsv}>
        Export delivery
      </button>
      <button className="help-btn" onClick={onHelp} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
        ?
      </button>
    </div>
  )
}
