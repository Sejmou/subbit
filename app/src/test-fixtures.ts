import {
  DEFAULT_FPS_DENOMINATOR,
  DEFAULT_FPS_NUMERATOR,
  DEFAULT_SHOTS,
  DEFAULT_START_TIMECODE,
  PROJECT_VERSION,
  type Cue,
  type Project,
  type ShotId,
} from "./types";
import {
  effectiveShotRanges,
  shotRangeText,
  singleShotRange,
} from "./lib/word-model/render";
import { respreadCharacterWeighted } from "./lib/word-model/timing";
import { tokenize } from "./lib/word-model/tokenize";

let fixtureCueCounter = 0;

/** Build a cue with words derived from plain text (one default shot range). */
export function makeCue(
  partial: Partial<Cue> & Pick<Cue, "id" | "start" | "end">,
  text = "hello",
  shot: ShotId = "ON",
): Cue {
  const tokens = tokenize(text);
  const words =
    tokens.length > 0
      ? respreadCharacterWeighted(
          tokens.map((t) => ({
            text: t,
            start: partial.start,
            end: partial.end,
          })),
          partial.start,
          partial.end,
        )
      : [];
  const shotRanges =
    words.length > 0
      ? singleShotRange(words.length, shot)
      : [{ fromWord: 0, toWord: 0, shot }];
  return {
    speakerId: null,
    lineBreakAfterWordIndices: [],
    reviewed: false,
    ...partial,
    words,
    shotRanges: partial.shotRanges ?? shotRanges,
  };
}

export function cueShotText(
  cue: Cue,
  rangeIndex = 0,
  defaultShot: ShotId = "ON",
): string {
  const ranges = effectiveShotRanges(cue, defaultShot);
  return shotRangeText(cue, ranges[rangeIndex]);
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  fixtureCueCounter += 1;
  const id =
    overrides.id ??
    `00000000-0000-4000-8000-${String(fixtureCueCounter).padStart(12, "0")}`;
  return {
    version: PROJECT_VERSION,
    id,
    name: "clip",
    videoName: "clip.mp4",
    fpsNumerator: DEFAULT_FPS_NUMERATOR,
    fpsDenominator: DEFAULT_FPS_DENOMINATOR,
    startTimecode: DEFAULT_START_TIMECODE,
    referenceStartSeconds: 0,
    defaultShot: "ON",
    shots: DEFAULT_SHOTS,
    speakers: [{ id: "SPEAKER_00", name: "A", color: "#fff" }],
    cues: [
      makeCue({ id: "c1", start: 0, end: 2, speakerId: "SPEAKER_00" }, "hello"),
      makeCue({ id: "c2", start: 2, end: 4, speakerId: "SPEAKER_00" }, "world"),
    ],
    ...overrides,
  };
}
