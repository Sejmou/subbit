import { describe, expect, it } from "vitest";
import { makeCue } from "../../test-fixtures";
import { setShotRangeText } from "./cue-ops";
import { cueDisplayText, shotRangeText } from "./render";
import { parseEditableText } from "./tokenize";

describe("parseEditableText", () => {
  it("derives a break after the last word on each line", () => {
    expect(parseEditableText("hello world\nfoo")).toEqual({
      tokens: ["hello", "world", "foo"],
      lineBreakAfterWordIndices: [1],
    });
  });

  it("returns no breaks for single-line text", () => {
    expect(parseEditableText("hello world")).toEqual({
      tokens: ["hello", "world"],
      lineBreakAfterWordIndices: [],
    });
  });
});

describe("setShotRangeText", () => {
  it("preserves line breaks typed in the editor", () => {
    const cue = makeCue({ id: "c1", start: 0, end: 2 }, "hello world");
    const next = setShotRangeText(cue, 0, "hello\nworld", "ON");

    expect(shotRangeText(next, next.shotRanges[0])).toBe("hello\nworld");
    expect(cueDisplayText(next)).toBe("hello\nworld");
    expect(next.lineBreakAfterWordIndices).toEqual([0]);
  });

  it("removes a line break when the user joins lines", () => {
    const cue = {
      ...makeCue({ id: "c1", start: 0, end: 2 }, "hello world"),
      lineBreakAfterWordIndices: [0],
    };
    const next = setShotRangeText(cue, 0, "hello world", "ON");

    expect(shotRangeText(next, next.shotRanges[0])).toBe("hello world");
    expect(next.lineBreakAfterWordIndices).toEqual([]);
  });
});
