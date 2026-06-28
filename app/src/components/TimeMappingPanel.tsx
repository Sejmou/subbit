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
import {
  clampReferenceStart,
  cuesBeforeReferenceStart,
  maxReferenceStartSeconds,
} from "../lib/program-start";
import { snapToFrame } from "../lib/cue-timing";
import {
  playheadDisplayTimecode,
  playheadTimecodeToFileSeconds,
} from "../lib/display-time";
import { clampPlayheadTime, timecodeToSeconds } from "../lib/timecode";
import { TimeMappingHelpDialog } from "./TimeMappingHelpDialog";
import { useTip } from "./Tooltip";
import { nominalTimecodeFps, projectFrameRate } from "../lib/frame-time";

interface Props {
  project: Project;
  ready: boolean;
}

/**
 * Subtitle time mapping: start timecode, subtitle-start position, playhead seek.
 */
export function TimeMappingPanel({ project, ready }: Props) {
  const tip = useTip();
  const setReferenceStartSeconds = useProject(
    (s) => s.setReferenceStartSeconds,
  );
  const setStartTimecode = useProject((s) => s.setStartTimecode);
  const currentTime = usePlayback((s) => s.currentTime);
  const duration = usePlayback((s) => s.duration);
  const seek = usePlayback((s) => s.seek);

  const referenceStartSeconds = project.referenceStartSeconds;
  const [playheadEditing, setPlayheadEditing] = useState(false);
  const [playheadDraft, setPlayheadDraft] = useState("");
  const [playheadError, setPlayheadError] = useState<string | null>(null);
  const [startTcDraft, setStartTcDraft] = useState(() => project.startTimecode);
  const [startTcError, setStartTcError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const playheadDirtyRef = useRef(false);

  const livePlayheadClock = playheadDisplayTimecode(currentTime, project);
  const playheadValue = playheadEditing ? playheadDraft : livePlayheadClock;

  useEffect(() => {
    setStartTcDraft((prev) =>
      prev === project.startTimecode ? prev : project.startTimecode,
    );
    setStartTcError((prev) => (prev === null ? prev : null));
  }, [project.startTimecode]);

  const applyStartTcDraft = useCallback(() => {
    try {
      const trimmed = startTcDraft.trim();
      const tcFps = nominalTimecodeFps(projectFrameRate(project));
      timecodeToSeconds(trimmed, tcFps);
      if (trimmed === project.startTimecode) return;
      setStartTimecode(trimmed);
      setStartTcDraft(trimmed);
      setStartTcError(null);
    } catch {
      setStartTcError("Use HH:MM:SS:FF");
    }
  }, [startTcDraft, project, setStartTimecode]);

  const applyPlayheadDraft = useCallback(
    (draft: string) => {
      try {
        const fileSeconds = playheadTimecodeToFileSeconds(draft, project);
        const clamped = clampPlayheadTime(fileSeconds, duration);
        seek(clamped);
        setPlayheadError(null);
      } catch {
        setPlayheadError("Use HH:MM:SS:FF");
      }
    },
    [project, duration, seek],
  );

  const setFromPlayhead = useCallback(() => {
    const maxSeconds = maxReferenceStartSeconds(project, duration);
    const seconds = clampReferenceStart(
      snapToFrame(currentTime, project),
      maxSeconds,
    );
    setReferenceStartSeconds(seconds);
  }, [currentTime, duration, project, setReferenceStartSeconds]);

  const clearReference = useCallback(() => {
    setReferenceStartSeconds(0);
  }, [setReferenceStartSeconds]);

  const beforeCount = cuesBeforeReferenceStart(project).length;

  return (
    <div className="time-mapping-panel">
      <span className="time-mapping-label">
        Start TC
        <input
          className={
            startTcError
              ? "time-mapping-input time-mapping-input--error"
              : "time-mapping-input"
          }
          value={startTcDraft}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setStartTcDraft(e.target.value);
            setStartTcError(null);
          }}
          onBlur={applyStartTcDraft}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyStartTcDraft();
            }
          }}
          size={11}
          spellCheck={false}
          disabled={!ready}
          aria-label="Start timecode at subtitle start"
          {...tip("SMPTE label at the subtitle start marker (HH:MM:SS:FF)")}
        />
      </span>
      <span className="time-mapping-sep" aria-hidden />
      <span className="time-mapping-label">
        Subtitle start
        <button
          type="button"
          className="time-mapping-help-btn"
          onClick={() => setHelpOpen(true)}
          aria-label="About time mapping"
          {...tip("About subtitle time mapping")}
        >
          ?
        </button>
      </span>
      <span
        className="tooltip-wrap"
        {...tip("Use the current playhead position as subtitle start")}
      >
        <button type="button" disabled={!ready} onClick={setFromPlayhead}>
          Set
        </button>
      </span>
      {referenceStartSeconds > 0 && (
        <span
          className="tooltip-wrap"
          {...tip("Clear subtitle start (subtitle zero at file start)")}
        >
          <button type="button" disabled={!ready} onClick={clearReference}>
            Clear
          </button>
        </span>
      )}
      <span className="time-mapping-sep" aria-hidden />
      <span className="time-mapping-playhead-fields">
        <span className="time-mapping-playhead-label">Playhead</span>
        <span
          className="tooltip-wrap"
          {...tip("Seek by subtitle SMPTE (HH:MM:SS:FF)")}
        >
          <input
            className={
              playheadError
                ? "time-mapping-clock-input time-mapping-input--error"
                : "time-mapping-clock-input"
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
            aria-label="Playhead subtitle timecode"
          />
        </span>
      </span>
      {beforeCount > 0 && (
        <span
          className="time-mapping-warn"
          {...tip(
            "These cues start before subtitle start and are marked invalid",
          )}
        >
          {beforeCount} invalid cue{beforeCount === 1 ? "" : "s"} before
          subtitle start
        </span>
      )}
      {startTcError && (
        <span className="time-mapping-error">{startTcError}</span>
      )}
      {playheadError && (
        <span className="time-mapping-error">{playheadError}</span>
      )}
      <TimeMappingHelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      />
    </div>
  );
}
