import {
  clampTimelineVisibleSpan,
  peaksMinVisibleSpanSeconds,
  type WaveformPeaksMeta,
} from "./waveform-peaks";

export type TimelinePeaksMeta = Pick<
  WaveformPeaksMeta,
  "samplesPerPixel" | "sampleRate"
>;

type TimelineZoomOptions = { seconds: number };

/** Default visible file-time span when the timeline first loads. */
export const DEFAULT_TIMELINE_VISIBLE_SPAN_SECONDS = 30;

/** Scroll/wheel zoom factor (smaller span = zoom in). */
export const TIMELINE_ZOOM_IN_FACTOR = 0.75;
export const TIMELINE_ZOOM_OUT_FACTOR = 1 / TIMELINE_ZOOM_IN_FACTOR;

/** Minimal peaks.js zoomview surface used by timeline zoom helpers. */
export interface TimelineZoomView {
  getStartTime(): number;
  getEndTime(): number;
  getWidth?(): number;
  setZoom(options: TimelineZoomOptions): void;
  setStartTime(seconds: number): void;
}

export interface TimelineFitWidthView extends TimelineZoomView {
  fitToContainer(): void;
}

export interface ApplyTimelineZoomOptions {
  requestedSpanSeconds: number;
  durationSeconds: number;
  viewWidthPx: number;
  anchorTimeSeconds: number;
  anchorRatio?: number;
}

/** Layout width for zoom math (prefers peaks view width, falls back to container). */
export function timelineViewWidthPx(
  view: { getWidth?: () => number | undefined },
  containerWidthPx: number,
): number {
  const width = view.getWidth?.() ?? containerWidthPx;
  return width > 0 ? width : containerWidthPx;
}

/** Duration cap for clamping when media length is not known yet. */
export function effectiveTimelineDuration(
  durationSeconds: number,
  fallbackSpanSeconds: number,
): number {
  return Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : fallbackSpanSeconds;
}

/** Horizontal anchor ratio (0–1) from a wheel event x offset. */
export function timelineWheelAnchorRatio(
  anchorXPx: number | undefined,
  viewWidthPx: number,
): number {
  if (anchorXPx === undefined || viewWidthPx <= 0) return 0.5;
  return Math.min(1, Math.max(0, anchorXPx / viewWidthPx));
}

/**
 * Clamp a requested zoom-view span to what peaks.js allows at this width
 * and within media duration.
 */
export function resolveTimelineVisibleSpan(
  meta: TimelinePeaksMeta,
  requestedSpanSeconds: number,
  currentSpanSeconds: number,
  durationSeconds: number,
  viewWidthPx: number,
): number | null {
  if (viewWidthPx <= 0) return null;
  const minSpan = peaksMinVisibleSpanSeconds(meta, viewWidthPx);
  if (minSpan === null || minSpan <= 0) return null;
  return clampTimelineVisibleSpan(
    requestedSpanSeconds,
    currentSpanSeconds,
    durationSeconds,
    {
      minSpan,
      zoomOut: requestedSpanSeconds > currentSpanSeconds,
    },
  );
}

/**
 * Start time that keeps `anchorTimeSeconds` at `anchorRatio` (0–1) across
 * the visible span, bounded by media duration.
 */
export function timelineViewStartTime(
  visibleSpanSeconds: number,
  durationSeconds: number,
  anchorTimeSeconds: number,
  anchorRatio = 0.5,
): number {
  const ratio = Math.min(1, Math.max(0, anchorRatio));
  const durationCap =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : visibleSpanSeconds;
  const maxStart = Math.max(0, durationCap - visibleSpanSeconds);
  return Math.min(
    Math.max(0, anchorTimeSeconds - ratio * visibleSpanSeconds),
    maxStart,
  );
}

/**
 * Clamp, apply peaks.js zoom, and reposition the view around an anchor.
 * Returns false when the request is a no-op.
 */
export function applyTimelineZoom(
  view: TimelineZoomView,
  meta: TimelinePeaksMeta,
  opts: ApplyTimelineZoomOptions,
): boolean {
  const currentSpan = view.getEndTime() - view.getStartTime();
  if (currentSpan <= 0 || opts.viewWidthPx <= 0) return false;

  const cappedSpan = resolveTimelineVisibleSpan(
    meta,
    opts.requestedSpanSeconds,
    currentSpan,
    opts.durationSeconds,
    opts.viewWidthPx,
  );
  if (cappedSpan === null || Math.abs(cappedSpan - currentSpan) < 0.001) {
    return false;
  }

  view.setZoom({ seconds: cappedSpan });

  const actualSpan = view.getEndTime() - view.getStartTime();
  view.setStartTime(
    timelineViewStartTime(
      actualSpan,
      opts.durationSeconds,
      opts.anchorTimeSeconds,
      opts.anchorRatio ?? 0.5,
    ),
  );
  return true;
}

