import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import {
  cueDisplayTimecode,
  cueTimecodeToFileSeconds,
  playheadDisplayTimecode,
  playheadTimecodeToFileSeconds,
} from "./display-time";

const project: Project = {
  version: 2,
  id: "00000000-0000-4000-8000-000000000001",
  name: "test",
  videoName: "test.mp4",
  fpsNumerator: 25,
  fpsDenominator: 1,
  startTimecode: "00:00:00:00",
  referenceStartSeconds: 100,
  defaultShot: "ON",
  shots: [{ id: "ON", label: "On-screen" }],
  speakers: [],
  cues: [],
};

describe("cueDisplayTimecode", () => {
  it("shows subtitle SMPTE from reference frame", () => {
    expect(cueDisplayTimecode(101, project)).toBe("00:00:01:00");
  });

  it("shows subtitle zero before reference", () => {
    expect(cueDisplayTimecode(50, project)).toBe("00:00:00:00");
  });
});

describe("cueTimecodeToFileSeconds", () => {
  it("round-trips cue timecodes", () => {
    const tc = cueDisplayTimecode(101, project);
    expect(cueTimecodeToFileSeconds(tc, project)).toBeCloseTo(101, 4);
  });
});

describe("playheadDisplayTimecode", () => {
  it("round-trips through playheadTimecodeToFileSeconds", () => {
    const tc = playheadDisplayTimecode(101, project);
    expect(tc).toBe("00:00:01:00");
    expect(playheadTimecodeToFileSeconds(tc, project)).toBeCloseTo(101, 4);
  });
});
