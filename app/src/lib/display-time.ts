import type { Project } from "../types";
import {
  fileSecondsToSubtitleTimecode,
  subtitleTimecodeToFileSeconds,
} from "./frame-time";

/** Subtitle SMPTE for a media time (playhead or cue boundary). */
export function cueDisplayTimecode(
  fileSeconds: number,
  project: Project,
): string {
  return fileSecondsToSubtitleTimecode(fileSeconds, project);
}

/** Subtitle SMPTE for the playhead field. */
export function playheadDisplayTimecode(
  fileSeconds: number,
  project: Project,
): string {
  return cueDisplayTimecode(fileSeconds, project);
}

/** Parse playhead SMPTE back to media seconds. */
export function playheadTimecodeToFileSeconds(
  timecode: string,
  project: Project,
): number {
  return subtitleTimecodeToFileSeconds(timecode, project);
}

/** Parse displayed cue timecode back to media seconds. */
export function cueTimecodeToFileSeconds(
  timecode: string,
  project: Project,
): number {
  return playheadTimecodeToFileSeconds(timecode, project);
}
