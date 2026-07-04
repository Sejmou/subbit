import { findActiveCueIndex } from "./active-cue";
import type { Project } from "../types";
import { cueDisplayText } from "./word-model/render";

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
  const text = cueDisplayText(cue).trim();
  if (!text) return null;

  return { cueId: cue.id, text };
}