/** Zoom in/out by a multiplicative factor, preserving a horizontal anchor. */
export function applyTimelineZoomByFactor(
  view: TimelineZoomView,
  meta: TimelinePeaksMeta,
  factor: number,
  opts: {
    durationSeconds: number;
    viewWidthPx: number;
    anchorXPx?: number;
  },
): boolean {
  const currentSpan = view.getEndTime() - view.getStartTime();
  if (currentSpan <= 0 || opts.viewWidthPx <= 0) return false;

  const ratio = timelineWheelAnchorRatio(opts.anchorXPx, opts.viewWidthPx);
  const startTime = view.getStartTime();
  return applyTimelineZoom(view, meta, {
    requestedSpanSeconds: currentSpan * factor,
    durationSeconds: opts.durationSeconds,
    viewWidthPx: opts.viewWidthPx,
    anchorTimeSeconds: startTime + ratio * currentSpan,
    anchorRatio: ratio,
  });
}

/** Default zoom on timeline load: fixed span centered on the playhead. */
export function applyInitialTimelineZoom(
  view: TimelineZoomView,
  meta: TimelinePeaksMeta,
  opts: {
    durationSeconds: number;
    viewWidthPx: number;
    playheadSeconds: number;
    visibleSpanSeconds?: number;
  },
): boolean {
  const currentSpan = view.getEndTime() - view.getStartTime();
  return applyTimelineZoom(view, meta, {
    requestedSpanSeconds:
      opts.visibleSpanSeconds ?? DEFAULT_TIMELINE_VISIBLE_SPAN_SECONDS,
    durationSeconds: effectiveTimelineDuration(
      opts.durationSeconds,
      currentSpan,
    ),
    viewWidthPx: opts.viewWidthPx,
    anchorTimeSeconds: opts.playheadSeconds,
  });
}

/** Zoom out to show the full media duration. */
export function applyTimelineFitWidth(
  view: TimelineFitWidthView,
  meta: TimelinePeaksMeta,
  durationSeconds: number,
  viewWidthPx: number,
): boolean {
  const currentSpan = view.getEndTime() - view.getStartTime();
  const span = resolveTimelineVisibleSpan(
    meta,
    durationSeconds,
    currentSpan,
    durationSeconds,
    viewWidthPx,
  );
  if (span === null) return false;
  view.setZoom({ seconds: span });
  view.fitToContainer();
  return true;
}

/** Toolbar view-range state derived from peaks.js zoomview times. */
export function clampTimelineViewRange(
  startTime: number,
  endTime: number,
  durationSeconds: number,
): { start: number; end: number } | null {
  let start = startTime;
  let end = endTime;
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    end = Math.min(end, durationSeconds);
    start = Math.max(0, Math.min(start, end));
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  return { start, end };
}

interface TimelineWheelZoomView {
  scrollWaveform(opts: { pixels: number }): void;
}

/** Scroll-to-pan and scroll-to-zoom wheel handling for the timeline. */
export function handleTimelineWheelEvent(
  e: WheelEvent,
  container: HTMLElement,
  zoomview: TimelineWheelZoomView,
  onZoomIn: (anchorXPx: number) => void,
  onZoomOut: (anchorXPx: number) => void,
): void {
  const absX = Math.abs(e.deltaX);
  const absY = Math.abs(e.deltaY);
  const panGesture = e.shiftKey || (absX > absY && !e.ctrlKey);

  e.preventDefault();

  if (panGesture) {
    let delta = e.shiftKey ? (absY >= absX ? e.deltaY : e.deltaX) : e.deltaX;
    if (delta === 0) return;

    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
    else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE)
      delta *= container.clientWidth;

    zoomview.scrollWaveform({ pixels: Math.trunc(delta) });
    return;
  }

  const anchorX = e.clientX - container.getBoundingClientRect().left;
  if (e.deltaY < 0) onZoomIn(anchorX);
  else if (e.deltaY > 0) onZoomOut(anchorX);
}
