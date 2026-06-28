import type { Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import { useLockReviewedStore } from "../store/lock-reviewed";
import { useShortcutLabel } from "../hooks/useShortcutLabel";
import { isReviewedCueLocked } from "../lib/cue-lock";
import { cueDisplayTimecode } from "../lib/display-time";
import { useTimeReference } from "../store/time-reference";
import { useTip } from "./Tooltip";

const OFF_CUE_THRESHOLD_S = 0.3;

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatDrift(seconds: number): string {
  const abs = Math.abs(seconds);
  const label = abs.toFixed(1);
  return seconds > 0 ? `${label}s ahead` : `${label}s behind`;
}

/** Compact cue transport in the timeline toolbar. */
export function CueTransport({ project }: { project: Project }) {
  const tip = useTip();
  const selectedCueId = useProject((s) => s.selectedCueId);
  const selectCue = useProject((s) => s.selectCue);
  const setCueStart = useProject((s) => s.setCueStart);
  const setCueEnd = useProject((s) => s.setCueEnd);
  const timeReference = useTimeReference((s) => s.reference);
  const { currentTime, seek } = usePlayback();
  const seekToCueLabel = useShortcutLabel("seek-to-cue");
  const previousCueLabel = useShortcutLabel("previous-cue");
  const nextCueLabel = useShortcutLabel("next-cue");
  const setInLabel = useShortcutLabel("set-in");
  const setOutLabel = useShortcutLabel("set-out");
  useLockReviewedStore((s) => s.enabled);

  const cues = project.cues;
  const cueIndex = selectedCueId
    ? cues.findIndex((c) => c.id === selectedCueId)
    : -1;
  const cue = cueIndex >= 0 ? cues[cueIndex] : null;
  const hasCue = cue !== null;
  const cueLocked = cue ? isReviewedCueLocked(cue) : false;
  const canPrev = hasCue && cueIndex > 0;
  const canNext = hasCue && cueIndex < cues.length - 1;

  const inDrift = cue ? currentTime - cue.start : 0;
  const outDrift = cue ? currentTime - cue.end : 0;
  const offIn = hasCue && Math.abs(inDrift) > OFF_CUE_THRESHOLD_S;
  const offOut = hasCue && Math.abs(outDrift) > OFF_CUE_THRESHOLD_S;

  const jumpInTitle = hasCue
    ? offIn
      ? `Jump to In (${seekToCueLabel}) — ${formatDrift(inDrift)}`
      : `Jump to In (${seekToCueLabel})`
    : undefined;

  const jumpOutTitle = hasCue
    ? offOut
      ? `Jump to Out — ${formatDrift(outDrift)}`
      : "Jump to Out"
    : undefined;

  const selectPrev = () => {
    if (!canPrev) return;
    selectCue(cues[cueIndex - 1].id);
  };

  const selectNext = () => {
    if (!canNext) return;
    selectCue(cues[cueIndex + 1].id);
  };

  return (
    <div className="cue-transport-bar">
      <span className="cue-transport-heading">
        {hasCue ? (
          <>
            Selected cue:{" "}
            <span className="cue-transport-heading-no">#{cueIndex + 1}</span>
          </>
        ) : (
          "No cue selected"
        )}
      </span>

      <span
        className="tooltip-wrap"
        {...tip(`Previous cue (${previousCueLabel})`)}
      >
        <button
          type="button"
          className="cue-transport-btn"
          disabled={!canPrev}
          onClick={selectPrev}
          aria-label="Previous cue"
        >
          <ChevronLeftIcon />
        </button>
      </span>

      <span className="tooltip-wrap" {...tip(`Next cue (${nextCueLabel})`)}>
        <button
          type="button"
          className="cue-transport-btn"
          disabled={!canNext}
          onClick={selectNext}
          aria-label="Next cue"
        >
          <ChevronRightIcon />
        </button>
      </span>

      <span className="cue-transport-sep" aria-hidden />

      <div className="cue-transport-boundary">
        <span className="cue-transport-boundary-label">In</span>
        <span className="cue-transport-tc">
          {hasCue ? cueDisplayTimecode(cue.start, project, timeReference) : "—"}
        </span>
        <span className="tooltip-wrap" {...tip(jumpInTitle)}>
          <button
            type="button"
            className={`cue-transport-mark-btn${offIn ? " cue-transport-mark-btn--warn" : ""}`}
            disabled={!hasCue}
            onClick={() => cue && seek(cue.start)}
            aria-label="Jump to In"
          >
            ↗
          </button>
        </span>
        <span
          className="tooltip-wrap"
          {...tip(
            cueLocked
              ? "Reviewed (locked) — uncheck to set In"
              : `Set In to playhead (${setInLabel})`,
          )}
        >
          <button
            type="button"
            className="cue-transport-set-btn"
            disabled={!hasCue || cueLocked}
            onClick={() => cue && setCueStart(cue.id, currentTime)}
          >
            Set
          </button>
        </span>
      </div>

      <div className="cue-transport-boundary">
        <span className="cue-transport-boundary-label">Out</span>
        <span className="cue-transport-tc">
          {hasCue ? cueDisplayTimecode(cue.end, project, timeReference) : "—"}
        </span>
        <span className="tooltip-wrap" {...tip(jumpOutTitle)}>
          <button
            type="button"
            className={`cue-transport-mark-btn${offOut ? " cue-transport-mark-btn--warn" : ""}`}
            disabled={!hasCue}
            onClick={() => cue && seek(cue.end)}
            aria-label="Jump to Out"
          >
            ↗
          </button>
        </span>
        <span
          className="tooltip-wrap"
          {...tip(
            cueLocked
              ? "Reviewed (locked) — uncheck to set Out"
              : `Set Out to playhead (${setOutLabel})`,
          )}
        >
          <button
            type="button"
            className="cue-transport-set-btn"
            disabled={!hasCue || cueLocked}
            onClick={() => cue && setCueEnd(cue.id, currentTime)}
          >
            Set
          </button>
        </span>
      </div>
    </div>
  );
}
