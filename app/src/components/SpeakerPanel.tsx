import { useState } from 'react'
import type { Project } from '../types'
import { isSpeakerReferenced } from '../lib/speaker-refs'
import { useProject } from '../store/project'

/** Maps diarization labels to real character names (Rolle). */
export function SpeakerPanel({ project }: { project: Project }) {
  const { renameSpeaker, setSpeakerColor, addSpeaker, removeSpeaker } = useProject()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const commitNewSpeaker = () => {
    const name = newName.trim()
    if (!name) return
    addSpeaker(name)
    setNewName('')
    setAdding(false)
  }

  return (
    <div className="speaker-panel">
      <h3>Roles</h3>
      <p className="hint">Name each role. Press 1–9 to assign to the selected cue.</p>
      <ul>
        {project.speakers.map((s, i) => {
          const referenced = isSpeakerReferenced(project, s.id)
          const displayName = s.name.trim() || 'Unnamed role'
          return (
            <li key={s.id}>
              <span className="qk">{i < 9 ? i + 1 : ''}</span>
              <input
                type="color"
                value={s.color}
                onChange={(e) => setSpeakerColor(s.id, e.target.value)}
                title="Color"
              />
              <input
                className="speaker-name"
                value={s.name}
                placeholder="Character name"
                aria-label={`Name for ${displayName}`}
                onChange={(e) => renameSpeaker(s.id, e.target.value)}
              />
              <button
                type="button"
                className="speaker-remove-btn"
                title={
                  referenced
                    ? `${displayName} is assigned to cues and cannot be removed`
                    : `Remove ${displayName}`
                }
                disabled={referenced}
                aria-label={`Remove ${displayName}`}
                onClick={() => removeSpeaker(s.id)}
              >
                ×
              </button>
            </li>
          )
        })}
        {adding ? (
          <li className="add-speaker-row">
            <input
              className="speaker-name"
              value={newName}
              placeholder="Character name"
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitNewSpeaker()
                if (e.key === 'Escape') {
                  setNewName('')
                  setAdding(false)
                }
              }}
              onBlur={() => {
                if (newName.trim()) commitNewSpeaker()
                else setAdding(false)
              }}
            />
          </li>
        ) : (
          <li>
            <button type="button" className="add-speaker-btn" onClick={() => setAdding(true)}>
              + Add role
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
