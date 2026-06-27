import { describe, expect, it } from "vitest";
import { previewAtTime } from "./preview-subtitle";
import { activeSegmentIndex } from "./segment-timing";
import type { Cue, Project } from "../types";
import {
  DEFAULT_SHOTS,
  DEFAULT_TIMECODE_OFFSET,
  DEFAULT_FPS,
  PROJECT_VERSION,
} from "../types";

const baseProject = (cues: Cue[]): Project => ({
  version: PROJECT_VERSION,
  id: "00000000-0000-4000-8000-000000000001",
  name: "test",
  videoName: "test",
  fps: DEFAULT_FPS,
  timecodeOffset: DEFAULT_TIMECODE_OFFSET,
  defaultShot: "ON",
  shots: DEFAULT_SHOTS,
  speakers: [],
  cues,
});

describe("activeSegmentIndex", () => {
  it("returns 0 for single-segment cues", () => {
    const cue: Cue = {
      id: "a",
      start: 0,
      end: 4,
      speakerId: null,
      segments: [{ text: "hello", shot: "ON" }],
    };
    expect(activeSegmentIndex(cue, 2)).toBe(0);
  });

  it("picks segment by proportional timing when words are absent", () => {
    const cue: Cue = {
      id: "a",
      start: 0,
      end: 10,
      speakerId: null,
      segments: [
        { text: "aaaa", shot: "ON" },
        { text: "bbbbbbbb", shot: "OFF" },
      ],
    };
    expect(activeSegmentIndex(cue, 2)).toBe(0);
    expect(activeSegmentIndex(cue, 8)).toBe(1);
  });
});

describe("previewAtTime", () => {
  it("returns active cue text at playhead", () => {
    const project = baseProject([
      {
        id: "a",
        start: 0,
        end: 2,
        speakerId: null,
        segments: [{ text: "one", shot: "ON" }],
      },
      {
        id: "b",
        start: 2,
        end: 5,
        speakerId: null,
        segments: [{ text: "two", shot: "ON" }],
      },
    ]);
    expect(previewAtTime(project, 1)).toEqual({ cueId: "a", text: "one" });
    expect(previewAtTime(project, 3)).toEqual({ cueId: "b", text: "two" });
    expect(previewAtTime(project, 10)).toBeNull();
  });

  it("returns null for empty segment text", () => {
    const project = baseProject([
      {
        id: "a",
        start: 0,
        end: 2,
        speakerId: null,
        segments: [{ text: "   ", shot: "ON" }],
      },
    ]);
    expect(previewAtTime(project, 1)).toBeNull();
  });
});
