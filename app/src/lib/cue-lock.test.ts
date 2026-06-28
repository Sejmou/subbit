import { beforeEach, describe, expect, it } from "vitest";
import type { Cue } from "../types";
import { writeLockReviewedCues } from "./lock-reviewed-settings";
import { isReviewedCueLocked } from "./cue-lock";
import { useLockReviewedStore } from "../store/lock-reviewed";

const cue = (reviewed: boolean): Cue => ({
  id: "c1",
  start: 0,
  end: 1,
  speakerId: null,
  segments: [{ text: "hi", shot: "ON" }],
  reviewed,
});

beforeEach(() => {
  writeLockReviewedCues(true);
  useLockReviewedStore.setState({ enabled: true });
});

describe("isReviewedCueLocked", () => {
  it("locks reviewed cues when mode is on", () => {
    expect(isReviewedCueLocked(cue(true))).toBe(true);
    expect(isReviewedCueLocked(cue(false))).toBe(false);
  });

  it("does not lock when mode is off", () => {
    useLockReviewedStore.getState().setEnabled(false);
    expect(isReviewedCueLocked(cue(true))).toBe(false);
  });
});
