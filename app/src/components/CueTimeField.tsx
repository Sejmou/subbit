import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import { useTimeReference } from "../store/time-reference";
import { contentStartSeconds } from "../lib/program-start";
import {
  cueDisplayTimecode,
  cueTimecodeToFileSeconds,
} from "../lib/display-time";

interface Props {
  cueId: string;
  fileSeconds: number;
  project: Project;
  kind: "in" | "out";
  locked?: boolean;
}

export function CueTimeField({
  cueId,
  fileSeconds,
  project,
  kind,
  locked = false,
}: Props) {
  const setCueStart = useProject((s) => s.setCueStart);
  const setCueEnd = useProject((s) => s.setCueEnd);
  const seek = usePlayback((s) => s.seek);
  const timeReference = useTimeReference((s) => s.reference);
  const contentStart = contentStartSeconds(project);

  const [draft, setDraft] = useState(() =>
    cueDisplayTimecode(fileSeconds, project, timeReference),
  );
  const [error, setError] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(cueDisplayTimecode(fileSeconds, project, timeReference));
      setError(false);
    }
  }, [fileSeconds, project, timeReference]);

  const apply = useCallback(() => {
    if (locked) return;
    try {
      const seconds = cueTimecodeToFileSeconds(
        draft,
        project.fps,
        contentStart,
        timeReference,
      );
      if (kind === "in") setCueStart(cueId, seconds);
      else setCueEnd(cueId, seconds);
      setDraft(cueDisplayTimecode(seconds, project, timeReference));
      setError(false);
    } catch {
      setError(true);
    }
  }, [
    draft,
    cueId,
    kind,
    project,
    contentStart,
    timeReference,
    setCueStart,
    setCueEnd,
    locked,
  ]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      setDraft(cueDisplayTimecode(fileSeconds, project, timeReference));
      setError(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const label = kind === "in" ? "In" : "Out";
  const jumpTitle = kind === "in" ? "Jump to In" : "Jump to Out";

  return (
    <div className="cue-time-field" onMouseDown={(e) => e.stopPropagation()}>
      <span className="cue-time-label">{label}</span>
      <input
        className={
          error ? "cue-time-input cue-time-input--error" : "cue-time-input"
        }
        value={draft}
        size={11}
        spellCheck={false}
        aria-label={`${label} time`}
        readOnly={locked}
        title={locked ? "Reviewed (locked) — uncheck to edit" : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          apply();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(false);
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="cue-time-jump"
        title={jumpTitle}
        aria-label={jumpTitle}
        onClick={() => seek(fileSeconds)}
      >
        ↗
      </button>
    </div>
  );
}
