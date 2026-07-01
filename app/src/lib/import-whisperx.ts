import { z } from "zod";
import {
  inferSpeakerFromWords,
  resolveSpeakerFromInference,
} from "./infer-speaker";
import {
  DEFAULT_FPS_DENOMINATOR,
  DEFAULT_FPS_NUMERATOR,
  DEFAULT_SHOTS,
  DEFAULT_START_TIMECODE,
  PROJECT_VERSION,
  type Cue,
  type Project,
  type Speaker,
  type Word,
} from "../types";
import { newProjectId, resolveProjectName } from "./project-meta";
import { singleShotRange } from "./word-model/render";
import { tokenize } from "./word-model/tokenize";
import { respreadCharacterWeighted } from "./word-model/timing";

const whisperxWordSchema = z.object({
  word: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  score: z.number().optional(),
  speaker: z.string().nullable().optional(),
});

const whisperxSegmentSchema = z
  .object({
    start: z.number(),
    end: z.number(),
    text: z.string(),
    speaker: z.string().nullable().optional(),
    words: z.array(whisperxWordSchema).optional(),
  })
  .passthrough();

export const whisperxSchema = z
  .object({
    segments: z.array(whisperxSegmentSchema),
    language: z.string().optional(),
  })
  .passthrough();

/** Shape of the whisperx `audio.json` output we care about. */
export type WhisperxWord = z.infer<typeof whisperxWordSchema>;
export type WhisperxSegment = z.infer<typeof whisperxSegmentSchema>;
export type WhisperxJson = z.infer<typeof whisperxSchema>;

function formatWhisperxValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `Not a valid whisperx file. ${path}${issue.message}`;
}

const SPEAKER_PALETTE = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#46f0f0",
  "#f032e6",
  "#bcf60c",
  "#fabebe",
  "#008080",
  "#9a6324",
  "#fffac8",
  "#800000",
  "#aaffc3",
  "#808000",
  "#ffd8b1",
  "#000075",
  "#a9a9a9",
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function wordsFromWhisperxSegment(seg: WhisperxSegment): Word[] {
  if (seg.words && seg.words.length > 0) {
    return seg.words.map((w) => ({
      text: w.word,
      start: w.start ?? seg.start,
      end: w.end ?? seg.end,
      speaker: w.speaker ?? null,
      score: w.score,
    }));
  }
  const tokens = tokenize(seg.text);
  if (tokens.length === 0) return [];
  return respreadCharacterWeighted(
    tokens.map((text) => ({ text, start: seg.start, end: seg.end })),
    seg.start,
    seg.end,
  );
}

/**
 * Build a fresh Project from whisperx JSON.
 * Each whisperx segment becomes one cue with words and a single default shot range.
 */
export function importWhisperx(json: WhisperxJson, videoName: string): Project {
  const segments = json.segments ?? [];
  const defaultShot = DEFAULT_SHOTS[0].id;

  const cues: Cue[] = segments.map((seg) => {
    const words = wordsFromWhisperxSegment(seg);

    const { speakerId, inferredSpeaker } = resolveSpeakerFromInference(
      inferSpeakerFromWords(words, seg.speaker ?? null),
    );

    return {
      id: newId(),
      start: seg.start,
      end: seg.end,
      speakerId,
      inferredSpeaker,
      words,
      lineBreakAfterWordIndices: [],
      shotRanges:
        words.length > 0 ? singleShotRange(words.length, defaultShot) : [],
      reviewed: false,
    };
  });

  const speakers = buildSpeakers(segments);

  return {
    version: PROJECT_VERSION,
    id: newProjectId(),
    name: resolveProjectName("", videoName),
    videoName,
    fpsNumerator: DEFAULT_FPS_NUMERATOR,
    fpsDenominator: DEFAULT_FPS_DENOMINATOR,
    startTimecode: DEFAULT_START_TIMECODE,
    referenceStartSeconds: 0,
    defaultShot,
    shots: DEFAULT_SHOTS,
    speakers,
    cues,
  };
}

/** Distinct diarization labels become speakers, sorted, with a stable color. */
function buildSpeakers(segments: WhisperxSegment[]): Speaker[] {
  const labels = new Set<string>();
  for (const seg of segments) {
    if (seg.speaker) labels.add(seg.speaker);
    for (const w of seg.words ?? []) if (w.speaker) labels.add(w.speaker);
  }
  return [...labels].sort().map((id, i) => ({
    id,
    name: id,
    color: SPEAKER_PALETTE[i % SPEAKER_PALETTE.length],
  }));
}

/** Validate parsed JSON as whisperx output. */
export function parseWhisperxData(data: unknown): WhisperxJson {
  const result = whisperxSchema.safeParse(data);
  if (!result.success)
    throw new Error(formatWhisperxValidationError(result.error));
  return result.data;
}

/** Parse + validate a JSON string as whisperx output. */
export function parseWhisperxJson(text: string): WhisperxJson {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "Could not parse file as JSON. Select a whisperx audio.json or a saved .subbit.json project file.",
    );
  }
  return parseWhisperxData(data);
}
