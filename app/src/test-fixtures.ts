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
import { cueDisplayText } from "./lib/word-model/render";
import { respreadCharacterWeighted } from "./lib/word-model/timing";
import { tokenize } from "./lib/word-model/tokenize";

let fixtureCueCounter = 0;

/** Build a single-shot cue with words derived from plain text. */
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
  return {
    speakerId: null,
    lineBreakAfterWordIndices: [],
    reviewed: false,
    shot,
    ...partial,
    words,
  };
}

/** Full display text of a cue (helper for tests). */
export function cueShotText(cue: Cue): string {
  return cueDisplayText(cue);
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
