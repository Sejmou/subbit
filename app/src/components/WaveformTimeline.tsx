import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Peaks, {
  type JsonWaveformData,
  type PeaksInstance,
  type PeaksOptions,
  type Segment,
} from "peaks.js";
import type { Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import { useWaveform } from "../store/waveform";
import { findActiveCueId } from "../lib/active-cue";
import { focusCueForEdit } from "../lib/focus-cue";
import { TIMELINE_NEW_CUE_DURATION } from "../lib/cue-insert";
import {
  buildCueSegmentAddOptions,
  buildCueSegmentUpdatePatch,
} from "../lib/waveform-segments";
import type { WaveformPeaksInput } from "../lib/waveform-peaks";
import {
  buildPlaceholderWaveformPeaks,
  peaksZoomLevels,
  peaksInitialZoomSeconds,
} from "../lib/waveform-peaks";
import {
  findCuesOverlappingRange,
  padViewRange,
  withPriorityCues,
} from "../lib/visible-cues";
import {
  PROGRAM_START_POINT_ID,
  clampProgramStart,
  contentStartSeconds,
} from "../lib/program-start";
import { ProgramStartPanel } from "./ProgramStartPanel";

/** Peaks.js + Konva struggle with hundreds of segment overlays at once. */
const MAX_VISIBLE_SEGMENTS = 200;

interface Props {
  project: Project;
}

function peaksWaveformData(input: WaveformPeaksInput) {
  if (input.kind === "dat") {
    return { arraybuffer: input.arrayBuffer };
  }
  return { json: input.json as JsonWaveformData };
}

function segmentNeedsUpdate(
  seg: Segment,
  patch: ReturnType<typeof buildCueSegmentUpdatePatch>,
): boolean {
  return (
    seg.startTime !== patch.startTime ||
    seg.endTime !== patch.endTime ||
    seg.labelText !== patch.labelText ||
    seg.color !== patch.color ||
    seg.borderColor !== patch.borderColor
  );
}

/** Scroll/+ zoom factor (smaller span = zoom in). */
const ZOOM_IN_FACTOR = 0.75;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;

export function WaveformTimeline({ project }: Props) {
  const zoomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const peaksRef = useRef<PeaksInstance | null>(null);
  const projectRef = useRef(project);
  const lastActiveId = useRef<string | null>(null);
  const lastHighlightKey = useRef("");
  projectRef.current = project;

  const storedPeaks = useWaveform((s) => s.peaks);
  const hasRealPeaks = storedPeaks !== null;
  const videoEl = usePlayback((s) => s.videoEl);
  const duration = usePlayback((s) => s.duration);

  const effectivePeaks = useMemo(() => {
    if (storedPeaks) return storedPeaks;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return buildPlaceholderWaveformPeaks(duration);
  }, [storedPeaks, duration]);

  const peaksInput = effectivePeaks?.input ?? null;
  const samplesPerPixel = effectivePeaks?.meta.samplesPerPixel ?? null;
  const sampleRate = effectivePeaks?.meta.sampleRate ?? null;

  const selectedCueId = useProject((s) => s.selectedCueId);
  const setCueStart = useProject((s) => s.setCueStart);
  const setCueEnd = useProject((s) => s.setCueEnd);
  const setCueTimes = useProject((s) => s.setCueTimes);
  const selectCue = useProject((s) => s.selectCue);
  const insertCueAtPlayhead = useProject((s) => s.insertCueAtPlayhead);
  const setContentStartSeconds = useProject((s) => s.setContentStartSeconds);

  const contentStart = contentStartSeconds(project);

  const selectedCueIdRef = useRef(selectedCueId);
  selectedCueIdRef.current = selectedCueId;

  const setCueStartRef = useRef(setCueStart);
  const setCueEndRef = useRef(setCueEnd);
  const setCueTimesRef = useRef(setCueTimes);
  const selectCueRef = useRef(selectCue);
  const insertCueAtPlayheadRef = useRef(insertCueAtPlayhead);
  setCueStartRef.current = setCueStart;
  setCueEndRef.current = setCueEnd;
  setCueTimesRef.current = setCueTimes;
  selectCueRef.current = selectCue;
  insertCueAtPlayheadRef.current = insertCueAtPlayhead;

  const setContentStartSecondsRef = useRef(setContentStartSeconds);
  setContentStartSecondsRef.current = setContentStartSeconds;

  const contentStartRef = useRef(contentStart);
  contentStartRef.current = contentStart;

  const durationRef = useRef(duration);
  durationRef.current = duration;

  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [subtitlesHidden, setSubtitlesHidden] = useState(false);
  const [leaderWidthPx, setLeaderWidthPx] = useState(0);

  const updateLeaderOverlay = useCallback(() => {
    const start = contentStartRef.current;
    if (start <= 0) {
      setLeaderWidthPx(0);
      return;
    }
    const zoomview = peaksRef.current?.views.getView("zoomview");
    const container = zoomRef.current;
    if (!zoomview || !container) return;

    const viewStart = zoomview.getStartTime();
    const viewEnd = zoomview.getEndTime();
    const span = viewEnd - viewStart;
    const width = container.clientWidth;
    if (span <= 0 || width <= 0) return;

    if (start <= viewStart) {
      setLeaderWidthPx(0);
      return;
    }
    if (start >= viewEnd) {
      setLeaderWidthPx(width);
      return;
    }
    setLeaderWidthPx(((start - viewStart) / span) * width);
  }, []);

  const syncProgramStartPoint = useCallback(() => {
    const peaks = peaksRef.current;
    if (!peaks) return;

    const start = contentStartRef.current;
    const existing = peaks.points.getPoint(PROGRAM_START_POINT_ID);

    if (start <= 0) {
      if (existing) peaks.points.removeById(PROGRAM_START_POINT_ID);
      setLeaderWidthPx(0);
      return;
    }

    if (existing) {
      if (Math.abs(existing.time - start) > 0.0001) {
        existing.update({ time: start, labelText: "Program start" });
      }
    } else {
      peaks.points.add({
        id: PROGRAM_START_POINT_ID,
        time: start,
        editable: true,
        color: "#ffb74d",
        labelText: "Program start",
      });
    }
    updateLeaderOverlay();
  }, [updateLeaderOverlay]);

  const zoomViewByFactor = useCallback(
    (factor: number, anchorX?: number) => {
      const zoomview = peaksRef.current?.views.getView("zoomview");
      const container = zoomRef.current;
      if (!zoomview || !container) return;

      const startTime = zoomview.getStartTime();
      const endTime = zoomview.getEndTime();
      const span = endTime - startTime;
      if (span <= 0) return;

      const width = container.clientWidth;
      if (width <= 0) return;

      const ratio =
        anchorX !== undefined ? Math.min(1, Math.max(0, anchorX / width)) : 0.5;
      const anchorTime = startTime + ratio * span;
      const requestedSpan = Math.max(0.5, span * factor);

      zoomview.setZoom({ seconds: requestedSpan });

      const actualSpan = zoomview.getEndTime() - zoomview.getStartTime();
      const maxStart = Math.max(0, duration - actualSpan);
      const newStart = Math.min(
        Math.max(0, anchorTime - ratio * actualSpan),
        maxStart,
      );
      zoomview.setStartTime(newStart);
    },
    [duration],
  );

  const syncHighlight = useCallback((time: number) => {
    const peaks = peaksRef.current;
    const proj = projectRef.current;
    if (!peaks) return;

    const activeId = findActiveCueId(proj.cues, time);
    const selId = selectedCueIdRef.current;
    const key = `${activeId ?? ""}:${selId ?? ""}`;
    if (key === lastHighlightKey.current) return;
    lastHighlightKey.current = key;

    const prevActive = lastActiveId.current;
    lastActiveId.current = activeId;

    const touchIds = new Set<string>();
    for (const id of [activeId, prevActive, selId]) {
      if (id) touchIds.add(id);
    }

    for (const id of touchIds) {
      const cue = proj.cues.find((c) => c.id === id);
      if (!cue) continue;
      const active = cue.id === activeId;
      const selected = cue.id === selId;
      let seg = peaks.segments.getSegment(id);
      if (!seg) {
        peaks.segments.add(
          buildCueSegmentAddOptions(cue, proj, { active, selected }),
        );
        continue;
      }
      seg.update(buildCueSegmentUpdatePatch(cue, proj, { active, selected }));
    }
  }, []);

  const syncVisibleSegments = useCallback(
    (viewStart: number, viewEnd: number) => {
      const peaks = peaksRef.current;
      const proj = projectRef.current;
      if (!peaks) return;

      const time = usePlayback.getState().currentTime;
      const activeId = findActiveCueId(proj.cues, time);
      const selId = selectedCueIdRef.current;

      const { start: rangeStart, end: rangeEnd } = padViewRange(
        viewStart,
        viewEnd,
      );
      let visible = findCuesOverlappingRange(proj.cues, rangeStart, rangeEnd);
      visible = withPriorityCues(visible, proj.cues, [activeId, selId]);

      if (visible.length > MAX_VISIBLE_SEGMENTS) {
        if (peaks.segments.getSegments().length > 0) peaks.segments.removeAll();
        setSubtitlesHidden(true);
        lastHighlightKey.current = "";
        return;
      }

      setSubtitlesHidden(false);
      const wantIds = new Set(visible.map((c) => c.id));

      for (const seg of peaks.segments.getSegments()) {
        if (seg.id && !wantIds.has(seg.id)) peaks.segments.removeById(seg.id);
      }

      for (const cue of visible) {
        const state = {
          active: cue.id === activeId,
          selected: cue.id === selId,
        };
        const patch = buildCueSegmentUpdatePatch(cue, proj, state);
        const seg = peaks.segments.getSegment(cue.id);
        if (seg) {
          if (segmentNeedsUpdate(seg, patch)) seg.update(patch);
        } else {
          peaks.segments.add(buildCueSegmentAddOptions(cue, proj, state));
        }
      }

      lastHighlightKey.current = "";
      syncHighlight(time);
    },
    [syncHighlight],
  );

  const syncVisibleSegmentsRef = useRef(syncVisibleSegments);
  syncVisibleSegmentsRef.current = syncVisibleSegments;

  const syncCurrentView = useCallback(() => {
    const zoomview = peaksRef.current?.views.getView("zoomview");
    if (!zoomview) return;
    syncVisibleSegmentsRef.current(
      zoomview.getStartTime(),
      zoomview.getEndTime(),
    );
  }, []);

  useEffect(() => {
    if (
      !videoEl ||
      !peaksInput ||
      !samplesPerPixel ||
      !sampleRate ||
      !zoomRef.current ||
      !scrollRef.current
    )
      return;
    if (!Number.isFinite(duration) || duration <= 0) return;

    let cancelled = false;
    setReady(false);
    setInitError(null);

    const options: PeaksOptions = {
      zoomview: {
        container: zoomRef.current,
        wheelMode: "none",
        waveformColor: hasRealPeaks ? "#3a3f4b" : "#2a2e36",
        playedWaveformColor: hasRealPeaks ? "#00e180" : "#3a3f4b",
        playheadColor: "#ffffff",
        showPlayheadTime: true,
        playheadTextColor: "#ccc",
        axisGridlineColor: "#333",
        axisLabelColor: "#888",
        fontSize: 10,
        enableSegments: true,
      },
      scrollbar: {
        container: scrollRef.current,
        color: "#666",
      },
      mediaElement: videoEl,
      waveformData: peaksWaveformData(peaksInput),
      keyboard: false,
      waveformCache: true,
      zoomLevels: peaksZoomLevels(samplesPerPixel),
      segmentOptions: {
        markers: true,
        overlay: true,
        overlayFontSize: 10,
        overlayLabelAlign: "left",
        overlayLabelVerticalAlign: "middle",
        overlayLabelColor: "#eaeaea",
        overlayLabelPadding: 4,
        overlayOffset: 6,
        overlayCornerRadius: 2,
        startMarkerColor: "#cccccc",
        endMarkerColor: "#cccccc",
      },
    };

    let viewSyncRaf = 0;
    const scheduleViewSync = (startTime: number, endTime: number) => {
      cancelAnimationFrame(viewSyncRaf);
      viewSyncRaf = requestAnimationFrame(() => {
        syncVisibleSegmentsRef.current(startTime, endTime);
        updateLeaderOverlay();
      });
    };

    Peaks.init(options, (err, peaks) => {
      if (cancelled) {
        peaks?.destroy();
        return;
      }
      if (err || !peaks) {
        setInitError(err?.message ?? "Failed to initialize waveform");
        return;
      }

      peaksRef.current = peaks;
      const zoomview = peaks.views.getView("zoomview");
      zoomview?.setWaveformDragMode("scroll");
      zoomview?.enableSegmentDragging(true);
      zoomview?.enableAutoScroll(true, { offset: 40 });

      peaks.on("zoomview.update", (event) => {
        scheduleViewSync(event.startTime, event.endTime);
      });

      peaks.on("segments.click", (event) => {
        const id = event.segment.id;
        if (id) selectCueRef.current(id);
      });

      peaks.on("segments.dblclick", (event) => {
        const id = event.segment.id;
        if (!id) return;
        event.preventViewEvent();
        selectCueRef.current(id);
        focusCueForEdit(id, { scroll: "end" });
      });

      peaks.on("segments.dragstart", (event) => {
        if (event.segment.id) selectCueRef.current(event.segment.id);
      });

      peaks.on("segments.dragend", (event) => {
        const id = event.segment.id;
        if (!id) return;
        if (event.marker) {
          if (event.startMarker)
            setCueStartRef.current(id, event.segment.startTime);
          else setCueEndRef.current(id, event.segment.endTime);
        } else {
          setCueTimesRef.current(
            id,
            event.segment.startTime,
            event.segment.endTime,
          );
        }
      });

      peaks.on("points.dragend", (event) => {
        if (event.point.id !== PROGRAM_START_POINT_ID) return;
        const clamped = clampProgramStart(
          event.point.time,
          durationRef.current,
        );
        setContentStartSecondsRef.current(clamped);
        if (Math.abs(clamped - event.point.time) > 0.0001) {
          event.point.update({ time: clamped });
        }
      });

      peaks.on("zoomview.dblclick", (event) => {
        const id = insertCueAtPlayheadRef.current(
          event.time,
          TIMELINE_NEW_CUE_DURATION,
          durationRef.current,
        );
        if (id) focusCueForEdit(id, { scroll: "end" });
      });

      if (zoomview && duration > 0) {
        zoomview.fitToContainer();
        const width = zoomRef.current?.clientWidth ?? 0;
        const initialSpan = peaksInitialZoomSeconds(
          { samplesPerPixel, sampleRate },
          width,
          duration,
        );
        zoomview.setZoom({ seconds: initialSpan });
        const playhead = videoEl.currentTime;
        zoomview.setStartTime(
          Math.max(
            0,
            Math.min(playhead - initialSpan / 2, duration - initialSpan),
          ),
        );
        scheduleViewSync(zoomview.getStartTime(), zoomview.getEndTime());
      }
      peaks.views.getScrollbar()?.fitToContainer();
      syncProgramStartPoint();
      setReady(true);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(viewSyncRaf);
      peaksRef.current?.destroy();
      peaksRef.current = null;
      setReady(false);
    };
  }, [
    videoEl,
    peaksInput,
    samplesPerPixel,
    sampleRate,
    duration,
    hasRealPeaks,
    syncProgramStartPoint,
    updateLeaderOverlay,
  ]);

  useEffect(() => {
    if (!ready) return;
    syncProgramStartPoint();
  }, [contentStart, ready, syncProgramStartPoint]);

  useEffect(() => {
    if (!ready) return;
    syncCurrentView();
  }, [project.cues, project.speakers, selectedCueId, ready, syncCurrentView]);

  useEffect(() => {
    if (!ready) return;
    return usePlayback.subscribe((state) => {
      syncHighlight(state.currentTime);
    });
  }, [ready, syncHighlight]);

  useEffect(() => {
    if (!ready || !zoomRef.current) return;
    const peaks = peaksRef.current;
    if (!peaks) return;

    let timer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        peaks.views.getView("zoomview")?.fitToContainer();
        peaks.views.getScrollbar()?.fitToContainer();
        syncCurrentView();
      }, 100);
    });
    ro.observe(zoomRef.current);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [ready, syncCurrentView]);

  useEffect(() => {
    if (!ready || !zoomRef.current) return;
    const el = zoomRef.current;

    const onWheel = (e: WheelEvent) => {
      const peaks = peaksRef.current;
      const zoomview = peaks?.views.getView("zoomview");
      if (!peaks || !zoomview) return;

      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      const panGesture = e.shiftKey || (absX > absY && !e.ctrlKey);

      e.preventDefault();

      if (panGesture) {
        // Shift+scroll: browsers may send vertical delta (Windows) or horizontal (macOS).
        let delta = e.shiftKey
          ? absY >= absX
            ? e.deltaY
            : e.deltaX
          : e.deltaX;
        if (delta === 0) return;

        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
        else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE)
          delta *= el.clientWidth;

        zoomview.scrollWaveform({ pixels: Math.trunc(delta) });
        return;
      }

      if (e.deltaY < 0) {
        const anchorX = e.clientX - el.getBoundingClientRect().left;
        zoomViewByFactor(ZOOM_IN_FACTOR, anchorX);
      } else if (e.deltaY > 0) {
        const anchorX = e.clientX - el.getBoundingClientRect().left;
        zoomViewByFactor(ZOOM_OUT_FACTOR, anchorX);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [ready, zoomViewByFactor]);

  const zoomIn = () => zoomViewByFactor(ZOOM_IN_FACTOR);
  const zoomOut = () => zoomViewByFactor(ZOOM_OUT_FACTOR);
  const fitWidth = () => {
    const peaks = peaksRef.current;
    const zoomview = peaks?.views.getView("zoomview");
    if (!zoomview || !duration) return;
    zoomview.setZoom({ seconds: duration });
    zoomview.fitToContainer();
    syncVisibleSegmentsRef.current(
      zoomview.getStartTime(),
      zoomview.getEndTime(),
    );
  };

  return (
    <div
      className={`waveform-pane${hasRealPeaks ? "" : " waveform-pane--timeline-only"}`}
    >
      <div className="waveform-toolbar">
        <span className="waveform-toolbar-label">Timeline</span>
        <ProgramStartPanel project={project} ready={ready} />
        <span className="waveform-toolbar-actions">
          <button
            type="button"
            onClick={zoomOut}
            disabled={!ready}
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={!ready}
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={fitWidth}
            disabled={!ready}
            title="Fit entire video"
          >
            Fit
          </button>
        </span>
        {!ready && !initError && (
          <span className="waveform-status">Loading timeline…</span>
        )}
        {initError && (
          <span className="waveform-status waveform-status--error">
            {initError}
          </span>
        )}
        {ready && !hasRealPeaks && (
          <span className="waveform-hint">
            No waveform peaks — use File → Import waveform… for audio detail
          </span>
        )}
        {ready && hasRealPeaks && subtitlesHidden && (
          <span className="waveform-hint">Zoom in to see subtitles</span>
        )}
        {ready && hasRealPeaks && !subtitlesHidden && !initError && (
          <span className="waveform-hint">
            Drag the orange marker to skip leader · Shift+Home sets from
            playhead
          </span>
        )}
      </div>
      <div className="waveform-scroll" ref={scrollRef} />
      <div className="waveform-view-wrap">
        {leaderWidthPx > 0 && (
          <div
            className="program-start-leader"
            style={{ width: leaderWidthPx }}
          />
        )}
        <div
          className="waveform-zoom"
          ref={zoomRef}
          title="Scroll to zoom; Shift+scroll to pan"
        />
      </div>
    </div>
  );
}
