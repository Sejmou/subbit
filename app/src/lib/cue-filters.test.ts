import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  cueMatchesListFilters,
  cueMatchesReviewStatusFilter,
  hasActiveFilters,
} from "./cue-filters";
import { makeCue } from "../test-fixtures";

const cue = (reviewed: boolean) =>
  makeCue({ id: "c1", start: 0, end: 1, speakerId: "A", reviewed }, "x");

describe("cue filters", () => {
  it("filters by review status", () => {
    expect(cueMatchesReviewStatusFilter(cue(true), new Set())).toBe(true);
    expect(cueMatchesReviewStatusFilter(cue(false), new Set())).toBe(true);

    expect(cueMatchesReviewStatusFilter(cue(true), new Set(["reviewed"]))).toBe(
      true,
    );
    expect(
      cueMatchesReviewStatusFilter(cue(false), new Set(["reviewed"])),
    ).toBe(false);

    expect(
      cueMatchesReviewStatusFilter(cue(false), new Set(["not-reviewed"])),
    ).toBe(true);
    expect(
      cueMatchesReviewStatusFilter(cue(true), new Set(["not-reviewed"])),
    ).toBe(false);

    expect(
      cueMatchesReviewStatusFilter(
        cue(true),
        new Set(["reviewed", "not-reviewed"]),
      ),
    ).toBe(true);
    expect(
      cueMatchesReviewStatusFilter(
        cue(false),
        new Set(["reviewed", "not-reviewed"]),
      ),
    ).toBe(true);
  });

  it("combines role, shot, and status filters", () => {
    const reviewedA = { ...cue(true), speakerId: "A", shot: "ON" };
    const unreviewedB = { ...cue(false), speakerId: "B", shot: "OFF" };

    expect(cueMatchesListFilters(reviewedA, ["A"], ["reviewed"], [])).toBe(
      true,
    );
    expect(cueMatchesListFilters(unreviewedB, ["A"], ["reviewed"], [])).toBe(
      false,
    );
    expect(cueMatchesListFilters(unreviewedB, ["B"], ["reviewed"], [])).toBe(
      false,
    );
    expect(
      cueMatchesListFilters(unreviewedB, ["B"], ["not-reviewed"], []),
    ).toBe(true);
    expect(cueMatchesListFilters(reviewedA, [], [], ["ON"])).toBe(true);
    expect(cueMatchesListFilters(unreviewedB, [], [], ["ON"])).toBe(false);
    expect(cueMatchesListFilters(unreviewedB, [], [], ["OFF"])).toBe(true);
  });

  it("counts active filters", () => {
    expect(activeFilterCount([], [], [])).toBe(0);
    expect(activeFilterCount(["A"], ["reviewed"], ["ON"])).toBe(3);
    expect(hasActiveFilters([], ["not-reviewed"], [])).toBe(true);
    expect(hasActiveFilters([], [], ["VO"])).toBe(true);
  });
});
