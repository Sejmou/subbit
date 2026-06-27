import type { SegmentOptions } from "peaks.js";
import type { Cue, Project } from "../types";
import { cueLabelTextShort } from "./cue-label";

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

function segmentVisuals(
  project: Project,
  cue: Cue,
  opts: { active: boolean; selected: boolean },
): Pick<SegmentOptions, "color" | "borderColor" | "labelText"> {
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
  opts: { active: boolean; selected: boolean },
): SegmentOptions {
  return {
    id: cue.id,
    startTime: cue.start,
    endTime: cue.end,
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
  opts: { active: boolean; selected: boolean },
): Pick<
  SegmentOptions,
  "startTime" | "endTime" | "labelText" | "color" | "borderColor"
> {
  return {
    startTime: cue.start,
    endTime: cue.end,
    ...segmentVisuals(project, cue, opts),
  };
}
