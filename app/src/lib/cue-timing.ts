import type { Cue, Project } from "../types";
import {
  frameStepSeconds,
  frameToSeconds,
  projectFrameRate,
  secondsToFrame,
} from "./frame-time";

/** Media seconds at cue In. */
export function cueStartSeconds(cue: Cue): number {
  return cue.start;
}

/** Media seconds at cue Out. */
export function cueEndSeconds(cue: Cue): number {
  return cue.end;
}

/** One frame step in media seconds for the project. */
export function frameStep(project: Project): number {
  return frameStepSeconds(projectFrameRate(project));
}

/** Snap media seconds to the nearest frame boundary (for edits and display). */
export function snapToFrame(seconds: number, project: Project): number {
  const rate = projectFrameRate(project);
  return frameToSeconds(secondsToFrame(seconds, rate), rate);
}
