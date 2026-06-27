import { memo, useEffect, useRef, Fragment } from 'react'
import type { Cue, Project } from '../types'
import { useProject } from '../store/project'
import { usePlayback } from '../store/playback'
import { openRolePicker, NO_ROLE_LABEL } from '../lib/role-picker'
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
    setSegmentShot,
    toggleReviewed,
    splitAtMergedSegment,
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

      <button
        type="button"
        className="speaker-select role-trigger"
        title="Assign role (A)"
        style={{ color: speaker?.color }}
        onClick={(e) => {
          e.stopPropagation()
          selectCue(cue.id)
          openRolePicker(cue.id)
        }}
      >
        <span className="role-trigger-label">{speaker?.name?.trim() || NO_ROLE_LABEL}</span>
        <span className="role-trigger-chevron" aria-hidden>
          ▾
        </span>
      </button>

      <div className="cue-segments">
        {cue.segments.map((seg, i) => (
          <Fragment key={i}>
            {seg.mergedWithPrevious && (
              <div className="segment-seam">
                <button
                  type="button"
                  className="segment-seam-btn"
                  title="Split back into separate cues (Shift+M)"
                  onClick={(e) => {
                    e.stopPropagation()
                    splitAtMergedSegment(cue.id, i)
                  }}
                >
                  Unmerge
                </button>
              </div>
            )}
            <div className="segment">
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
          </Fragment>
        ))}
      </div>
    </div>
  )
}

export const CueRow = memo(CueRowImpl)
