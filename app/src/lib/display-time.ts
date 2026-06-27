import type { Project } from "../types";
import {
  contentStartSeconds,
  fileTimeToProgramTime,
} from "./program-start";
import { secondsToClock, secondsToTimecode, timecodeToSeconds } from "./timecode";
import type { TimeReference } from "../store/time-reference";

/** File seconds for the active time reference (editor display / playhead field). */
export function referenceSeconds(
  fileSeconds: number,
  contentStart: number,
  reference: TimeReference,
): number {
  return reference === "file"
    ? fileSeconds
    : fileTimeToProgramTime(fileSeconds, contentStart);
}

/** SMPTE cue time for the active reference (frames, zero-based offset). */
export function cueDisplayTimecode(
  fileSeconds: number,
  project: Project,
  reference: TimeReference,
): string {
  const seconds = referenceSeconds(
    fileSeconds,
    contentStartSeconds(project),
    reference,
  );
  return secondsToTimecode(seconds, project.fps, "00:00:00:00");
}

/** Playhead clock field for the active reference. */
export function playheadDisplayClock(
  fileSeconds: number,
  contentStart: number,
  reference: TimeReference,
): string {
  return secondsToClock(referenceSeconds(fileSeconds, contentStart, reference));
}

/** Parse a playhead clock value back to file seconds. */
export function playheadClockToFileSeconds(
  clockSeconds: number,
  contentStart: number,
  reference: TimeReference,
): number {
  return reference === "file" ? clockSeconds : clockSeconds + contentStart;
}

/** Parse a displayed cue timecode back to file seconds. */
export function cueTimecodeToFileSeconds(
  timecode: string,
  fps: number,
  contentStart: number,
  reference: TimeReference,
): number {
  const refSeconds = timecodeToSeconds(timecode, fps);
  return reference === "file" ? refSeconds : refSeconds + contentStart;
}
