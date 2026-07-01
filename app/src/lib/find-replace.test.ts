import { describe, expect, it } from "vitest";
import type { Cue } from "../types";
import {
  buildReplaceAllUpdates,
  filterReplaceableMatches,
  findTextMatches,
  replaceMatchInText,
  replaceMatchesInText,
} from "./find-replace";
import { makeCue } from "../test-fixtures";

const cues: Cue[] = [
  makeCue({ id: "a", start: 0, end: 1, speakerId: null }, "hello hello"),
  {
    ...makeCue({ id: "b", start: 1, end: 2, speakerId: null }, ""),
    words: [
      { text: "Hello", start: 1, end: 1.5 },
      { text: "world", start: 1.5, end: 2 },
    ],
    shotRanges: [
      { fromWord: 0, toWord: 0, shot: "ON" },
      { fromWord: 1, toWord: 1, shot: "OFF" },
    ],
  },
];

describe("findTextMatches", () => {
  it("finds all literal matches across segments", () => {
    expect(findTextMatches(cues, "hello")).toEqual([
      { cueId: "a", segIndex: 0, start: 0, end: 5 },
      { cueId: "a", segIndex: 0, start: 6, end: 11 },
      { cueId: "b", segIndex: 0, start: 0, end: 5 },
    ]);
  });

  it("supports case-sensitive search", () => {
    expect(findTextMatches(cues, "Hello", { caseSensitive: true })).toEqual([
      { cueId: "b", segIndex: 0, start: 0, end: 5 },
    ]);
  });

  it("returns nothing for an empty query", () => {
    expect(findTextMatches(cues, "")).toEqual([]);
  });
});

describe("replace helpers", () => {
  it("replaces a single match", () => {
    const match = { start: 6, end: 11 };
    expect(replaceMatchInText("hello hello", match, "there")).toBe(
      "hello there",
    );
  });

  it("replaces many matches in one segment", () => {
    const matches = [
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ];
    expect(replaceMatchesInText("hello hello", matches, "x")).toBe("x x");
  });

  it("builds replace-all updates grouped by segment", () => {
    const matches = findTextMatches(cues, "hello");
    expect(buildReplaceAllUpdates(cues, matches, "hi")).toEqual([
      { cueId: "a", segIndex: 0, text: "hi hi" },
      { cueId: "b", segIndex: 0, text: "hi" },
    ]);
  });
});

describe("filterReplaceableMatches", () => {
  it("drops matches in reviewed locked cues", () => {
    const locked = { ...cues[1], reviewed: true };
    const all = findTextMatches(cues, "hello");
    const filtered = filterReplaceableMatches(all, [cues[0], locked]);
    expect(filtered.every((m) => m.cueId !== "b")).toBe(true);
    expect(filtered.length).toBeLessThan(all.length);
  });
});
