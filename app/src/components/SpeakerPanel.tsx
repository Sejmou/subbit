import { useState } from 'react'
import type { Project } from '../types'
import { useProject } from '../store/project'

/** Maps diarization labels (SPEAKER_00) to real character names (Rolle). */
export function SpeakerPanel({ project }: { project: Project }) {
  const { renameSpeaker, setSpeakerColor, addSpeaker } = useProject()
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
      <p className="hint">Rename SPEAKER_x to character names. Press 1-9 to assign to the selected cue.</p>
      <ul>
        {project.speakers.map((s, i) => (
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
              placeholder={s.id}
              onChange={(e) => renameSpeaker(s.id, e.target.value)}
            />
            <span className="label-id" title="diarization label">
              {s.id}
            </span>
          </li>
        ))}
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
