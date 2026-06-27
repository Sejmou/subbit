import { describe, expect, it } from "vitest";
import {
  secondsToTimecode,
  timecodeToSeconds,
  frameDuration,
} from "./timecode";

const FPS = 25;
const OFFSET = "10:00:00:00";

describe("secondsToTimecode", () => {
  it("matches the delivery example (101.0s -> 10:01:41:00)", () => {
    expect(secondsToTimecode(101.0, FPS, OFFSET)).toBe("10:01:41:00");
  });

  it("converts fractional seconds to frames", () => {
    // 0.6s * 25fps = 15 frames
    expect(secondsToTimecode(0.6, FPS, "00:00:00:00")).toBe("00:00:00:15");
  });

  it("carries a rounded frame into the next second instead of FF === fps", () => {
    // 0.999s -> 24.975 frames -> rounds to 25 -> must become next second, FF 00
    expect(secondsToTimecode(0.999, FPS, "00:00:00:00")).toBe("00:00:01:00");
  });

  it("clamps negative times to zero", () => {
    expect(secondsToTimecode(-5, FPS, "00:00:00:00")).toBe("00:00:00:00");
  });
});

describe("timecodeToSeconds", () => {
  it("round-trips the offset", () => {
    expect(timecodeToSeconds(OFFSET, FPS)).toBe(36000);
  });

  it("inverts secondsToTimecode on frame boundaries", () => {
    const tc = secondsToTimecode(101.0, FPS, OFFSET);
    expect(timecodeToSeconds(tc, FPS)).toBeCloseTo(101.0 + 36000, 5);
  });

  it("throws on malformed input", () => {
    expect(() => timecodeToSeconds("00:00:00", FPS)).toThrow();
  });
});

describe("frameDuration", () => {
  it("is 40ms at 25fps", () => {
    expect(frameDuration(25)).toBeCloseTo(0.04, 10);
  });
});
