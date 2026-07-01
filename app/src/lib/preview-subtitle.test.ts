import { describe, expect, it } from "vitest";
import { previewAtTime } from "./preview-subtitle";
import { activeShotRangeIndex } from "./segment-timing";
import type { Cue, Project } from "../types";
import { makeCue } from "../test-fixtures";

const baseProject = (cues: Cue[]): Project => ({
  version: 1,
  id: "00000000-0000-4000-8000-000000000001",
  name: "test",
  videoName: "test",
  fpsNumerator: 25,
  fpsDenominator: 1,
  startTimecode: "00:00:00:00",
  referenceStartSeconds: 0,
  defaultShot: "ON",
  shots: [
    { id: "ON", label: "On-screen" },
    { id: "OFF", label: "Off-screen" },
  ],
  speakers: [],
  cues,
});

describe("activeShotRangeIndex", () => {
  it("returns 0 for single-segment cues", () => {
    const cue = makeCue(
      { id: "a", start: 0, end: 4, speakerId: null },
      "hello",
    );
    expect(activeShotRangeIndex(cue, 2, baseProject([]))).toBe(0);
  });

  it("picks shot range by word timing", () => {
    const project = baseProject([]);
    const cue: Cue = {
      ...makeCue({ id: "a", start: 0, end: 10, speakerId: null }, ""),
      words: [
        { text: "aaaa", start: 0, end: 2 },
        { text: "bbbbbbbb", start: 2, end: 10 },
      ],
      shotRanges: [
        { fromWord: 0, toWord: 0, shot: "ON" },
        { fromWord: 1, toWord: 1, shot: "OFF" },
      ],
    };
    expect(activeShotRangeIndex(cue, 1, project)).toBe(0);
    expect(activeShotRangeIndex(cue, 8, project)).toBe(1);
  });
});

describe("previewAtTime", () => {
  it("returns active cue text at playhead", () => {
    const project = baseProject([
      makeCue({ id: "a", start: 0, end: 2, speakerId: null }, "one"),
      makeCue({ id: "b", start: 2, end: 5, speakerId: null }, "two"),
    ]);
    expect(previewAtTime(project, 1)).toEqual({ cueId: "a", text: "one" });
    expect(previewAtTime(project, 3)).toEqual({ cueId: "b", text: "two" });
    expect(previewAtTime(project, 10)).toBeNull();
  });

  it("returns null for empty segment text", () => {
    const project = baseProject([
      makeCue({ id: "a", start: 0, end: 2, speakerId: null }, ""),
    ]);
    expect(previewAtTime(project, 1)).toBeNull();
  });
});
