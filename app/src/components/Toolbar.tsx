import type { Project } from '../types'
import type { Delimiter } from '../lib/export-csv'
import { useProject } from '../store/project'

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
}: Props) {
  const { setTimecodeOffset } = useProject()
  const reviewed = project.cues.filter((c) => c.reviewed).length
  const total = project.cues.length

  return (
    <div className="toolbar">
      <strong className="brand">Subbit</strong>
      <span className="progress">
        {reviewed}/{total} reviewed
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
