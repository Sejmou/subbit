import { describe, expect, it } from "vitest";
import { findActiveCueId, findActiveCueIndex } from "./active-cue";
import { makeCue } from "../test-fixtures";

const cues = [
  makeCue({ id: "a", start: 0, end: 2, speakerId: null }, "one"),
  makeCue({ id: "b", start: 2, end: 5, speakerId: null }, "two"),
];

describe("findActiveCueIndex", () => {
  it("finds cue containing time", () => {
    expect(findActiveCueIndex(cues, 1)).toBe(0);
    expect(findActiveCueIndex(cues, 2)).toBe(1);
    expect(findActiveCueIndex(cues, 10)).toBe(-1);
  });
});

describe("findActiveCueId", () => {
  it("returns cue id or null", () => {
    expect(findActiveCueId(cues, 1)).toBe("a");
    expect(findActiveCueId(cues, 10)).toBeNull();
  });
});
