import type { Segment, SegmentOptions } from "peaks.js";
import type { PeaksInstance } from "peaks.js";
import type { Cue, Project } from "../types";
import { findActiveCueId } from "./active-cue";
import { cueEndSeconds, cueStartSeconds } from "./cue-timing";
import { cueLabelTextShort } from "./cue-label";
import { isCueBeforeReferenceStart } from "./program-start";
import {
  findCuesOverlappingRange,
  padViewRange,
  withPriorityCues,
} from "./visible-cues";

/** peaks.js + Konva struggle with hundreds of segment overlays at once. */
export const MAX_PEAKS_VISIBLE_SEGMENTS = 200;

const DEFAULT_CUE_COLOR = "#4363d8";
const ACTIVE_BOOST = 0.35;
const SELECTED_BOOST = 0.22;
const BASE_OVERLAY = 0.16;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(67, 99, 216, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function speakerColor(project: Project, cue: Cue): string {
  return (
    project.speakers.find((s) => s.id === cue.speakerId)?.color ??
    DEFAULT_CUE_COLOR
  );
}

const INVALID_CUE_COLOR = "#ffb74d";
const OVERLAP_CUE_COLOR = "#ff5252";

function segmentVisuals(
  project: Project,
  cue: Cue,
  opts: { active: boolean; selected: boolean; overlapping: boolean },
): Pick<SegmentOptions, "color" | "borderColor" | "labelText"> {
  const invalid = isCueBeforeReferenceStart(cue, project);
  if (invalid) {
    const overlayOpacity = opts.active
      ? BASE_OVERLAY + ACTIVE_BOOST
      : opts.selected
        ? BASE_OVERLAY + SELECTED_BOOST
        : BASE_OVERLAY + 0.08;
    return {
      color: rgba(INVALID_CUE_COLOR, overlayOpacity),
      borderColor: opts.selected ? "#ffffff" : INVALID_CUE_COLOR,
      labelText: cueLabelTextShort(cue),
    };
  }

  const base = speakerColor(project, cue);
  const overlayOpacity = opts.active
    ? BASE_OVERLAY + ACTIVE_BOOST
    : opts.selected
      ? BASE_OVERLAY + SELECTED_BOOST
      : BASE_OVERLAY;

  return {
    color: rgba(base, overlayOpacity),
    borderColor: opts.selected
      ? "#ffffff"
      : opts.overlapping
        ? OVERLAP_CUE_COLOR
        : opts.active
          ? base
          : "rgba(255,255,255,0.15)",
    labelText: cueLabelTextShort(cue),
  };
}

/** Options for peaks.segments.add() — includes create-only fields. */
export function buildCueSegmentAddOptions(
  cue: Cue,
  project: Project,
  opts: { active: boolean; selected: boolean; overlapping: boolean },
): SegmentOptions {
  return {
    id: cue.id,
    startTime: cueStartSeconds(cue),
    endTime: cueEndSeconds(cue),
    editable: true,
    markers: true,
    overlay: true,
    ...segmentVisuals(project, cue, opts),
  };
}

/** Subset safe for peaks.segments.update() — markers/overlay cannot be changed. */
export function buildCueSegmentUpdatePatch(
  cue: Cue,
  project: Project,
  opts: { active: boolean; selected: boolean; overlapping: boolean },
): Pick<
  SegmentOptions,
  "startTime" | "endTime" | "labelText" | "color" | "borderColor"
> {
  return {
    startTime: cueStartSeconds(cue),
    endTime: cueEndSeconds(cue),
    ...segmentVisuals(project, cue, opts),
  };
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

export interface SyncPeaksSegmentsResult {
  subtitlesHidden: boolean;
}

/** Sync cue segment overlays for the visible zoom-view range. */
export function syncPeaksVisibleCueSegments(
  peaks: PeaksInstance,
  project: Project,
  viewStart: number,
  viewEnd: number,
  opts: {
    selectedCueId: string | null;
    currentTime: number;
    overlappingIds: Set<string>;
  },
): SyncPeaksSegmentsResult {
  const activeId = findActiveCueId(project.cues, opts.currentTime);
  const selId = opts.selectedCueId;

  const { start: rangeStart, end: rangeEnd } = padViewRange(viewStart, viewEnd);
  let visible = findCuesOverlappingRange(project.cues, rangeStart, rangeEnd);
  visible = withPriorityCues(visible, project.cues, [activeId, selId]);

  if (visible.length > MAX_PEAKS_VISIBLE_SEGMENTS) {
    if (peaks.segments.getSegments().length > 0) peaks.segments.removeAll();
    return { subtitlesHidden: true };
  }

  const wantIds = new Set(visible.map((c) => c.id));
  for (const seg of peaks.segments.getSegments()) {
    if (seg.id && !wantIds.has(seg.id)) peaks.segments.removeById(seg.id);
  }

  for (const cue of visible) {
    const state = {
      active: cue.id === activeId,
      selected: cue.id === selId,
      overlapping: opts.overlappingIds.has(cue.id),
    };
    const patch = buildCueSegmentUpdatePatch(cue, project, state);
    const seg = peaks.segments.getSegment(cue.id);
    if (seg) {
      if (segmentNeedsUpdate(seg, patch)) seg.update(patch);
    } else {
      peaks.segments.add(buildCueSegmentAddOptions(cue, project, state));
    }
  }

  return { subtitlesHidden: false };
}

/** Update active/selected styling for segments already on the timeline. */
export function syncPeaksCueHighlight(
  peaks: PeaksInstance,
  project: Project,
  time: number,
  selectedCueId: string | null,
  overlappingIds: Set<string>,
  prevActiveId?: string | null,
): void {
  const activeId = findActiveCueId(project.cues, time);
  const touchIds = new Set<string>();
  for (const id of [activeId, prevActiveId, selectedCueId]) {
    if (id) touchIds.add(id);
  }

  for (const id of touchIds) {
    const cue = project.cues.find((c) => c.id === id);
    if (!cue) continue;
    const state = {
      active: cue.id === activeId,
      selected: cue.id === selectedCueId,
      overlapping: overlappingIds.has(cue.id),
    };
    const seg = peaks.segments.getSegment(id);
    if (!seg) {
      peaks.segments.add(buildCueSegmentAddOptions(cue, project, state));
      continue;
    }
    seg.update(buildCueSegmentUpdatePatch(cue, project, state));
  }
}
