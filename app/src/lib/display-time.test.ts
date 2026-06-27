import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import {
  cueDisplayTimecode,
  playheadClockToFileSeconds,
  playheadDisplayClock,
  referenceSeconds,
} from "./display-time";

const project = {
  fps: 25,
  contentStartSeconds: 100,
} as Project;

describe("referenceSeconds", () => {
  it("returns file time in file mode", () => {
    expect(referenceSeconds(150, 100, "file")).toBe(150);
  });

  it("returns program time in program mode", () => {
    expect(referenceSeconds(150, 100, "program")).toBe(50);
  });

  it("clamps program time at zero", () => {
    expect(referenceSeconds(50, 100, "program")).toBe(0);
  });
});

describe("cueDisplayTimecode", () => {
  it("shows file time from zero in file mode", () => {
    expect(cueDisplayTimecode(101, project, "file")).toBe("00:01:41:00");
  });

  it("shows program time from zero in program mode", () => {
    expect(cueDisplayTimecode(101, project, "program")).toBe("00:00:01:00");
  });
});

describe("playheadDisplayClock", () => {
  it("round-trips through playheadClockToFileSeconds in program mode", () => {
    const clock = playheadDisplayClock(101, 100, "program");
    expect(clock).toBe("00:00:01.000");
    expect(playheadClockToFileSeconds(1, 100, "program")).toBe(101);
  });
});
