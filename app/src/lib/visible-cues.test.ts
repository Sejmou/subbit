import { describe, expect, it } from "vitest";
import {
  findCuesOverlappingRange,
  padViewRange,
  withPriorityCues,
} from "./visible-cues";
import { makeCue } from "../test-fixtures";

const cues = [
  makeCue({ id: "a", start: 0, end: 2, speakerId: null }, "a"),
  makeCue({ id: "b", start: 2, end: 5, speakerId: null }, "b"),
  makeCue({ id: "c", start: 10, end: 12, speakerId: null }, "c"),
];

describe("findCuesOverlappingRange", () => {
  it("returns cues overlapping the range", () => {
    expect(findCuesOverlappingRange(cues, 1, 3).map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
    expect(findCuesOverlappingRange(cues, 5, 10)).toEqual([]);
  });
});

describe("padViewRange", () => {
  it("adds padding proportional to span", () => {
    const { start, end } = padViewRange(10, 20);
    expect(start).toBe(5);
    expect(end).toBe(25);
  });
});

describe("withPriorityCues", () => {
  it("appends cues not already visible", () => {
    const visible = findCuesOverlappingRange(cues, 0, 1);
    const merged = withPriorityCues(visible, cues, ["c"]);
    expect(merged.map((c) => c.id)).toEqual(["a", "c"]);
  });
});
