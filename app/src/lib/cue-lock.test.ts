import { beforeEach, describe, expect, it } from "vitest";
import { writeLockReviewedCues } from "./lock-reviewed-settings";
import { isReviewedCueLocked } from "./cue-lock";
import { useLockReviewedStore } from "../store/lock-reviewed";
import { makeCue } from "../test-fixtures";

const cue = (reviewed: boolean) =>
  makeCue({ id: "c1", start: 0, end: 1, speakerId: null, reviewed }, "hi");

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
