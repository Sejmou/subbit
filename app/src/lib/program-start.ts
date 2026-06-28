import type { PeaksInstance } from "peaks.js";
import type { Cue, Project } from "../types";
import { cueEndSeconds, cueStartSeconds } from "./cue-timing";
import {
  fileSecondsToSubtitleTimecode,
  projectFrameRate,
  secondsToFrame,
  subtitleTimecodeToFileSeconds,
} from "./frame-time";

export const REFERENCE_START_POINT_ID = "reference-start";

/** Cues starting before the reference point (export clamps to subtitle zero). */
export function cuesBeforeReferenceStart(project: Project): Cue[] {
  const ref = project.referenceStartSeconds;
  if (ref <= 0) return [];
  return project.cues.filter((c) => c.start < ref);
}

/** @deprecated Use cuesBeforeReferenceStart */
export const cuesBeforeReferenceFrame = cuesBeforeReferenceStart;

export function clampReferenceStart(
  seconds: number,
  durationSeconds: number,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return seconds;
  return Math.min(seconds, Math.max(0, durationSeconds - 1 / 25));
}

/** @deprecated Use clampReferenceStart */
export const clampReferenceFrame = clampReferenceStart;

export function maxReferenceStartSeconds(
  _project: Project,
  durationSeconds: number,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    return Infinity;
  return Math.max(0, durationSeconds - 1 / 25);
}

/** @deprecated Use maxReferenceStartSeconds */
export const maxReferenceFrame = maxReferenceStartSeconds;

/** @deprecated Use parseReferenceStartTimecode */
export const parseReferenceFrameTimecode = parseReferenceStartTimecode;

/** @deprecated Use REFERENCE_START_POINT_ID */
export const REFERENCE_FRAME_POINT_ID = REFERENCE_START_POINT_ID;

export function referenceStartTimecode(project: Project): string {
  return fileSecondsToSubtitleTimecode(project.referenceStartSeconds, project);
}

/** @deprecated Use referenceStartTimecode */
export const referenceFrameTimecode = referenceStartTimecode;

export function parseReferenceStartTimecode(
  tc: string,
  project: Project,
): number {
  const trimmed = tc.trim();
  if (!trimmed || trimmed === project.startTimecode) return 0;
  return Math.max(0, subtitleTimecodeToFileSeconds(trimmed, project));
}

/** Width of pre-reference shading overlay in layout pixels. */
export function referenceLeaderWidthPx(
  referenceStartSeconds: number,
  viewStartSeconds: number,
  viewEndSeconds: number,
  containerWidthPx: number,
): number {
  if (referenceStartSeconds <= 0) return 0;
  const span = viewEndSeconds - viewStartSeconds;
  if (span <= 0 || containerWidthPx <= 0) return 0;
  if (referenceStartSeconds <= viewStartSeconds) return 0;
  if (referenceStartSeconds >= viewEndSeconds) return containerWidthPx;
  return ((referenceStartSeconds - viewStartSeconds) / span) * containerWidthPx;
}

/** Create or move the reference-start point marker on the peaks timeline. */
export function syncReferenceStartPeaksPoint(
  peaks: PeaksInstance,
  referenceStartSeconds: number,
): void {
  const time = Math.max(0, referenceStartSeconds);
  const existing = peaks.points.getPoint(REFERENCE_START_POINT_ID);

  if (existing) {
    if (Math.abs(existing.time - time) > 0.0001) {
      existing.update({ time, labelText: "Subtitle start" });
    }
    return;
  }

  peaks.points.add({
    id: REFERENCE_START_POINT_ID,
    time,
    editable: true,
    color: "#ffb74d",
    labelText: "Subtitle start",
  });
}

/** @deprecated Use syncReferenceStartPeaksPoint */
export function syncReferenceFramePeaksPoint(
  peaks: PeaksInstance,
  referenceFrame: number,
  project: Project,
): void {
  void referenceFrame;
  void project;
  syncReferenceStartPeaksPoint(peaks, project.referenceStartSeconds);
}

/** Subtitle seconds from file time (clamped at zero). */
export function fileSecondsToSubtitleSeconds(
  fileSeconds: number,
  referenceStartSeconds: number,
): number {
  return Math.max(0, fileSeconds - referenceStartSeconds);
}

/** Export subtitle frame index for a cue boundary. */
export function cueExportFrame(fileSeconds: number, project: Project): number {
  const rate = projectFrameRate(project);
  const refFrame = secondsToFrame(project.referenceStartSeconds, rate);
  const fileFrame = secondsToFrame(fileSeconds, rate);
  return Math.max(0, fileFrame - refFrame);
}

export { cueStartSeconds, cueEndSeconds };
