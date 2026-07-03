import type { Project } from "../types";
import { formatSubtitleTimelineRange } from "../lib/timecode";
import { CueTransport } from "./CueTransport";
import { PlaybackSpeedControl } from "./PlaybackSpeedControl";
import { TimeMappingPanel } from "./TimeMappingPanel";
import { useTip } from "./Tooltip";
import { useWaveformPeaksTimeline } from "../hooks/useWaveformPeaksTimeline";

interface Props {
  project: Project;
  onShowWaveformPeaks: () => void;
  onTimelineWidthChange: (widthPx: number) => void;
}

export function WaveformTimeline({
  project,
  onShowWaveformPeaks,
  onTimelineWidthChange,
}: Props) {
  const tip = useTip();
  const {
    zoomRef,
    scrollRef,
    ready,
    initError,
    subtitlesHidden,
    leaderWidthPx,
    viewRange,
    hasRealPeaks,
    duration,
    zoomIn,
    zoomOut,
    fitWidth,
  } = useWaveformPeaksTimeline({ project, onTimelineWidthChange });

  return (
    <div
      className={`waveform-pane${hasRealPeaks ? "" : " waveform-pane--timeline-only"}`}
    >
      <div className="waveform-toolbar">
        <span className="waveform-toolbar-label">Timeline</span>
        <TimeMappingPanel project={project} ready={ready} />
        <PlaybackSpeedControl />
        <CueTransport project={project} />
        <span className="waveform-toolbar-actions">
          <span
            className="waveform-view-range"
            {...tip("Visible subtitle SMPTE range / total duration")}
          >
            {ready && viewRange
              ? formatSubtitleTimelineRange(
                  viewRange.start,
                  viewRange.end,
                  project,
                  duration,
                )
              : "—"}
          </span>
          <span className="tooltip-wrap" {...tip("Zoom out")}>
            <button type="button" onClick={zoomOut} disabled={!ready}>
              −
            </button>
          </span>
          <span className="tooltip-wrap" {...tip("Zoom in")}>
            <button type="button" onClick={zoomIn} disabled={!ready}>
              +
            </button>
          </span>
          <span className="tooltip-wrap" {...tip("Fit entire video")}>
            <button type="button" onClick={fitWidth} disabled={!ready}>
              Fit
            </button>
          </span>
        </span>
        {!ready && !initError && (
          <span className="waveform-status">Loading timeline…</span>
        )}
        {initError && (
          <span className="waveform-status waveform-status--error">
            {initError}
          </span>
        )}
        {ready && !initError && (!hasRealPeaks || subtitlesHidden) && (
          <span className="waveform-hint-wrap">
            {!hasRealPeaks && (
              <>
                <span className="waveform-hint">
                  No waveform data available
                </span>
                <button
                  type="button"
                  className="waveform-import-btn"
                  onClick={onShowWaveformPeaks}
                  aria-label="Import waveform peaks"
                  {...tip("Import waveform peaks")}
                >
                  Import
                </button>
              </>
            )}
            {subtitlesHidden && (
              <span className="waveform-hint">Zoom in to see subtitles</span>
            )}
          </span>
        )}
      </div>
      <div className="waveform-scroll" ref={scrollRef} />
      <div className="waveform-view-wrap">
        {leaderWidthPx > 0 && (
          <div
            className="time-mapping-leader"
            style={{ width: leaderWidthPx }}
          />
        )}
        <div
          className="waveform-zoom"
          ref={zoomRef}
          {...tip("Scroll to zoom; Shift + scroll to pan", {
            anchor: "cursor",
            hideOnWheel: true,
          })}
        />
      </div>
    </div>
  );
}
