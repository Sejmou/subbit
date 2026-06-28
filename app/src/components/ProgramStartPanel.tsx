import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import type { Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import { useTimeReference } from "../store/time-reference";
import {
  clampProgramStart,
  contentStartSeconds,
  cuesBeforeProgramStart,
  parseProgramStartTimecode,
  programStartTimecode,
} from "../lib/program-start";
import {
  playheadClockToFileSeconds,
  playheadDisplayClock,
} from "../lib/display-time";
import {
  clampPlayheadTime,
  parseClock,
  secondsToTimecode,
} from "../lib/timecode";
import { ProgramStartHelpDialog } from "./ProgramStartHelpDialog";
import { useTip } from "./Tooltip";

interface Props {
  project: Project;
  ready: boolean;
}

/**
 * Flow 2: numeric program start + set from playhead. Lives in the waveform toolbar
 * so it sits next to the timeline marker (Flow 1).
 */
export function ProgramStartPanel({ project, ready }: Props) {
  const tip = useTip();
  const setContentStartSeconds = useProject((s) => s.setContentStartSeconds);
  const currentTime = usePlayback((s) => s.currentTime);
  const duration = usePlayback((s) => s.duration);
  const seek = usePlayback((s) => s.seek);
  const timeReference = useTimeReference((s) => s.reference);
  const setTimeReference = useTimeReference((s) => s.setReference);

  const contentStart = contentStartSeconds(project);
  const [startDraft, setStartDraft] = useState(() =>
    programStartTimecode(project),
  );
  const [playheadEditing, setPlayheadEditing] = useState(false);
  const [playheadDraft, setPlayheadDraft] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [playheadError, setPlayheadError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const playheadDirtyRef = useRef(false);

  const livePlayheadClock = playheadDisplayClock(
    currentTime,
    contentStart,
    timeReference,
  );
  const playheadValue = playheadEditing ? playheadDraft : livePlayheadClock;

  useEffect(() => {
    const next =
      contentStart <= 0
        ? "00:00:00:00"
        : secondsToTimecode(contentStart, project.fps, "00:00:00:00");
    setStartDraft((prev) => (prev === next ? prev : next));
    setStartError((prev) => (prev === null ? prev : null));
  }, [contentStart, project.fps]);

  const applyStartDraft = useCallback(() => {
    try {
      const seconds = clampProgramStart(
        parseProgramStartTimecode(startDraft, project.fps),
        duration,
      );
      setContentStartSeconds(seconds);
      setStartDraft(
        seconds <= 0
          ? "00:00:00:00"
          : programStartTimecode({ ...project, contentStartSeconds: seconds }),
      );
      setStartError(null);
    } catch {
      setStartError("Use HH:MM:SS:FF");
    }
  }, [startDraft, duration, project, setContentStartSeconds]);

  const applyPlayheadDraft = useCallback(
    (draft: string) => {
      try {
        const parsed = parseClock(draft);
        const fileSeconds = playheadClockToFileSeconds(
          parsed,
          contentStart,
          timeReference,
        );
        const clamped = clampPlayheadTime(fileSeconds, duration);
        seek(clamped);
        setPlayheadError(null);
      } catch {
        setPlayheadError("Use HH:MM:SS.mmm");
      }
    },
    [timeReference, contentStart, duration, seek],
  );

  const setFromPlayhead = useCallback(() => {
    const seconds = clampProgramStart(currentTime, duration);
    setContentStartSeconds(seconds);
    setStartError(null);
  }, [currentTime, duration, setContentStartSeconds]);

  const clearStart = useCallback(() => {
    setContentStartSeconds(0);
    setStartError(null);
  }, [setContentStartSeconds]);

  const onPlayheadRefChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as "file" | "program";
    setTimeReference(next);
    if (playheadEditing) {
      setPlayheadDraft(playheadDisplayClock(currentTime, contentStart, next));
    }
    setPlayheadError(null);
  };

  const beforeCount = cuesBeforeProgramStart(project).length;

  return (
    <div className="program-start-panel">
      <span className="program-start-label">
        Program start
        <button
          type="button"
          className="program-start-help-btn"
          onClick={() => setHelpOpen(true)}
          aria-label="About program start"
          {...tip("About program start")}
        >
          ?
        </button>
        <input
          className={
            startError
              ? "program-start-input program-start-input--error"
              : "program-start-input"
          }
          value={startDraft}
          onChange={(e) => {
            setStartDraft(e.target.value);
            setStartError(null);
          }}
          onBlur={applyStartDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyStartDraft();
            }
          }}
          size={11}
          spellCheck={false}
          disabled={!ready}
          aria-label="Program start timecode"
        />
      </span>
      <span
        className="tooltip-wrap"
        {...tip("Use the current playhead position as program start")}
      >
        <button type="button" disabled={!ready} onClick={setFromPlayhead}>
          Set
        </button>
      </span>
      {contentStart > 0 && (
        <span
          className="tooltip-wrap"
          {...tip("Clear program start (export from file 00:00:00)")}
        >
          <button type="button" disabled={!ready} onClick={clearStart}>
            Clear
          </button>
        </span>
      )}
      <span className="program-start-sep" aria-hidden />
      <span className="program-start-playhead-fields">
        <span className="program-start-playhead-label">Playhead</span>
        <select
          className="program-start-playhead-ref"
          value={timeReference}
          onChange={onPlayheadRefChange}
          disabled={!ready}
          aria-label="Time reference for playhead and cue times"
        >
          <option value="file">File</option>
          <option value="program">Program</option>
        </select>
        <span
          className="tooltip-wrap"
          {...tip(
            timeReference === "file"
              ? "Seek by file time (HH:MM:SS.mmm)"
              : "Seek by program time (HH:MM:SS.mmm)",
          )}
        >
          <input
            className={
              playheadError
                ? "program-start-clock-input program-start-input--error"
                : "program-start-clock-input"
            }
            value={playheadValue}
            onChange={(e) => {
              playheadDirtyRef.current = true;
              setPlayheadDraft(e.target.value);
              setPlayheadError(null);
            }}
            onFocus={() => {
              setPlayheadEditing(true);
              setPlayheadDraft(livePlayheadClock);
              playheadDirtyRef.current = false;
              setPlayheadError(null);
            }}
            onBlur={(e) => {
              setPlayheadEditing(false);
              if (playheadDirtyRef.current) {
                applyPlayheadDraft(e.currentTarget.value);
              }
              playheadDirtyRef.current = false;
            }}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyPlayheadDraft(e.currentTarget.value);
                playheadDirtyRef.current = false;
                e.currentTarget.blur();
              }
            }}
            size={12}
            spellCheck={false}
            disabled={!ready}
            aria-label={
              timeReference === "file"
                ? "Playhead file time"
                : "Playhead program time"
            }
          />
        </span>
      </span>
      {beforeCount > 0 && (
        <span
          className="program-start-warn"
          {...tip(
            "These cues start before program start; export times clamp to 00:00:00",
          )}
        >
          {beforeCount} cue{beforeCount === 1 ? "" : "s"} before program start
        </span>
      )}
      {startError && <span className="program-start-error">{startError}</span>}
      {playheadError && (
        <span className="program-start-error">{playheadError}</span>
      )}
      <ProgramStartHelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
    </div>
  );
}
