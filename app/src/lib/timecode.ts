/**
 * SMPTE timecode helpers (non-drop-frame).
 *
 * Timecodes are "HH:MM:SS:FF" where FF is a frame index in [0, fps).
 * The source video is 25 fps and the delivery uses a 10:00:00:00 start offset, so a
 * media time of 101.0s exports as 10:01:41:00.
 */

import type { Project } from "../types";
import {
  mediaFrameToSubtitleTimecode,
  secondsToMediaFrame,
} from "./frame-time";

/** Parse "HH:MM:SS:FF" into a number of seconds, given fps for the frame part. */
export function timecodeToSeconds(tc: string, fps: number): number {
  const parts = tc.trim().split(":");
  if (parts.length !== 4) {
    throw new Error(`Invalid timecode "${tc}" (expected HH:MM:SS:FF)`);
  }
  const [h, m, s, f] = parts.map((p) => {
    const n = Number(p);
    if (!Number.isFinite(n))
      throw new Error(`Invalid timecode component "${p}" in "${tc}"`);
    return n;
  });
  return h * 3600 + m * 60 + s + f / fps;
}

/**
 * Convert a media time (seconds) to "HH:MM:SS:FF".
 * Frames are computed from the total frame count so a rounded frame correctly
 * carries into the next second (e.g. never produces FF === fps).
 */
export function secondsToTimecode(
  seconds: number,
  fps: number,
  offset: string = "00:00:00:00",
): string {
  const offsetSeconds = timecodeToSeconds(offset, fps);
  const total = Math.max(0, seconds + offsetSeconds);
  const totalFrames = Math.round(total * fps);

  const f = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);

  return [h, m, s, f].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Format a media time for on-screen display as "HH:MM:SS.mmm". */
export function secondsToClock(seconds: number): string {
  const total = Math.max(0, seconds);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const s = Math.floor(total) % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

/** Format file time as HH:MM:SS (no fractional seconds). */
export function secondsToClockShort(seconds: number): string {
  const total = Math.max(0, seconds);
  const s = Math.floor(total) % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Visible subtitle timeline window as SMPTE `start – end`. */
export function formatSubtitleTimelineRange(
  startSeconds: number,
  endSeconds: number,
  project: Project,
  durationSeconds?: number,
): string {
  const fmt = (t: number) =>
    mediaFrameToSubtitleTimecode(secondsToMediaFrame(t, project), project);
  let label = `${fmt(startSeconds)} – ${fmt(endSeconds)}`;
  if (
    durationSeconds != null &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
  ) {
    label += ` / ${fmt(durationSeconds)}`;
  }
  return label;
}

/** Visible timeline window as `start – end`, optionally with `/ duration`. */
export function formatTimelineViewRange(
  start: number,
  end: number,
  duration?: number,
): string {
  const span = Math.max(0, end - start);
  const fmt = (t: number) =>
    span <= 10 ? secondsToClock(t) : secondsToClockShort(t);
  let label = `${fmt(start)} – ${fmt(end)}`;
  if (duration != null && Number.isFinite(duration) && duration > 0) {
    label += ` / ${secondsToClockShort(duration)}`;
  }
  return label;
}

/** Parse "HH:MM:SS.mmm" (milliseconds optional) into seconds. */
export function parseClock(clock: string): number {
  const trimmed = clock.trim();
  const match = trimmed.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) {
    throw new Error(`Invalid clock "${clock}" (expected HH:MM:SS.mmm)`);
  }
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  if (m > 59 || s > 59) {
    throw new Error(`Invalid clock "${clock}"`);
  }
  let ms = 0;
  if (match[4]) {
    const frac = match[4].padEnd(3, "0").slice(0, 3);
    ms = Number(frac);
    if (!Number.isFinite(ms)) {
      throw new Error(`Invalid clock "${clock}"`);
    }
  }
  return h * 3600 + m * 60 + s + ms / 1000;
}

/** Clamp a playhead seek target to [0, duration]. */
export function clampPlayheadTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return seconds;
  return Math.min(seconds, duration);
}

/** Duration of a single frame in seconds, for nudging. */
export function frameDuration(fps: number): number {
  return 1 / fps;
}
