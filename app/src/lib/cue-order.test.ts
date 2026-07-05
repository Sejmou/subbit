import { describe, expect, it } from "vitest";
import { makeCue, makeProject } from "../test-fixtures";
import { cuesByStartTime, normalizeCueOrder } from "./cue-order";
import { exportSrt } from "./export-srt";

describe("cuesByStartTime", () => {
  it("orders by start, then end", () => {
    const cues = [
      makeCue({ id: "b", start: 5, end: 7 }, "b"),
      makeCue({ id: "a", start: 1, end: 3 }, "a"),
      makeCue({ id: "a2", start: 1, end: 2 }, "a2"),
    ];
    expect(cuesByStartTime(cues).map((c) => c.id)).toEqual(["a2", "a", "b"]);
  });
});

describe("normalizeCueOrder", () => {
  it("orders lone cues by start", () => {
    const cues = [
      makeCue({ id: "b", start: 5, end: 7 }, "b"),
      makeCue({ id: "a", start: 1, end: 3 }, "a"),
    ];
    expect(normalizeCueOrder(cues).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps run members contiguous, ordering runs by their first start", () => {
    // A run [g1,g2] (g2 joined) sits after a lone cue that starts inside it.
    const cues = [
      makeCue({ id: "g1", start: 4, end: 6 }, "g1"),
      makeCue({ id: "g2", start: 6, end: 8, joinedToPrev: true }, "g2"),
      makeCue({ id: "lone", start: 5, end: 7 }, "lone"),
    ];
    const ids = normalizeCueOrder(cues).map((c) => c.id);
    // Run stays glued; the mid-span lone cue sorts after it (run-atomic).
    expect(ids).toEqual(["g1", "g2", "lone"]);
  });

  it("returns the same reference when already ordered", () => {
    const cues = [
      makeCue({ id: "a", start: 1, end: 3 }, "a"),
      makeCue({ id: "b", start: 5, end: 7 }, "b"),
    ];
    expect(normalizeCueOrder(cues)).toBe(cues);
  });
});

describe("subtitle export ordering", () => {
  it("emits SRT chronologically even when storage is out of start-order", () => {
    const project = makeProject({
      cues: [
        makeCue({ id: "late", start: 5, end: 7 }, "Later line"),
        makeCue({ id: "early", start: 1, end: 3 }, "Earlier line"),
      ],
    });
    const srt = exportSrt(project);
    expect(srt.indexOf("Earlier line")).toBeLessThan(srt.indexOf("Later line"));
    expect(srt.startsWith("1\n")).toBe(true);
  });
});
