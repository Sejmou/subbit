import { findActiveCueIndex } from "./active-cue";
import { activeShotRangeIndex, shotRangeAtIndex } from "./segment-timing";
import type { Project } from "../types";
import { shotRangeText } from "./word-model/render";

export interface PreviewSubtitle {
  cueId: string;
  text: string;
}

/** Resolve the subtitle line to show on the video at file time `t`. */
export function previewAtTime(
  project: Project,
  t: number,
): PreviewSubtitle | null {
  const idx = findActiveCueIndex(project.cues, t);
  if (idx < 0) return null;

  const cue = project.cues[idx];
  const rangeIdx = activeShotRangeIndex(cue, t, project);
  const range = shotRangeAtIndex(cue, rangeIdx, project.defaultShot);
  const text = shotRangeText(cue, range).trim();
  if (!text) return null;

  return { cueId: cue.id, text };
}
