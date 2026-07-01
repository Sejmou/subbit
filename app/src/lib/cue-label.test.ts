import { describe, expect, it } from "vitest";
import { cueLabelText, cueLabelTextShort } from "./cue-label";
import { makeCue } from "../test-fixtures";

describe("cueLabelText", () => {
  it("joins segment text", () => {
    expect(
      cueLabelText(
        makeCue({ id: "1", start: 0, end: 1, speakerId: null }, "Hello world"),
      ),
    ).toBe("Hello world");
  });
});

describe("cueLabelTextShort", () => {
  it("truncates long labels", () => {
    const long = "a".repeat(100);
    const cue = makeCue({ id: "1", start: 0, end: 1, speakerId: null }, long);
    expect(cueLabelTextShort(cue, 20)).toHaveLength(20);
    expect(cueLabelTextShort(cue, 20).endsWith("…")).toBe(true);
  });
});
