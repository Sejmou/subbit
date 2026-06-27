import { useEffect, useState } from 'react'
import type { Project } from '../types'
import { useProject } from '../store/project'
import { shortcutLabel } from '../lib/shortcuts'
import { formatRelativeTime } from '../lib/relative-time'
import { FileMenu } from './FileMenu'

type SaveStateVariant = 'saving' | 'edited' | 'unsaved' | 'saved'

interface Props {
  project: Project
  dirty: boolean
  lastSavedAt: number | null
  autosaveEnabled: boolean
  saving: boolean
  onSave: () => void
  onExport: () => void
  onHelp: () => void
  onHistory: () => void
  onOpenProject: () => void
  onNewBlankProject: () => void
  onImportWhisperx: () => void
  onImportWaveform: () => void
  onCloseProject: () => void
  waveformLoaded: boolean
  previewEnabled: boolean
  onTogglePreview: () => void
}

function saveStateLabel(
  saving: boolean,
  dirty: boolean,
  lastSavedAt: number | null,
  autosaveEnabled: boolean,
): { label: string; title?: string; variant: SaveStateVariant | null } {
  if (saving) return { label: 'Saving…', variant: 'saving' }
  if (dirty) {
    if (autosaveEnabled) {
      return { label: 'Edited', title: 'Autosaves in a few seconds', variant: 'edited' }
    }
    return { label: 'Unsaved changes', variant: 'unsaved' }
  }
  if (lastSavedAt) {
    return { label: `Last save ${formatRelativeTime(lastSavedAt)}`, variant: 'saved' }
  }
  return { label: '', variant: null }
}

export function Toolbar({
  project,
  dirty,
  lastSavedAt,
  autosaveEnabled,
  saving,
  onSave,
  onExport,
  onHelp,
  onHistory,
  onOpenProject,
  onNewBlankProject,
  onImportWhisperx,
  onImportWaveform,
  onCloseProject,
  waveformLoaded,
  previewEnabled,
  onTogglePreview,
}: Props) {
  const undo = useProject((s) => s.undo)
  const redo = useProject((s) => s.redo)
  const canUndo = useProject((s) => s.past.length > 0)
  const canRedo = useProject((s) => s.future.length > 0)
  const reviewed = project.cues.filter((c) => c.reviewed).length
  const total = project.cues.length

  // Re-render periodically so "Last save … ago" stays fresh.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!lastSavedAt) return
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [lastSavedAt])

  const saveState = saveStateLabel(saving, dirty, lastSavedAt, autosaveEnabled)

  return (
    <div className="toolbar">
      <strong className="brand">Subbit</strong>
      <FileMenu
        onOpenProject={onOpenProject}
        onNewBlankProject={onNewBlankProject}
        onImportWhisperx={onImportWhisperx}
        onImportWaveform={onImportWaveform}
        onCloseProject={onCloseProject}
      />
      {waveformLoaded && (
        <span className="waveform-badge" title="Waveform peaks loaded (ready for timeline)">
          Waveform
        </span>
      )}
      <span className="progress">
        {reviewed}/{total} reviewed
      </span>

      <span className="btn-group">
        <button onClick={undo} disabled={!canUndo} title={`Undo (${shortcutLabel('undo')})`}>
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title={`Redo (${shortcutLabel('redo')})`}>
          Redo
        </button>
      </span>

      <span className="spacer" />

      <span className="toolbar-actions">
        <span
          className={saveState.variant ? `save-state save-state--${saveState.variant}` : 'save-state'}
          title={saveState.title}
        >
          {saveState.label}
        </span>
        <button
          className={previewEnabled ? 'preview-btn preview-btn--on' : 'preview-btn'}
          onClick={onTogglePreview}
          title={`${previewEnabled ? 'Hide' : 'Show'} subtitle preview on video (${shortcutLabel('preview-toggle')})`}
        >
          Preview
        </button>
        <button onClick={onHistory} title="Version history">
          History
        </button>
        <button
          className={dirty ? 'primary save-btn' : 'save-btn'}
          onClick={onSave}
          disabled={saving}
          title={`Save project (${shortcutLabel('save')})`}
        >
          Save
        </button>
        <button onClick={onExport}>Export…</button>
        <button className="help-btn" onClick={onHelp} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
          ?
        </button>
      </span>
    </div>
  )
}
