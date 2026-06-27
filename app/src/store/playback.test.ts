import { describe, expect, it } from "vitest";
import { REACTION_DELAY_S, reactionAdjustedPlayhead } from "./playback";

describe("reactionAdjustedPlayhead", () => {
  it("subtracts the reaction delay while playing", () => {
    expect(reactionAdjustedPlayhead(10, true)).toBe(10 - REACTION_DELAY_S);
  });

  it("uses the raw playhead when paused", () => {
    expect(reactionAdjustedPlayhead(10, false)).toBe(10);
  });

  it("does not go below zero", () => {
    expect(reactionAdjustedPlayhead(0.2, true)).toBe(0);
  });
});
