import { z } from "zod";
import { frameToSeconds, type FrameRate } from "./frame-time";
import { newProjectId, resolveProjectName } from "./project-meta";
import {
  DEFAULT_FPS_DENOMINATOR,
  DEFAULT_FPS_NUMERATOR,
  DEFAULT_SHOTS,
  DEFAULT_START_TIMECODE,
  PROJECT_VERSION,
  type Cue,
  type Project,
  type ShotType,
  type Speaker,
  type VideoIdentity,
  type Word,
} from "../types";

const uuidSchema = z.uuid();

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

function fpsFromRecord(data: Record<string, unknown>): FrameRate {
  const video = data.video;
  if (isRecord(video)) {
    const num = video.frameRateNumerator;
    const den = video.frameRateDenominator;
    if (
      typeof num === "number" &&
      typeof den === "number" &&
      num > 0 &&
      den > 0
    ) {
      return { numerator: num, denominator: den };
    }
  }
  if (typeof data.fpsNumerator === "number" && data.fpsNumerator > 0) {
    return {
      numerator: data.fpsNumerator,
      denominator:
        typeof data.fpsDenominator === "number" && data.fpsDenominator > 0
          ? data.fpsDenominator
          : 1,
    };
  }
  const fps = data.fps;
  if (typeof fps === "number" && fps > 0) {
    return { numerator: Math.round(fps), denominator: 1 };
  }
  return {
    numerator: DEFAULT_FPS_NUMERATOR,
    denominator: DEFAULT_FPS_DENOMINATOR,
  };
}

function resolveProjectId(data: Record<string, unknown>): string {
  const id = data.id;
  if (typeof id === "string" && uuidSchema.safeParse(id).success) return id;
  return newProjectId();
}

function secondsFromLegacyFrame(
  value: unknown,
  rate: FrameRate,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return frameToSeconds(Math.max(0, Math.round(value)), rate);
}

function repairWord(raw: unknown, rate: FrameRate): Word | null {
  if (!isRecord(raw) || typeof raw.word !== "string") return null;
  const start =
    typeof raw.start === "number"
      ? raw.start
      : secondsFromLegacyFrame(raw.startFrame, rate);
  const end =
    typeof raw.end === "number"
      ? raw.end
      : secondsFromLegacyFrame(raw.endFrame, rate);
  if (start === undefined || end === undefined) return null;
  return {
    word: raw.word,
    start,
    end,
    ...(typeof raw.speaker === "string" || raw.speaker === null
      ? { speaker: raw.speaker }
      : {}),
    ...(typeof raw.score === "number" ? { score: raw.score } : {}),
  };
}

function repairCue(raw: unknown, rate: FrameRate): Cue | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const start =
    typeof raw.start === "number"
      ? raw.start
      : secondsFromLegacyFrame(raw.startFrame, rate);
  const end =
    typeof raw.end === "number"
      ? raw.end
      : secondsFromLegacyFrame(raw.endFrame, rate);
  if (start === undefined || end === undefined || end <= start) return null;
  if (!Array.isArray(raw.segments) || raw.segments.length === 0) return null;

  const words = Array.isArray(raw.words)
    ? raw.words
        .map((w) => repairWord(w, rate))
        .filter((w): w is Word => w !== null)
    : undefined;

  return {
    id: raw.id,
    start,
    end,
    speakerId:
      typeof raw.speakerId === "string" || raw.speakerId === null
        ? raw.speakerId
        : null,
    segments: raw.segments as Cue["segments"],
    ...(typeof raw.reviewed === "boolean" ? { reviewed: raw.reviewed } : {}),
    ...(raw.inferredSpeaker !== undefined
      ? { inferredSpeaker: raw.inferredSpeaker as Cue["inferredSpeaker"] }
      : {}),
    ...(words && words.length > 0 ? { words } : {}),
  };
}

/**
 * True when JSON uses pre-v2 project timing fields (`fps` + `timecodeOffset`),
 * including hybrid saves that already copied some v2 field names.
 */
export function isV1ProjectData(data: unknown): boolean {
  if (!isRecord(data)) return false;
  const hasV1Timing =
    typeof data.fps === "number" && typeof data.timecodeOffset === "string";
  if (!hasV1Timing) return false;
  if (typeof data.referenceStartSeconds === "number") return false;
  return true;
}

/**
 * Upgrade v1 → v2 in memory. Cue/word timing is unchanged (already file seconds).
 */
