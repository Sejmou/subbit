import { useEffect, useMemo, useRef, useState } from "react";
import Peaks, { type PeaksInstance, type PeaksOptions } from "peaks.js";
import type { Project } from "../types";
import { useProject } from "../store/project";
import { usePlayback } from "../store/playback";
import { useWaveform } from "../store/waveform";
import { focusCueForEdit } from "../lib/focus-cue";
import { findActiveCueId } from "../lib/active-cue";
import { findOverlappingCueIds } from "../lib/cue-overlap";
import { TIMELINE_NEW_CUE_DURATION } from "../lib/cue-insert";
import { createProgramStartPointMarker } from "../lib/program-start-point-marker";
import {
  buildPlaceholderWaveformPeaks,
  peaksWaveformData,
  peaksZoomLevels,
  type WaveformPeaksInput,
} from "../lib/waveform-peaks";
import {
  syncPeaksCueHighlight,
  syncPeaksVisibleCueSegments,
} from "../lib/waveform-segments";
import {
  applyInitialTimelineZoom,
  applyTimelineFitWidth,
  applyTimelineZoomByFactor,
  clampTimelineViewRange,
  handleTimelineWheelEvent,
  TIMELINE_ZOOM_IN_FACTOR,
  TIMELINE_ZOOM_OUT_FACTOR,
  timelineViewWidthPx,
  type TimelinePeaksMeta,
} from "../lib/timeline-zoom";
import {
  referenceLeaderWidthPx,
  syncReferenceStartPeaksPoint,
} from "../lib/program-start";
import { fileSecondsToSubtitleTimecode } from "../lib/frame-time";

interface Options {
  project: Project;
  onTimelineWidthChange: (widthPx: number) => void;
}

