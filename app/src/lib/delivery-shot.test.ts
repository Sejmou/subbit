import { describe, expect, it } from "vitest";
import { DEFAULT_SHOTS } from "../types";
import {
  ensureShotTypes,
  isDefaultShotId,
  resolveShotLabel,
  syncShotTypesFromCues,
} from "./delivery-shot";
import { makeCue, makeProject } from "../test-fixtures";

describe("resolveShotLabel", () => {
  const shots = DEFAULT_SHOTS;

  it("maps known ids case-insensitively", () => {
    expect(resolveShotLabel("on", shots, "ON")).toBe("ON");
    expect(resolveShotLabel("OFF", shots, "ON")).toBe("OFF");
  });

  it("maps human-readable labels to ids", () => {
    expect(resolveShotLabel("On-screen", shots, "ON")).toBe("ON");
    expect(resolveShotLabel("contre-champ", shots, "ON")).toBe("CONTRE");
  });

  it("returns trimmed raw text for unknown labels", () => {
    expect(resolveShotLabel(" VO ", shots, "ON")).toBe("VO");
  });

  it("falls back to defaultShot for empty input", () => {
    expect(resolveShotLabel("", shots, "ON")).toBe("ON");
    expect(resolveShotLabel("   ", shots, "OFF")).toBe("OFF");
  });
});

describe("ensureShotTypes", () => {
  it("adds unknown shot tokens to the project", () => {
    const project = makeProject();
    const { project: next, addedShots } = ensureShotTypes(project, [
      "VO",
      "ON",
    ]);
    expect(addedShots).toEqual([{ id: "VO", label: "VO" }]);
    expect(next.shots.map((s) => s.id)).toContain("VO");
    expect(next.shots).toHaveLength(4);
  });

  it("does not duplicate built-in or custom shots", () => {
    const project = makeProject({
      shots: [...DEFAULT_SHOTS, { id: "VO", label: "Voice-over" }],
    });
    const { addedShots } = ensureShotTypes(project, [
      "On-screen",
      "VO",
      "Voice-over",
    ]);
    expect(addedShots).toEqual([]);
  });
});

describe("isDefaultShotId", () => {
  it("recognizes built-in shot ids only", () => {
    expect(isDefaultShotId("ON")).toBe(true);
    expect(isDefaultShotId("off")).toBe(true);
    expect(isDefaultShotId("VO")).toBe(false);
  });
});

describe("syncShotTypesFromCues", () => {
  it("adds shot types referenced by cues", () => {
    const project = makeProject({
      cues: [makeCue({ id: "c1", start: 0, end: 1 }, "hello", "VO")],
    });
    const synced = syncShotTypesFromCues(project);
    expect(synced.shots.map((s) => s.id)).toContain("VO");
  });
});
