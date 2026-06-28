/**
 * Core domain model for Subbit.
 *
 * The editable source of truth is a {@link Project} — a superset of whisperx
 * output with word-level timing so cues can be re-split without losing alignment.
 * Saved as `.subbit.json`; exported to delivery CSV, SRT, VTT, ASS, etc.
 *
 * Cue `start`/`end` are stored as file-relative seconds (playback / WhisperX
 * axis). Subtitle SMPTE in the UI is derived from `startTimecode`,
 * `referenceStartSeconds`, and the project frame rate.
 */

export type ShotId = string;

/** A contiguous slice of a cue that shares a single shot type. */
export interface Segment {
  text: string;
  shot: ShotId;
}

/** Word-level timing from whisperx; file-relative seconds. */
export interface Word {
  word: string;
  start: number;
  end: number;
  speaker?: string | null;
  score?: number;
}

/** Diarization guess from whisperx import; kept even after manual role assignment. */
export interface InferredSpeaker {
  speakerId: string;
  /** Winner's share of labeled word duration in [0, 1]. */
  confidence: number;
}

/**
 * One editable subtitle. Maps 1:1 to a row in the delivery CSV.
 * A cue with multiple segments represents a shot change mid-subtitle; on export
 * the segment texts join with " / " and their shots join with " / ".
 */
export interface Cue {
  id: string;
  /** File-relative seconds (inclusive); same axis as video playback. */
  start: number;
  /** File-relative seconds (exclusive); active-cue lookup uses [start, end). */
  end: number;
  /** Diarization label (e.g. SPEAKER_07) or a custom id; null = unassigned. */
  speakerId: string | null;
  segments: Segment[];
  /** Manually confirmed by the user (helps track editing progress). */
  reviewed?: boolean;
  /** Import-time diarization guess; confidence drives auto-assign at import. */
  inferredSpeaker?: InferredSpeaker | null;
  words?: Word[];
}

export interface Speaker {
  /** Stable id, usually the diarization label (SPEAKER_00). */
  id: string;
  /** Display name used as "Rolle" in the export (editable, e.g. "Mia"). */
  name: string;
  color: string;
}

export interface ShotType {
  /** Token written to the CSV "Info" column, e.g. ON / OFF / CONTRE. */
  id: ShotId;
  /** Human-readable label, e.g. "On-screen". */
  label: string;
}

/**
 * Timeline identity for the source video. Captured when the video is loaded in
 * the browser — whisperx JSON does not need to provide any of this.
 * `fileName` is a hint only; validation ignores it so renamed files still match.
 */
export interface VideoIdentity {
  fileName?: string;
  duration: number;
  frameRateNumerator?: number;
  frameRateDenominator?: number;
  /** Byte size hint for display; ignored when comparing video identity. */
  fileSize?: number;
  /** @deprecated Legacy sparse-hash identity — stripped on load and save. */
  fingerprint?: string;
  fingerprintVersion?: number;
}

export interface Project {
  /** Schema version; bump when the on-disk JSON shape changes (see {@link PROJECT_VERSION}). */
  version: number;
  /** Stable id assigned at creation; used for persisted version history. */
  id: string;
  /** User-visible project name (independent of the source video filename). */
  name: string;
  /** Source video filename hint (e.g. clip.mp4). */
  videoName: string;
  /** Timeline identity of the linked video (duration + probed frame rate). */
  video?: VideoIdentity;
  /** Frame rate for SMPTE labels and snapping edits; copied from `video` or default 25/1. */
  fpsNumerator: number;
  fpsDenominator: number;
  /** SMPTE at `referenceStartSeconds` (e.g. `00:00:00:00`, `01:00:00:00`). */
  startTimecode: string;
  /** File seconds where subtitle zero begins; leader before this is skipped on export. */
  referenceStartSeconds: number;
  defaultShot: ShotId;
  shots: ShotType[];
  speakers: Speaker[];
  cues: Cue[];
}

export const PROJECT_VERSION = 2;

export const DEFAULT_SHOTS: ShotType[] = [
  { id: "ON", label: "On-screen" },
  { id: "OFF", label: "Off-screen" },
  { id: "CONTRE", label: "Contre-champ" },
];

export const DEFAULT_START_TIMECODE = "00:00:00:00";
export const DEFAULT_FPS_NUMERATOR = 25;
export const DEFAULT_FPS_DENOMINATOR = 1;
