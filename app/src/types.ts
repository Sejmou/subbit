/**
 * Core domain model for Subbit (schema version 2).
 *
 * Cues are word lists with timed tokens, a single shot, and optional line breaks.
 * Consecutive cues may be linked together into a 'group'/'run' by setting {@link Cue.joinedToPrev} to true on each subsequent cue
 * (in which case the previous cue's end time is used as the start time for the next cue; the two values should be equal!).
 *
 * Display text and exports are derived from words — see `lib/word-model`.
 */

export type ShotId = string;

/** Timed token within a cue. */
export interface Word {
  text: string;
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
 * One editable subtitle. A single cue maps to one CSV " / " slice; a run of
 * cues linked by {@link Cue.joinedToPrev} maps to one delivery-sheet row.
 * Text is derived from {@link Word} tokens.
 */
export interface Cue {
  id: string;
  /** File-relative seconds (inclusive); same axis as video playback. */
  start: number;
  /** File-relative seconds (exclusive); active-cue lookup uses [start, end). */
  end: number;
  /** Diarization label (e.g. SPEAKER_07) or a custom id; null = unassigned. */
  speakerId: string | null;
  words: Word[];
  lineBreakAfterWordIndices: number[];
  /** Shot type for this cue (CSV "Info" slice). */
  shot: ShotId;
  /**
   * True when this cue is an internal cut of the same spoken sequence as the
   * immediately preceding cue (a delivery-sheet " / " boundary). Cues in such a
   * run abut in time (`prev.end === this.start`) and export to one row.
   */
  joinedToPrev?: boolean;
  /** Manually confirmed by the user (helps track editing progress). */
  reviewed?: boolean;
  /** Import-time diarization guess; confidence drives auto-assign at import. */
  inferredSpeaker?: InferredSpeaker | null;
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
  /** Legacy sparse-hash fields; ignored on load and when comparing identity. */
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
