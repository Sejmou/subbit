import { memo, useEffect, useRef } from 'react'
import type { Cue, Project } from '../types'
import { useProject } from '../store/project'
import { usePlayback } from '../store/playback'
import { secondsToTimecode } from '../lib/timecode'

interface Props {
  cue: Cue
  index: number
  project: Project
  selected: boolean
  active: boolean
}

function CueRowImpl({ cue, index, project, selected, active }: Props) {
  const firstTextarea = useRef<HTMLTextAreaElement>(null)
  const {
    selectCue,
    selectSegment,
    setSegmentText,
    setCueSpeaker,
    setSegmentShot,
    toggleReviewed,
  } = useProject()
  const seek = usePlayback((s) => s.seek)

  // Focus this row's text when navigation mode requests editing.
  useEffect(() => {
    function onEdit(e: Event) {
      if ((e as CustomEvent<string>).detail === cue.id) firstTextarea.current?.focus()
    }
    window.addEventListener('subbit:edit', onEdit)
    return () => window.removeEventListener('subbit:edit', onEdit)
  }, [cue.id])

  const speaker = project.speakers.find((s) => s.id === cue.speakerId)
  const cls = ['cue-row', selected && 'selected', active && 'active', cue.reviewed && 'reviewed']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      onMouseDown={() => selectCue(cue.id)}
      style={{ borderLeftColor: speaker?.color ?? 'transparent' }}
    >
      <div className="cue-gutter">
        <span className="cue-no">{index + 1}</span>
        {cue.multiSpeaker && <span className="flag" title="whisperx detected multiple speakers">M</span>}
        <input
          type="checkbox"
          checked={!!cue.reviewed}
          onChange={() => toggleReviewed(cue.id)}
          title="Reviewed"
        />
      </div>

      <div className="cue-times">
        <button className="tc" title="Seek to In" onClick={() => seek(cue.start)}>
          {secondsToTimecode(cue.start, project.fps, project.timecodeOffset)}
        </button>
        <button className="tc" title="Seek to Out" onClick={() => seek(cue.end)}>
          {secondsToTimecode(cue.end, project.fps, project.timecodeOffset)}
        </button>
      </div>

      <select
        className="speaker-select"
        value={cue.speakerId ?? ''}
        onChange={(e) => setCueSpeaker(cue.id, e.target.value || null)}
        style={{ color: speaker?.color }}
      >
        <option value="">— Rolle —</option>
        {project.speakers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <div className="cue-segments">
        {cue.segments.map((seg, i) => (
          <div className="segment" key={i}>
            <select
              className="shot-select"
              value={seg.shot}
              onChange={(e) => setSegmentShot(cue.id, i, e.target.value)}
              title="Shot type (Info)"
            >
              {project.shots.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.id}
                </option>
              ))}
            </select>
            <textarea
              ref={i === 0 ? firstTextarea : undefined}
              className="seg-text"
              data-cue-id={cue.id}
              data-seg-index={i}
              rows={1}
              value={seg.text}
              onFocus={() => {
                selectCue(cue.id)
                selectSegment(i)
              }}
              onChange={(e) => setSegmentText(cue.id, i, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export const CueRow = memo(CueRowImpl)