export function migrateV1ToV2(data: Record<string, unknown>): Project {
  const videoName =
    typeof data.videoName === "string" ? data.videoName : "video.mp4";
  const rate = fpsFromRecord(data);

  const cues = Array.isArray(data.cues)
    ? data.cues
        .map((c) => repairCue(c, rate))
        .filter((c): c is Cue => c !== null)
    : [];

  return {
    version: PROJECT_VERSION,
    id: resolveProjectId(data),
    name: resolveProjectName(
      typeof data.name === "string" ? data.name : "",
      videoName,
    ),
    videoName,
    video: data.video as VideoIdentity | undefined,
    fpsNumerator: rate.numerator,
    fpsDenominator: rate.denominator,
    startTimecode:
      typeof data.timecodeOffset === "string"
        ? data.timecodeOffset
        : typeof data.startTimecode === "string"
          ? data.startTimecode
          : DEFAULT_START_TIMECODE,
    referenceStartSeconds:
      typeof data.contentStartSeconds === "number"
        ? Math.max(0, data.contentStartSeconds)
        : (secondsFromLegacyFrame(data.referenceFrame, rate) ?? 0),
    defaultShot:
      typeof data.defaultShot === "string"
        ? data.defaultShot
        : DEFAULT_SHOTS[0].id,
    shots: Array.isArray(data.shots)
      ? (data.shots as ShotType[])
      : DEFAULT_SHOTS,
    speakers: Array.isArray(data.speakers) ? (data.speakers as Speaker[]) : [],
    cues,
  };
}

function convertWordFrames(raw: unknown, rate: FrameRate): unknown {
  if (!isRecord(raw)) return raw;
  const out: Record<string, unknown> = { ...raw };
  if (typeof out.start !== "number" && typeof out.startFrame === "number") {
    out.start = secondsFromLegacyFrame(out.startFrame, rate);
  }
  if (typeof out.end !== "number" && typeof out.endFrame === "number") {
    out.end = secondsFromLegacyFrame(out.endFrame, rate);
  }
  return out;
}

function convertCueFrames(raw: unknown, rate: FrameRate): unknown {
  if (!isRecord(raw)) return raw;
  const out: Record<string, unknown> = { ...raw };
  if (typeof out.start !== "number" && typeof out.startFrame === "number") {
    out.start = secondsFromLegacyFrame(out.startFrame, rate);
  }
  if (typeof out.end !== "number" && typeof out.endFrame === "number") {
    out.end = secondsFromLegacyFrame(out.endFrame, rate);
  }
  if (Array.isArray(out.words)) {
    out.words = out.words.map((w) => convertWordFrames(w, rate));
  }
  return out;
}

/** True when JSON looks like a partial v2 save that still needs timing repair. */
export function needsProjectRepair(data: Record<string, unknown>): boolean {
  if (typeof data.referenceStartSeconds !== "number") return true;
  if (typeof data.referenceFrame === "number") return true;
  if (
    typeof data.timecodeOffset === "string" &&
    typeof data.startTimecode !== "string"
  ) {
    return true;
  }
  if (typeof data.fps === "number" && typeof data.fpsNumerator !== "number") {
    return true;
  }
  if (!Array.isArray(data.cues)) return false;
  return data.cues.some(
    (cue) =>
      isRecord(cue) &&
      ((typeof cue.startFrame === "number" && typeof cue.start !== "number") ||
        (typeof cue.endFrame === "number" && typeof cue.end !== "number")),
  );
}

/** Fill missing v2 timing fields on partial / in-progress saves. */
export function repairIncompleteProject(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const rate = fpsFromRecord(data);
  const out: Record<string, unknown> = { ...data };

  if (typeof out.fpsNumerator !== "number") {
    out.fpsNumerator = rate.numerator;
  }
  if (typeof out.fpsDenominator !== "number") {
    out.fpsDenominator = rate.denominator;
  }
  if (typeof out.startTimecode !== "string") {
    out.startTimecode =
      typeof out.timecodeOffset === "string"
        ? out.timecodeOffset
        : DEFAULT_START_TIMECODE;
  }
  if (typeof out.referenceStartSeconds !== "number") {
    if (typeof out.contentStartSeconds === "number") {
      out.referenceStartSeconds = Math.max(0, out.contentStartSeconds);
    } else if (typeof out.referenceFrame === "number") {
      out.referenceStartSeconds =
        secondsFromLegacyFrame(out.referenceFrame, rate) ?? 0;
    } else {
      out.referenceStartSeconds = 0;
    }
  }

  if (Array.isArray(out.cues)) {
    out.cues = out.cues.map((c) => convertCueFrames(c, rate));
  }

  return out;
}

/** Normalize legacy on-disk JSON before v2 schema validation. */
export function prepareProjectData(data: unknown): unknown {
  if (!isRecord(data)) return data;
  if (isV1ProjectData(data)) return migrateV1ToV2(data);
  if (needsProjectRepair(data)) return repairIncompleteProject(data);
  return data;
}
