import type { Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import { shortcutLabel } from "../lib/shortcuts";
import { cueDisplayTimecode } from "../lib/display-time";
import { useTimeReference } from "../store/time-reference";

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
  const selectedCueId = useProject((s) => s.selectedCueId);
  const selectCue = useProject((s) => s.selectCue);
  const timeReference = useTimeReference((s) => s.reference);
  const { currentTime, seek } = usePlayback();

  const cues = project.cues;
  const cueIndex = selectedCueId
    ? cues.findIndex((c) => c.id === selectedCueId)
    : -1;
  const cue = cueIndex >= 0 ? cues[cueIndex] : null;
  const hasCue = cue !== null;
  const canPrev = hasCue && cueIndex > 0;
  const canNext = hasCue && cueIndex < cues.length - 1;

  const drift = cue ? currentTime - cue.start : 0;
  const offCue = hasCue && Math.abs(drift) > OFF_CUE_THRESHOLD_S;
  const jumpTitle = hasCue
    ? offCue
      ? `Jump to In (${shortcutLabel("seek-to-cue")}) — ${formatDrift(drift)}`
      : `Jump to In (${shortcutLabel("seek-to-cue")})`
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

      <button
        type="button"
        className="cue-transport-btn"
        disabled={!canPrev}
        onClick={selectPrev}
        title={`Previous cue (${shortcutLabel("previous-cue")})`}
        aria-label="Previous cue"
      >
        <ChevronLeftIcon />
      </button>

      <span className="cue-transport-tc" title={hasCue ? jumpTitle : undefined}>
        {hasCue ? cueDisplayTimecode(cue.start, project, timeReference) : "—"}
      </span>

      <button
        type="button"
        className="cue-transport-btn"
        disabled={!canNext}
        onClick={selectNext}
        title={`Next cue (${shortcutLabel("next-cue")})`}
        aria-label="Next cue"
      >
        <ChevronRightIcon />
      </button>

      <button
        type="button"
        className={`cue-transport-in-btn${offCue ? " cue-transport-in-btn--warn" : ""}`}
        disabled={!hasCue}
        onClick={() => cue && seek(cue.start)}
        title={jumpTitle}
        aria-label="Jump to cue In"
      >
        In
      </button>
    </div>
  );
}
