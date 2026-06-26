import type { Project } from '../types'
import { useProject } from '../store/project'

/** Maps diarization labels (SPEAKER_00) to real character names (Rolle). */
export function SpeakerPanel({ project }: { project: Project }) {
  const { renameSpeaker, setSpeakerColor } = useProject()

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
      </ul>
    </div>
  )
}
