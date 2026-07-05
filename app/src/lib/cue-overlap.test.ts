import { describe, expect, it } from "vitest";
import { makeCue } from "../test-fixtures";
import { findOverlappingCueIds } from "./cue-overlap";

const cue = (id: string, start: number, end: number) =>
  makeCue({ id, start, end, speakerId: null }, id);

describe("findOverlappingCueIds", () => {
  it("returns an empty set when nothing overlaps", () => {
    const ids = findOverlappingCueIds([cue("a", 0, 1), cue("b", 1, 2)]);
    expect(ids.size).toBe(0);
  });

  it("flags both cues of an overlapping pair", () => {
    const ids = findOverlappingCueIds([cue("a", 0, 3), cue("b", 2, 5)]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("flags every cue in a triple overlap", () => {
    const ids = findOverlappingCueIds([
      cue("a", 0, 4),
      cue("b", 1, 5),
      cue("c", 2, 6),
    ]);
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });

  it("flags only the cues that actually overlap", () => {
    const ids = findOverlappingCueIds([
      cue("a", 0, 3),
      cue("b", 2, 5),
      cue("c", 10, 12),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("does not flag an abutting (joined) run", () => {
    const ids = findOverlappingCueIds([
      cue("a", 0, 2),
      cue("b", 2, 4),
      cue("c", 4, 6),
    ]);
    expect(ids.size).toBe(0);
  });

  it("ignores sub-epsilon float noise at a shared boundary", () => {
    const ids = findOverlappingCueIds([cue("a", 0, 2), cue("b", 2 - 1e-9, 4)]);
    expect(ids.size).toBe(0);
  });

  it("is insensitive to input ordering", () => {
    const ids = findOverlappingCueIds([cue("b", 2, 5), cue("a", 0, 3)]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});
