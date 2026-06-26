import { useCallback, useEffect, useState } from 'react'
import type { Project } from '../types'
import { parseProject, serializeProject } from '../lib/project-io'
import {
  addVersion,
  deleteVersion,
  getVersionText,
  listVersions,
  type VersionMeta,
} from '../lib/history'
import { formatRelativeTime } from '../lib/relative-time'

interface Props {
  open: boolean
  onClose: () => void
  /** The current (live) project — used as the source for new snapshots. */
  project: Project
  /** Apply a restored project to the editor (undoable via the store). */
  onRestore: (project: Project) => void
}

function formatWhen(ts: number): string {
  return `${new Date(ts).toLocaleString()} · ${formatRelativeTime(ts)}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Modal listing persisted project snapshots, with restore / snapshot / delete. */
export function HistoryPanel({ open, onClose, project, onRestore }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setVersions(await listVersions(project))
    } finally {
      setLoading(false)
    }
  }, [project])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  const onSnapshot = useCallback(async () => {
    const text = serializeProject(project)
    setVersions(await addVersion(project, text, { label: label.trim() || undefined }))
    setLabel('')
  }, [project, label])

  const onRestoreVersion = useCallback(
    async (id: string) => {
      const text = await getVersionText(project, id)
      if (!text) {
        alert('That version could not be loaded (it may have been pruned).')
        await refresh()
        return
      }
      try {
        onRestore(parseProject(text))
        onClose()
      } catch {
        alert('That version is not a valid project file.')
      }
    },
    [project, onRestore, onClose, refresh],
  )

  const onDelete = useCallback(
    async (id: string) => {
      setVersions(await deleteVersion(project, id))
    },
    [project],
  )

  if (!open) return null

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div className="help-modal history-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-head">
          <h2>Version history</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <p className="hint">
          Snapshots are saved automatically on each save and stored in this browser.
          Restoring loads an earlier state into the editor (which you can still undo).
        </p>

        <div className="history-snapshot">
          <input
            placeholder="Optional label for a snapshot…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSnapshot()
            }}
          />
          <button className="primary" onClick={() => void onSnapshot()}>
            Snapshot now
          </button>
        </div>

        {loading ? (
          <p className="hint">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="hint">No versions yet. Save the project or take a snapshot.</p>
        ) : (
          <ul className="history-list">
            {versions.map((v) => (
              <li key={v.id} className="history-item">
                <div className="history-main">
                  <span className="history-when">
                    {v.label ? <strong className="history-label">{v.label}</strong> : null}
                    {formatWhen(v.createdAt)}
                  </span>
                  <span className="history-meta">
                    {v.reviewedCount}/{v.cueCount} reviewed · {formatSize(v.size)}
                    {v.auto ? ' · auto' : ''}
                  </span>
                </div>
                <div className="history-actions">
                  <button onClick={() => void onRestoreVersion(v.id)}>Restore</button>
                  <button
                    className="danger"
                    onClick={() => void onDelete(v.id)}
                    title="Delete this version"
                    aria-label="Delete this version"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
