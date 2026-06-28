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
  const [playheadDraft, setPlayheadDraft] = useState(() =>
    playheadDisplayClock(currentTime, contentStart, timeReference),
  );
  const [startError, setStartError] = useState<string | null>(null);
  const [playheadError, setPlayheadError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const playheadFocused = useRef(false);

  useEffect(() => {
    setStartDraft(
      contentStart <= 0
        ? "00:00:00:00"
        : secondsToTimecode(contentStart, project.fps, "00:00:00:00"),
    );
    setStartError(null);
  }, [contentStart, project.fps]);

  useEffect(() => {
    if (!playheadFocused.current) {
      setPlayheadDraft(
        playheadDisplayClock(currentTime, contentStart, timeReference),
      );
      setPlayheadError(null);
    }
  }, [currentTime, contentStart, timeReference]);

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

  const applyPlayheadDraft = useCallback(() => {
    try {
      const parsed = parseClock(playheadDraft);
      const fileSeconds = playheadClockToFileSeconds(
        parsed,
        contentStart,
        timeReference,
      );
      const clamped = clampPlayheadTime(fileSeconds, duration);
      seek(clamped);
      setPlayheadDraft(
        playheadDisplayClock(clamped, contentStart, timeReference),
      );
      setPlayheadError(null);
    } catch {
      setPlayheadError("Use HH:MM:SS.mmm");
    }
  }, [playheadDraft, timeReference, contentStart, duration, seek]);

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
    setPlayheadDraft(playheadDisplayClock(currentTime, contentStart, next));
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
            value={playheadDraft}
            onChange={(e) => {
              setPlayheadDraft(e.target.value);
              setPlayheadError(null);
            }}
            onFocus={() => {
              playheadFocused.current = true;
            }}
            onBlur={() => {
              playheadFocused.current = false;
              applyPlayheadDraft();
            }}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyPlayheadDraft();
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
