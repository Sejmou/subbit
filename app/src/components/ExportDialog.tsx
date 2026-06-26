import { useEffect, useState } from 'react'
import {
  DEFAULT_DIARIZED_EXPORT_OPTIONS,
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportRequest,
} from '../lib/export-format'
import { useProject } from '../store/project'

interface Props {
  open: boolean
  onExport: (request: ExportRequest) => void
  onClose: () => void
}

/** Choose export format and run export. */
export function ExportDialog({ open, onExport, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('ass')
  const [speakerLabels, setSpeakerLabels] = useState(DEFAULT_DIARIZED_EXPORT_OPTIONS.speakerLabels)
  const [speakerColors, setSpeakerColors] = useState(DEFAULT_DIARIZED_EXPORT_OPTIONS.speakerColors)
  const timecodeOffset = useProject((s) => s.project?.timecodeOffset ?? '')
  const setTimecodeOffset = useProject((s) => s.setTimecodeOffset)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const selected = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0]

  return (
    <div className="help-backdrop" onMouseDown={onClose}>
      <div className="export-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="export-head">
          <h2>Export</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <label className="export-field">
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            {EXPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <p className="hint export-hint">{selected.hint}</p>

        {selected.supportsDiarization && (
          <div className="export-options">
            <label className="export-check">
              <input
                type="checkbox"
                checked={speakerLabels}
                onChange={(e) => setSpeakerLabels(e.target.checked)}
              />
              Speaker labels
            </label>
            <label className="export-check">
              <input
                type="checkbox"
                checked={speakerColors}
                onChange={(e) => setSpeakerColors(e.target.checked)}
              />
              Speaker colors
            </label>
          </div>
        )}

        {selected.usesDeliveryOffset && (
          <>
            <label className="export-field">
              Offset
              <input
                value={timecodeOffset}
                onChange={(e) => setTimecodeOffset(e.target.value)}
                size={11}
                spellCheck={false}
                title="Broadcast start offset (HH:MM:SS:FF)"
              />
            </label>
            <p className="hint">Also used for SMPTE timestamps in the cue list.</p>
          </>
        )}

        <button
          type="button"
          className="primary wide export-action"
          onClick={() => {
            onExport({
              format,
              diarized: { speakerLabels, speakerColors },
            })
            onClose()
          }}
        >
          Export .{selected.ext}
        </button>
      </div>
    </div>
  )
}
