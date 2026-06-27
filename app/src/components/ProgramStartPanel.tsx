import { useCallback, useEffect, useState } from "react";
import type { Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import {
  clampProgramStart,
  contentStartSeconds,
  cuesBeforeProgramStart,
  parseProgramStartTimecode,
  programStartTimecode,
} from "../lib/program-start";
import { secondsToClock, secondsToTimecode } from "../lib/timecode";

interface Props {
  project: Project;
  ready: boolean;
}

/**
 * Flow 2: numeric program start + set from playhead. Lives in the waveform toolbar
 * so it sits next to the timeline marker (Flow 1).
 */
export function ProgramStartPanel({ project, ready }: Props) {
  const setContentStartSeconds = useProject((s) => s.setContentStartSeconds);
  const currentTime = usePlayback((s) => s.currentTime);
  const duration = usePlayback((s) => s.duration);

  const contentStart = contentStartSeconds(project);
  const [draft, setDraft] = useState(() => programStartTimecode(project));
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(
      contentStart <= 0
        ? "00:00:00:00"
        : secondsToTimecode(contentStart, project.fps, "00:00:00:00"),
    );
    setInputError(null);
  }, [contentStart, project.fps]);

  const applyDraft = useCallback(() => {
    try {
      const seconds = clampProgramStart(
        parseProgramStartTimecode(draft, project.fps),
        duration,
      );
      setContentStartSeconds(seconds);
      setDraft(
        seconds <= 0
          ? "00:00:00:00"
          : programStartTimecode({ ...project, contentStartSeconds: seconds }),
      );
      setInputError(null);
    } catch {
      setInputError("Use HH:MM:SS:FF");
    }
  }, [draft, duration, project, setContentStartSeconds]);

  const setFromPlayhead = useCallback(() => {
    const seconds = clampProgramStart(currentTime, duration);
    setContentStartSeconds(seconds);
    setInputError(null);
  }, [currentTime, duration, setContentStartSeconds]);

  const clearStart = useCallback(() => {
    setContentStartSeconds(0);
    setInputError(null);
  }, [setContentStartSeconds]);

  const beforeCount = cuesBeforeProgramStart(project).length;

  return (
    <div className="program-start-panel">
      <label
        className="program-start-label"
        title="Where the actual program begins in this file (after leader/black/slate). Cue times in the editor stay on the file timeline; only exported subtitle times count from here."
      >
        Program start
        <input
          className={
            inputError
              ? "program-start-input program-start-input--error"
              : "program-start-input"
          }
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInputError(null);
          }}
          onBlur={applyDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyDraft();
            }
          }}
          size={11}
          spellCheck={false}
          disabled={!ready}
          aria-label="Program start timecode"
        />
      </label>
      <button
        type="button"
        disabled={!ready}
        onClick={setFromPlayhead}
        title="Use the current playhead position as program start"
      >
        Set from playhead
      </button>
      {contentStart > 0 && (
        <button
          type="button"
          disabled={!ready}
          onClick={clearStart}
          title="Clear program start (export from file 00:00:00)"
        >
          Clear
        </button>
      )}
      {contentStart > 0 && (
        <span
          className="program-start-playhead"
          title="Current playhead in file time and program time"
        >
          Playhead file {secondsToClock(currentTime)} · program{" "}
          {secondsToClock(Math.max(0, currentTime - contentStart))}
        </span>
      )}
      {beforeCount > 0 && (
        <span
          className="program-start-warn"
          title="These cues start before program start; export times clamp to 00:00:00"
        >
          {beforeCount} cue{beforeCount === 1 ? "" : "s"} before program start
        </span>
      )}
      {inputError && <span className="program-start-error">{inputError}</span>}
    </div>
  );
}
