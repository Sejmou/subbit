import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATES,
  clampPlaybackRate,
  formatPlaybackRate,
  stepPlaybackRate,
} from "./playback-rate";

describe("playback-rate", () => {
  it("formats common presets", () => {
    expect(formatPlaybackRate(1)).toBe("1×");
    expect(formatPlaybackRate(0.5)).toBe("0.5×");
    expect(formatPlaybackRate(1.25)).toBe("1.25×");
    expect(formatPlaybackRate(2)).toBe("2×");
  });

  it("steps through presets at the ends", () => {
    expect(stepPlaybackRate(DEFAULT_PLAYBACK_RATE, -1)).toBe(0.75);
    expect(stepPlaybackRate(DEFAULT_PLAYBACK_RATE, 1)).toBe(1.25);
    expect(stepPlaybackRate(PLAYBACK_RATES[0], -1)).toBe(PLAYBACK_RATES[0]);
    expect(stepPlaybackRate(PLAYBACK_RATES.at(-1)!, 1)).toBe(
      PLAYBACK_RATES.at(-1)!,
    );
  });

  it("clamps unknown values to 1×", () => {
    expect(clampPlaybackRate(1.1)).toBe(1);
  });
});
