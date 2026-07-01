import type { Cue, Project, ShotRange } from "../types";
import { snapToFrame } from "./cue-timing";
import { effectiveShotRanges, shotRangeText } from "./word-model/render";

const EPS = 0.001;

/** Infer a split time at the boundary before `rangeIndex`. */
export function splitTimeAtShotRange(cue: Cue, rangeIndex: number): number {
  const ranges = cue.shotRanges;
  if (rangeIndex <= 0 || rangeIndex >= ranges.length) return cue.start;

  const range = ranges[rangeIndex];
  if (cue.words.length > 0 && range.fromWord > 0) {
    const t =
      cue.words[range.fromWord - 1]?.end ??
      cue.words[range.fromWord]?.start ??
      cue.start;
    return Math.max(cue.start + EPS, Math.min(t, cue.end - EPS));
  }

  const totalChars =
    ranges.reduce((n, r) => n + shotRangeText(cue, r).length, 0) || 1;
  const leftChars = ranges
    .slice(0, rangeIndex)
    .reduce((n, r) => n + shotRangeText(cue, r).length, 0);
  const ratio = leftChars / totalChars;
  return Math.max(
    cue.start + EPS,
    Math.min(cue.start + (cue.end - cue.start) * ratio, cue.end - EPS),
  );
}

/** Index of the shot range visible at playhead time within a cue. */
export function activeShotRangeIndex(
  cue: Cue,
  t: number,
  project: Project,
): number {
  const ranges = effectiveShotRanges(cue, project.defaultShot);
  if (ranges.length <= 1) return 0;
  const splitSeconds = snapToFrame(t, project);
  for (let i = ranges.length - 1; i >= 0; i--) {
    if (splitSeconds >= splitTimeAtShotRange(cue, i)) return i;
  }
  return 0;
}

/** @deprecated use activeShotRangeIndex */
export const activeSegmentIndex = activeShotRangeIndex;

/** @deprecated use splitTimeAtShotRange */
export const splitTimeAtSegment = splitTimeAtShotRange;

export function shotRangeAtIndex(
  cue: Cue,
  rangeIndex: number,
  defaultShot: string,
): ShotRange {
  return effectiveShotRanges(cue, defaultShot)[rangeIndex];
}