function buildPeaksOptions(
  peaksInput: WaveformPeaksInput,
  samplesPerPixel: number,
  hasRealPeaks: boolean,
  zoomContainer: HTMLDivElement,
  scrollContainer: HTMLDivElement,
  videoEl: HTMLVideoElement,
  getProject: () => Project,
): PeaksOptions {
  const formatSubtitleTime = (fileSeconds: number) => {
    const proj = getProject();
    return fileSecondsToSubtitleTimecode(fileSeconds, proj);
  };

  return {
    zoomview: {
      container: zoomContainer,
      wheelMode: "none",
      waveformColor: hasRealPeaks ? "#3a3f4b" : "#2a2e36",
      playedWaveformColor: hasRealPeaks ? "#00e180" : "#3a3f4b",
      playheadColor: "#ffffff",
      showPlayheadTime: true,
      playheadTextColor: "#ccc",
      formatPlayheadTime: formatSubtitleTime,
      formatAxisTime: formatSubtitleTime,
      axisGridlineColor: "#333",
      axisLabelColor: "#888",
      fontSize: 10,
      enableSegments: true,
    },
    scrollbar: {
      container: scrollContainer,
      color: "#666",
    },
    mediaElement: videoEl,
    waveformData: peaksWaveformData(peaksInput),
    keyboard: false,
    waveformCache: true,
    createPointMarker: createProgramStartPointMarker,
    createSegmentLabel: () => null,
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
}

export function useWaveformPeaksTimeline({
  project,
  onTimelineWidthChange,
}: Options) {
  const zoomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const peaksRef = useRef<PeaksInstance | null>(null);
  const initialZoomAppliedRef = useRef(false);
  const projectRef = useRef(project);
  const lastActiveId = useRef<string | null>(null);
  const lastHighlightKey = useRef("");
  projectRef.current = project;

  const overlappingCueIds = useMemo(
    () => findOverlappingCueIds(project.cues),
    [project.cues],
  );
  const overlappingCueIdsRef = useRef(overlappingCueIds);
  overlappingCueIdsRef.current = overlappingCueIds;

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
  const referenceStartSeconds = project.referenceStartSeconds;

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

  const referenceStartSecondsRef = useRef(referenceStartSeconds);
  referenceStartSecondsRef.current = referenceStartSeconds;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const metaRef = useRef<TimelinePeaksMeta | null>(null);
  metaRef.current =
    samplesPerPixel && sampleRate ? { samplesPerPixel, sampleRate } : null;
  const viewSyncRafRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [subtitlesHidden, setSubtitlesHidden] = useState(false);
  const [leaderWidthPx, setLeaderWidthPx] = useState(0);
  const [viewRange, setViewRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  function getMeta(): TimelinePeaksMeta | null {
    return metaRef.current;
  }

  function publishViewRange(startTime: number, endTime: number) {
    const range = clampTimelineViewRange(
      startTime,
      endTime,
      durationRef.current,
    );
    if (range) setViewRange(range);
  }

  function publishLeaderOverlay() {
    const zoomview = peaksRef.current?.views.getView("zoomview");
    const container = zoomRef.current;
    if (!zoomview || !container) return;

    setLeaderWidthPx(
      referenceLeaderWidthPx(
        referenceStartSecondsRef.current,
        zoomview.getStartTime(),
        zoomview.getEndTime(),
        container.clientWidth,
      ),
    );
  }

  function syncReferencePoint() {
    const peaks = peaksRef.current;
    if (!peaks) return;
    syncReferenceStartPeaksPoint(peaks, referenceStartSecondsRef.current);
    publishLeaderOverlay();
  }

  function syncHighlight(time: number) {
    const peaks = peaksRef.current;
    if (!peaks) return;

    const proj = projectRef.current;
    const selId = selectedCueIdRef.current;
    const activeId = findActiveCueId(proj.cues, time);
    const key = `${activeId ?? ""}:${selId ?? ""}`;
    if (key === lastHighlightKey.current) return;

    const prevActive = lastActiveId.current;
    lastHighlightKey.current = key;
    lastActiveId.current = activeId ?? null;

    syncPeaksCueHighlight(
      peaks,
      proj,
      time,
      selId,
      overlappingCueIdsRef.current,
      prevActive,
    );
  }

  function syncVisibleSegments(viewStart: number, viewEnd: number) {
    const peaks = peaksRef.current;
    const proj = projectRef.current;
    if (!peaks) return;

    const time = usePlayback.getState().currentTime;
    const result = syncPeaksVisibleCueSegments(
      peaks,
      proj,
      viewStart,
      viewEnd,
      {
        selectedCueId: selectedCueIdRef.current,
        currentTime: time,
        overlappingIds: overlappingCueIdsRef.current,
      },
    );
    setSubtitlesHidden(result.subtitlesHidden);
    if (result.subtitlesHidden) {
      lastHighlightKey.current = "";
      return;
    }

    lastHighlightKey.current = "";
    syncHighlight(time);
  }

  function scheduleViewSync(startTime: number, endTime: number) {
    cancelAnimationFrame(viewSyncRafRef.current);
    viewSyncRafRef.current = requestAnimationFrame(() => {
      syncVisibleSegments(startTime, endTime);
      publishLeaderOverlay();
      publishViewRange(startTime, endTime);
    });
  }

  function syncCurrentView() {
    const zoomview = peaksRef.current?.views.getView("zoomview");
    if (!zoomview) return;
    syncVisibleSegments(zoomview.getStartTime(), zoomview.getEndTime());
    publishViewRange(zoomview.getStartTime(), zoomview.getEndTime());
  }

  function applyInitialZoom() {
    const meta = getMeta();
    const zoomview = peaksRef.current?.views.getView("zoomview");
    const container = zoomRef.current;
    const video = usePlayback.getState().videoEl;
    if (!meta || !zoomview || !container || !video) return false;

    const applied = applyInitialTimelineZoom(zoomview, meta, {
      durationSeconds: durationRef.current,
      viewWidthPx: viewWidthPx(zoomview, container),
      playheadSeconds: video.currentTime,
    });
    if (!applied) return false;
    initialZoomAppliedRef.current = true;
    return true;
  }

  function zoomViewByFactor(factor: number, anchorX?: number) {
    const meta = getMeta();
    const zoomview = peaksRef.current?.views.getView("zoomview");
    const container = zoomRef.current;
    if (!meta || !zoomview || !container) return;

    applyTimelineZoomByFactor(zoomview, meta, factor, {
      durationSeconds: durationRef.current,
      viewWidthPx: viewWidthPx(zoomview, container),
      anchorXPx: anchorX,
    });
  }

  function fitWidth() {
    const meta = getMeta();
    const peaks = peaksRef.current;
    const zoomview = peaks?.views.getView("zoomview");
    const container = zoomRef.current;
    const d = durationRef.current;
    if (!meta || !zoomview || !container || !d) return;

    if (
      !applyTimelineFitWidth(
        zoomview,
        meta,
        d,
        viewWidthPx(zoomview, container),
      )
    ) {
      return;
    }
    syncVisibleSegments(zoomview.getStartTime(), zoomview.getEndTime());
    publishViewRange(zoomview.getStartTime(), zoomview.getEndTime());
  }

  function viewWidthPx(zoomview: unknown, container: HTMLDivElement) {
    return timelineViewWidthPx(
      zoomview as { getWidth?: () => number | undefined },
      container.clientWidth,
    );
  }

  function reportTimelineWidth() {
    const width = zoomRef.current?.clientWidth ?? 0;
    if (width > 0) onTimelineWidthChange(width);
  }

  useEffect(() => {
    if (
      !videoEl ||
      !peaksInput ||
      !samplesPerPixel ||
      !sampleRate ||
      !zoomRef.current ||
      !scrollRef.current
    ) {
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) return;

    let cancelled = false;
    initialZoomAppliedRef.current = false;
    setReady(false);
    setInitError(null);

    const options = buildPeaksOptions(
      peaksInput,
      samplesPerPixel,
      hasRealPeaks,
      zoomRef.current,
      scrollRef.current,
      videoEl,
      () => projectRef.current,
    );

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
        if (applyInitialZoom()) {
          scheduleViewSync(zoomview.getStartTime(), zoomview.getEndTime());
        }
      }
      peaks.views.getScrollbar()?.fitToContainer();
      syncReferencePoint();
      setReady(true);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(viewSyncRafRef.current);
      peaksRef.current?.destroy();
      peaksRef.current = null;
      setReady(false);
    };
    // Peaks listeners read latest project/store state via refs — no callback deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional stable init
  }, [
    videoEl,
    peaksInput,
    samplesPerPixel,
    sampleRate,
    duration,
    hasRealPeaks,
  ]);

  useEffect(() => {
    if (!ready) return;
    syncReferencePoint();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncReferencePoint uses refs
  }, [referenceStartSeconds, ready]);

  useEffect(() => {
    if (!ready) return;
    syncCurrentView();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncCurrentView uses refs
  }, [project.cues, project.speakers, selectedCueId, ready]);

  useEffect(() => {
    if (!ready) return;
    return usePlayback.subscribe((state) => {
      syncHighlight(state.currentTime);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncHighlight uses refs
  }, [ready]);

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
        if (!initialZoomAppliedRef.current) applyInitialZoom();
        syncCurrentView();
        reportTimelineWidth();
      }, 100);
    });
    ro.observe(zoomRef.current);
    if (scrollRef.current) ro.observe(scrollRef.current);
    reportTimelineWidth();
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers use refs
  }, [ready, onTimelineWidthChange]);

  useEffect(() => {
    if (!ready || !zoomRef.current) return;
    const el = zoomRef.current;

    const onWheel = (e: WheelEvent) => {
      const peaks = peaksRef.current;
      const zoomview = peaks?.views.getView("zoomview");
      if (!peaks || !zoomview) return;

      handleTimelineWheelEvent(
        e,
        el,
        zoomview,
        (anchorX) => zoomViewByFactor(TIMELINE_ZOOM_IN_FACTOR, anchorX),
        (anchorX) => zoomViewByFactor(TIMELINE_ZOOM_OUT_FACTOR, anchorX),
      );
    };

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomViewByFactor uses refs
  }, [ready]);

  return {
    zoomRef,
    scrollRef,
    ready,
    initError,
    subtitlesHidden,
    leaderWidthPx,
    viewRange,
    hasRealPeaks,
    duration,
    zoomIn: () => zoomViewByFactor(TIMELINE_ZOOM_IN_FACTOR),
    zoomOut: () => zoomViewByFactor(TIMELINE_ZOOM_OUT_FACTOR),
    fitWidth,
  };
}
