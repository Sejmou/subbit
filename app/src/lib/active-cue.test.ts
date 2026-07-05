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

  it("works when the array is not sorted by start", () => {
    const unsorted = [
      makeCue({ id: "late", start: 5, end: 7, speakerId: null }, "late"),
      makeCue({ id: "early", start: 0, end: 2, speakerId: null }, "early"),
    ];
    expect(findActiveCueIndex(unsorted, 1)).toBe(1);
    expect(findActiveCueIndex(unsorted, 6)).toBe(0);
  });

  it("prefers the latest-starting cue when overlaps contain the time", () => {
    const overlapping = [
      makeCue({ id: "wide", start: 0, end: 10, speakerId: null }, "wide"),
      makeCue({ id: "inner", start: 4, end: 6, speakerId: null }, "inner"),
    ];
    // t is inside both; the one that started later wins.
    expect(findActiveCueIndex(overlapping, 5)).toBe(1);
    // Only the wide cue covers t=2.
    expect(findActiveCueIndex(overlapping, 2)).toBe(0);
  });
});

describe("findActiveCueId", () => {
  it("returns cue id or null", () => {
    expect(findActiveCueId(cues, 1)).toBe("a");
    expect(findActiveCueId(cues, 10)).toBeNull();
  });
});
