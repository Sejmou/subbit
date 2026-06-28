import type { Project } from "../types";
import { timecodeToSeconds } from "./timecode";

/** Rational media frame rate (e.g. 24000/1001). */
export interface FrameRate {
  numerator: number;
  denominator: number;
}

export const DEFAULT_FRAME_RATE: FrameRate = { numerator: 25, denominator: 1 };

/** Integer fps for the SMPTE `:FF` field (non-drop-frame). */
export function nominalTimecodeFps(rate: FrameRate): number {
  return Math.round(rate.numerator / rate.denominator);
}

export function projectFrameRate(project: Project): FrameRate {
  return {
    numerator: project.fpsNumerator,
    denominator: project.fpsDenominator,
  };
}

export function frameRateFromVideo(
  numerator: number,
  denominator: number,
): FrameRate {
  return { numerator, denominator };
}

/** Media seconds → frame index from file start. */
export function secondsToFrame(seconds: number, rate: FrameRate): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round((seconds * rate.numerator) / rate.denominator);
}

/** Frame index → media seconds for `<video>` seek and Peaks. */
export function frameToSeconds(frame: number, rate: FrameRate): number {
  if (!Number.isFinite(frame) || frame <= 0) return 0;
  return (frame * rate.denominator) / rate.numerator;
}

/** One frame step in media seconds. */
export function frameStepSeconds(rate: FrameRate): number {
  return rate.denominator / rate.numerator;
}

/** Total frame count encoded in an SMPTE timecode at nominal fps. */
export function timecodeToTotalFrames(tc: string, tcFps: number): number {
  return Math.round(timecodeToSeconds(tc, tcFps) * tcFps);
}

/** SMPTE timecode from a total frame count at nominal fps. */
export function totalFramesToTimecode(
  totalFrames: number,
  tcFps: number,
): string {
  const clamped = Math.max(0, totalFrames);
  const f = clamped % tcFps;
  const totalSeconds = Math.floor(clamped / tcFps);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return [h, m, s, f].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Subtitle SMPTE for a media time (project timing settings). */
export function fileSecondsToSubtitleTimecode(
  fileSeconds: number,
  project: Project,
): string {
  const rate = projectFrameRate(project);
  const tcFps = nominalTimecodeFps(rate);
  const startFrames = timecodeToTotalFrames(project.startTimecode, tcFps);
  const fileFrame = secondsToFrame(fileSeconds, rate);
  const refFrame = secondsToFrame(project.referenceStartSeconds, rate);
  return totalFramesToTimecode(startFrames + fileFrame - refFrame, tcFps);
}

/** Parse subtitle SMPTE → media seconds. */
export function subtitleTimecodeToFileSeconds(
  tc: string,
  project: Project,
): number {
  const rate = projectFrameRate(project);
  const tcFps = nominalTimecodeFps(rate);
  const startFrames = timecodeToTotalFrames(project.startTimecode, tcFps);
  const totalFrames = timecodeToTotalFrames(tc.trim(), tcFps);
  const refFrame = secondsToFrame(project.referenceStartSeconds, rate);
  const fileFrame = refFrame + (totalFrames - startFrames);
  return frameToSeconds(fileFrame, rate);
}

/** @deprecated Use fileSecondsToSubtitleTimecode */
export function mediaFrameToSubtitleTimecode(
  mediaFrame: number,
  project: Project,
): string {
  return fileSecondsToSubtitleTimecode(
    frameToSeconds(mediaFrame, projectFrameRate(project)),
    project,
  );
}

/** @deprecated Use subtitleTimecodeToFileSeconds */
export function subtitleTimecodeToMediaFrame(
  tc: string,
  project: Project,
): number {
  return secondsToFrame(
    subtitleTimecodeToFileSeconds(tc, project),
    projectFrameRate(project),
  );
}

/** @deprecated Use secondsToFrame with projectFrameRate */
export function secondsToMediaFrame(seconds: number, project: Project): number {
  return secondsToFrame(seconds, projectFrameRate(project));
}

/** @deprecated Use frameToSeconds with projectFrameRate */
export function mediaFrameToSeconds(
  mediaFrame: number,
  project: Project,
): number {
  return frameToSeconds(mediaFrame, projectFrameRate(project));
}
