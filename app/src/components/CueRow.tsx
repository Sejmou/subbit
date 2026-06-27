import { memo, useEffect, useRef, Fragment, type RefObject } from "react";
import type { Cue, Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import { useAutosizeTextarea } from "../hooks/useAutosizeTextarea";
import { openRolePicker, NO_ROLE_LABEL } from "../lib/role-picker";
import { shortcutLabel } from "../lib/shortcuts";
import { secondsToTimecode } from "../lib/timecode";

interface Props {
  cue: Cue;
  index: number;
  project: Project;
  selected: boolean;
  active: boolean;
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

interface SegmentTextareaProps {
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  cueId: string;
  segIndex: number;
  value: string;
  onFocus: () => void;
  onChange: (value: string) => void;
}

function SegmentTextarea({
  inputRef,
  cueId,
  segIndex,
  value,
  onFocus,
  onChange,
}: SegmentTextareaProps) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  useAutosizeTextarea(ref, value);

  return (
    <textarea
      ref={ref}
      className="seg-text"
      data-cue-id={cueId}
      data-seg-index={segIndex}
      rows={1}
      value={value}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function CueRowImpl({ cue, index, project, selected, active }: Props) {
  const firstTextarea = useRef<HTMLTextAreaElement>(null);
  const {
    selectCue,
    selectSegment,
    setSegmentText,
    setSegmentShot,
    toggleReviewed,
    splitAtMergedSegment,
    deleteCue,
  } = useProject();
  const seek = usePlayback((s) => s.seek);

  // Focus this row's text when navigation mode requests editing.
  useEffect(() => {
    function onEdit(e: Event) {
      if ((e as CustomEvent<string>).detail === cue.id)
        firstTextarea.current?.focus();
    }
    window.addEventListener("subbit:edit", onEdit);
    return () => window.removeEventListener("subbit:edit", onEdit);
  }, [cue.id]);

  const speaker = project.speakers.find((s) => s.id === cue.speakerId);
  const cls = [
    "cue-row",
    selected && "selected",
    active && "active",
    cue.reviewed && "reviewed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      onMouseDown={() => selectCue(cue.id)}
      style={{ borderLeftColor: speaker?.color ?? "transparent" }}
    >
      <div className="cue-gutter">
        <span className="cue-no">{index + 1}</span>
        <input
          type="checkbox"
          checked={!!cue.reviewed}
          onChange={() => toggleReviewed(cue.id)}
          title="Reviewed"
        />
      </div>

      <div className="cue-times">
        <button
          className="tc"
          title="Seek to In"
          onClick={() => seek(cue.start)}
        >
          {secondsToTimecode(cue.start, project.fps, project.timecodeOffset)}
        </button>
        <button
          className="tc"
          title="Seek to Out"
          onClick={() => seek(cue.end)}
        >
          {secondsToTimecode(cue.end, project.fps, project.timecodeOffset)}
        </button>
      </div>

      <button
        type="button"
        className="speaker-select role-trigger"
        title="Assign role (A)"
        style={{ color: speaker?.color }}
        onClick={(e) => {
          e.stopPropagation();
          selectCue(cue.id);
          openRolePicker(cue.id);
        }}
      >
        <span className="role-trigger-label">
          {speaker?.name?.trim() || NO_ROLE_LABEL}
        </span>
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
                    e.stopPropagation();
                    splitAtMergedSegment(cue.id, i);
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
              <SegmentTextarea
                inputRef={i === 0 ? firstTextarea : undefined}
                cueId={cue.id}
                segIndex={i}
                value={seg.text}
                onFocus={() => {
                  selectCue(cue.id);
                  selectSegment(i);
                }}
                onChange={(text) => setSegmentText(cue.id, i, text)}
              />
            </div>
          </Fragment>
        ))}
      </div>

      <button
        type="button"
        className="cue-delete-btn"
        title={`Delete cue (${shortcutLabel("delete-cue")})`}
        aria-label={`Delete cue ${index + 1}`}
        onClick={(e) => {
          e.stopPropagation();
          deleteCue(cue.id);
        }}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

export const CueRow = memo(CueRowImpl);
