import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import {
  fileSecondsToSubtitleTimecode,
  frameToSeconds,
  nominalTimecodeFps,
  secondsToFrame,
  subtitleTimecodeToFileSeconds,
} from "./frame-time";

const baseProject = (): Project => ({
  version: 2,
  id: "00000000-0000-4000-8000-000000000001",
  name: "test",
  videoName: "test.mp4",
  fpsNumerator: 25,
  fpsDenominator: 1,
  startTimecode: "00:00:00:00",
  referenceStartSeconds: 0,
  defaultShot: "ON",
  shots: [{ id: "ON", label: "On-screen" }],
  speakers: [],
  cues: [],
});

describe("nominalTimecodeFps", () => {
  it("rounds 24000/1001 to 24", () => {
    expect(nominalTimecodeFps({ numerator: 24000, denominator: 1001 })).toBe(
      24,
    );
  });
});

describe("secondsToFrame / frameToSeconds", () => {
  it("round-trips at 25 fps", () => {
    const rate = { numerator: 25, denominator: 1 };
    expect(secondsToFrame(1, rate)).toBe(25);
    expect(frameToSeconds(25, rate)).toBe(1);
  });

  it("round-trips at 24000/1001", () => {
    const rate = { numerator: 24000, denominator: 1001 };
    const frame = secondsToFrame(1, rate);
    expect(frame).toBe(24);
    expect(frameToSeconds(frame, rate)).toBeCloseTo(1.001, 3);
  });
});

describe("subtitle timecode", () => {
  it("shows start timecode at reference start", () => {
    const project = {
      ...baseProject(),
      startTimecode: "01:00:00:00",
      referenceStartSeconds: 4,
    };
    expect(fileSecondsToSubtitleTimecode(4, project)).toBe("01:00:00:00");
    expect(fileSecondsToSubtitleTimecode(5, project)).toBe("01:00:01:00");
  });

  it("round-trips playhead timecode with US start offset", () => {
    const project = {
      ...baseProject(),
      startTimecode: "01:00:00:00",
      referenceStartSeconds: 2,
    };
    const tc = "01:00:05:12";
    expect(subtitleTimecodeToFileSeconds(tc, project)).toBeCloseTo(
      2 + 137 / 25,
      4,
    );
  });
});
