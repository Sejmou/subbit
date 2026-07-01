import { describe, expect, it } from "vitest";
import { makeCue } from "../../test-fixtures";
import {
  detectCueValidationIssues,
  SUPPRESSED_VALIDATION_ISSUES,
  validateCue,
} from "./validation";

describe("validateCue readability", () => {
  it("does not flag cues when the whole display window is long enough", () => {
    const cue = makeCue({ id: "c1", start: 0, end: 2 }, "hello world");
    expect(validateCue(cue).some((i) => i.kind === "cue_cps_high")).toBe(false);
  });

  it("flags when text exceeds comfortable CPS for the cue duration", () => {
    const cue = makeCue(
      { id: "c1", start: 0, end: 0.5 },
      "this is a lot of subtitle text",
    );
    expect(validateCue(cue)).toEqual([
      expect.objectContaining({ kind: "cue_cps_high" }),
    ]);
  });

  it("does not flag tight per-word timings when the cue window is ample", () => {
    const cue = {
      ...makeCue({ id: "c1", start: 0, end: 3 }, "one two three"),
      words: [
        { text: "one", start: 0, end: 0.05 },
        { text: "two", start: 0.05, end: 0.1 },
        { text: "three", start: 0.1, end: 0.15 },
      ],
    };
    expect(validateCue(cue)).toEqual([]);
  });
});

describe("SUPPRESSED_VALIDATION_ISSUES", () => {
  it("still detects overlapping word timings", () => {
    const cue = {
      ...makeCue({ id: "c1", start: 0, end: 3 }, "one two"),
      words: [
        { text: "one", start: 0, end: 1.5 },
        { text: "two", start: 0.5, end: 1 },
      ],
    };
    expect(detectCueValidationIssues(cue)).toEqual([
      expect.objectContaining({ kind: "word_overlap", wordIndex: 1 }),
    ]);
  });

  it("hides suppressed kinds from validateCue (UI)", () => {
    const cue = {
      ...makeCue({ id: "c1", start: 0, end: 3 }, "one two"),
      words: [
        { text: "one", start: 0, end: 1.5 },
        { text: "two", start: 0.5, end: 1 },
      ],
    };
    expect(SUPPRESSED_VALIDATION_ISSUES.has("word_overlap")).toBe(true);
    expect(validateCue(cue)).toEqual([]);
  });
});
