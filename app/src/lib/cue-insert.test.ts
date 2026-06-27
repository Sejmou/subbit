import { describe, expect, it } from "vitest";
import type { Cue } from "../types";
import {
  TIMELINE_NEW_CUE_DURATION,
  computeInsertCueRange,
  findInsertCueIndex,
} from "./cue-insert";

const cues: Cue[] = [
  {
    id: "a",
    start: 0,
    end: 2,
    speakerId: null,
    segments: [{ text: "a", shot: "ON" }],
  },
  {
    id: "b",
    start: 5,
    end: 7,
    speakerId: null,
    segments: [{ text: "b", shot: "ON" }],
  },
];

describe("computeInsertCueRange", () => {
  it("creates a 1.5s cue in a gap", () => {
    const range = computeInsertCueRange(cues, 2, TIMELINE_NEW_CUE_DURATION);
    expect(range).toEqual({ start: 2, end: 3.5 });
  });

  it("shortens the cue when the next section is closer than the default duration", () => {
    const range = computeInsertCueRange(cues, 4, TIMELINE_NEW_CUE_DURATION);
    expect(range).toEqual({ start: 4, end: 5 });
  });

  it("rejects clicks inside an existing section", () => {
    expect(
      computeInsertCueRange(cues, 1, TIMELINE_NEW_CUE_DURATION),
    ).toBeNull();
    expect(
      computeInsertCueRange(cues, 5, TIMELINE_NEW_CUE_DURATION),
    ).toBeNull();
  });

  it("rejects when the remaining gap is too small", () => {
    const tight: Cue[] = [
      {
        id: "a",
        start: 0,
        end: 1,
        speakerId: null,
        segments: [{ text: "a", shot: "ON" }],
      },
      {
        id: "b",
        start: 1.0005,
        end: 2,
        speakerId: null,
        segments: [{ text: "b", shot: "ON" }],
      },
    ];
    expect(
      computeInsertCueRange(tight, 1, TIMELINE_NEW_CUE_DURATION),
    ).toBeNull();
  });

  it("caps at the movie duration", () => {
    const range = computeInsertCueRange(cues, 9, TIMELINE_NEW_CUE_DURATION, 10);
    expect(range).toEqual({ start: 9, end: 10 });
  });
});

describe("findInsertCueIndex", () => {
  it("inserts before the first cue that starts at or after the new start", () => {
    expect(findInsertCueIndex(cues, 2)).toBe(1);
    expect(findInsertCueIndex(cues, 6)).toBe(2);
    expect(findInsertCueIndex(cues, 8)).toBe(2);
  });
});
