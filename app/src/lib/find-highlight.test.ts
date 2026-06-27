import { describe, expect, it } from "vitest";
import {
  buildHighlightChunks,
  indexMatchesBySegment,
  segmentMatchKey,
} from "./find-highlight";
import type { TextMatch } from "./find-replace";

describe("segmentMatchKey", () => {
  it("joins cue id and segment index", () => {
    expect(segmentMatchKey("c1", 2)).toBe("c1:2");
  });
});

describe("indexMatchesBySegment", () => {
  it("groups matches by cue segment", () => {
    const matches: TextMatch[] = [
      { cueId: "a", segIndex: 0, start: 0, end: 2 },
      { cueId: "a", segIndex: 0, start: 6, end: 8 },
      { cueId: "a", segIndex: 1, start: 0, end: 2 },
    ];
    const map = indexMatchesBySegment(matches);
    expect(map.get("a:0")).toHaveLength(2);
    expect(map.get("a:1")).toHaveLength(1);
  });
});

describe("buildHighlightChunks", () => {
  it("returns plain text when there are no ranges", () => {
    expect(buildHighlightChunks("hello", [], null)).toEqual([
      { text: "hello", kind: "plain" },
    ]);
  });

  it("marks all ranges and highlights the current one", () => {
    expect(
      buildHighlightChunks(
        "say hello to hello",
        [
          { start: 4, end: 9 },
          { start: 13, end: 18 },
        ],
        { start: 13, end: 18 },
      ),
    ).toEqual([
      { text: "say ", kind: "plain" },
      { text: "hello", kind: "match" },
      { text: " to ", kind: "plain" },
      { text: "hello", kind: "current" },
    ]);
  });
});
