/**
 * Core domain model for Subbit.
 *
 * The "source of truth" while editing is a Project, which is a superset of the
 * whisperx output (we keep word-level timing so cues can be re-split losslessly).
 * The Project serializes to project.json and exports to .srt and the delivery CSV.
 */

export type ShotId = string;

/** A contiguous slice of a cue that shares a single shot type. */
export interface Segment {
  text: string;
  shot: ShotId;
  /** Set on the first segment absorbed by merge-with-next; enables unmerge at this seam. */
  mergedWithPrevious?: boolean;
  /** Speaker of the cue that was merged in (restored on unmerge). */
  mergedSpeakerId?: string | null;
}

/** Word-level timing carried over from whisperx, used for fast splitting. */
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
  start: number;
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
 * Timeline identity for the source video. Captured when the movie is loaded in
 * the browser — whisperx JSON does not need to provide any of this.
 * `fileName` is a hint only; validation ignores it so renamed files still match.
 */
export interface VideoIdentity {
  fileName?: string;
  duration: number;
  frameRateNumerator?: number;
  frameRateDenominator?: number;
  /** @deprecated Legacy sparse-hash identity — ignored on compare, stripped on save. */
  fileSize?: number;
  fingerprint?: string;
  fingerprintVersion?: number;
}

export interface Project {
  version: number;
  videoName: string;
  /** Timeline identity of the movie (duration + container frame rate). */
  video?: VideoIdentity;
  /** Frames per second for SMPTE timecode (movie.mp4 is 25). */
  fps: number;
  /** Broadcast start offset, SMPTE "HH:MM:SS:FF" (default 10:00:00:00). */
  timecodeOffset: string;
  /**
   * Seconds into the movie file where exported program time 0:00:00:00 begins
   * (skips leader/black/slate without re-encoding). Cue times stay in file time.
   */
  contentStartSeconds?: number;
  defaultShot: ShotId;
  shots: ShotType[];
  speakers: Speaker[];
  cues: Cue[];
}

export const PROJECT_VERSION = 1;

export const DEFAULT_SHOTS: ShotType[] = [
  { id: "ON", label: "On-screen" },
  { id: "OFF", label: "Off-screen" },
  { id: "CONTRE", label: "Contre-champ" },
];

export const DEFAULT_TIMECODE_OFFSET = "10:00:00:00";
export const DEFAULT_FPS = 25;
