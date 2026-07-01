import { describe, expect, it } from "vitest";
import {
  clampPlayheadTime,
  formatTimelineViewRange,
  frameDuration,
  parseClock,
  secondsToClock,
  secondsToTimecode,
  extractSmpteTimecode,
  timecodeToSeconds,
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

  it("extracts SMPTE from annotated delivery cells", () => {
    expect(timecodeToSeconds("10:02:29:18 (29:12)", FPS)).toBeCloseTo(
      timecodeToSeconds("10:02:29:18", FPS),
      5,
    );
  });
});

describe("extractSmpteTimecode", () => {
  it("returns the first HH:MM:SS:FF match", () => {
    expect(extractSmpteTimecode("10:02:29:18 (29:12)")).toBe("10:02:29:18");
  });

  it("returns undefined when no SMPTE pattern is present", () => {
    expect(extractSmpteTimecode("29:12")).toBeUndefined();
    expect(extractSmpteTimecode("")).toBeUndefined();
  });
});

describe("frameDuration", () => {
  it("is 40ms at 25fps", () => {
    expect(frameDuration(25)).toBeCloseTo(0.04, 10);
  });
});

describe("secondsToClock", () => {
  it("formats fractional seconds with milliseconds", () => {
    expect(secondsToClock(3661.5)).toBe("01:01:01.500");
  });
});

describe("parseClock", () => {
  it("parses HH:MM:SS.mmm", () => {
    expect(parseClock("01:01:01.500")).toBe(3661.5);
  });

  it("parses without fractional seconds", () => {
    expect(parseClock("00:00:05")).toBe(5);
  });

  it("pads short millisecond fields", () => {
    expect(parseClock("00:00:01.5")).toBe(1.5);
  });

  it("round-trips secondsToClock", () => {
    const clock = secondsToClock(123.456);
    expect(parseClock(clock)).toBeCloseTo(123.456, 3);
  });

  it("throws on malformed input", () => {
    expect(() => parseClock("00:00")).toThrow();
    expect(() => parseClock("00:61:00.000")).toThrow();
  });
});

describe("clampPlayheadTime", () => {
  it("clamps to duration", () => {
    expect(clampPlayheadTime(120, 100)).toBe(100);
  });

  it("clamps negative to zero", () => {
    expect(clampPlayheadTime(-1, 100)).toBe(0);
  });
});

describe("formatTimelineViewRange", () => {
  it("shows short clocks for wide views", () => {
    expect(formatTimelineViewRange(754, 910, 3600)).toBe(
      "00:12:34 – 00:15:10 / 01:00:00",
    );
  });

  it("shows milliseconds when zoomed in", () => {
    expect(formatTimelineViewRange(1.5, 4.25)).toBe(
      "00:00:01.500 – 00:00:04.250",
    );
  });
});
