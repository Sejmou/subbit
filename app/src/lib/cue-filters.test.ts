import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import {
  activeFilterCount,
  countCueAppearancesByShotWithFilters,
  countCueAppearancesBySpeakerWithFilters,
  cueMatchesListFilters,
  cueMatchesNoteFilter,
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

  it("combines role, shot, status, and note filters", () => {
    const reviewedA = { ...cue(true), speakerId: "A", shot: "ON" };
    const unreviewedB = { ...cue(false), speakerId: "B", shot: "OFF" };
    const noted = { ...cue(false), note: "check lip sync" };

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
    expect(cueMatchesListFilters(noted, [], [], [], ["has-note"])).toBe(true);
    expect(cueMatchesListFilters(reviewedA, [], [], [], ["has-note"])).toBe(
      false,
    );
    expect(cueMatchesListFilters(reviewedA, [], [], [], ["no-note"])).toBe(
      true,
    );
  });

  it("filters by note presence", () => {
    const withNote = { ...cue(false), note: "ADR needed" };
    const blank = { ...cue(false), note: "   " };

    expect(cueMatchesNoteFilter(withNote, new Set(["has-note"]))).toBe(true);
    expect(cueMatchesNoteFilter(blank, new Set(["has-note"]))).toBe(false);
    expect(cueMatchesNoteFilter(blank, new Set(["no-note"]))).toBe(true);
    expect(
      cueMatchesNoteFilter(withNote, new Set(["has-note", "no-note"])),
    ).toBe(true);
  });

  it("counts active filters", () => {
    expect(activeFilterCount([], [], [])).toBe(0);
    expect(activeFilterCount(["A"], ["reviewed"], ["ON"])).toBe(3);
    expect(activeFilterCount([], [], [], ["has-note"])).toBe(1);
    expect(hasActiveFilters([], ["not-reviewed"], [])).toBe(true);
    expect(hasActiveFilters([], [], ["VO"])).toBe(true);
    expect(hasActiveFilters([], [], [], ["no-note"])).toBe(true);
  });

  it("counts role appearances with status and shot filters applied", () => {
    const project = {
      cues: [
        { ...cue(true), id: "c1", speakerId: "A", shot: "ON" },
        { ...cue(true), id: "c2", speakerId: "A", shot: "ON" },
        { ...cue(false), id: "c3", speakerId: "A", shot: "ON" },
        { ...cue(true), id: "c4", speakerId: "B", shot: "OFF" },
      ],
    } as Project;

    expect(countCueAppearancesBySpeakerWithFilters(project, [], [])).toEqual(
      new Map([
        ["A", 3],
        ["B", 1],
      ]),
    );
    expect(
      countCueAppearancesBySpeakerWithFilters(project, ["reviewed"], []),
    ).toEqual(
      new Map([
        ["A", 2],
        ["B", 1],
      ]),
    );
    expect(
      countCueAppearancesBySpeakerWithFilters(project, [], ["ON"]),
    ).toEqual(new Map([["A", 3]]));
  });

  it("counts shot appearances with role and status filters applied", () => {
    const project = {
      cues: [
        { ...cue(true), id: "c1", speakerId: "A", shot: "ON" },
        { ...cue(true), id: "c2", speakerId: "A", shot: "ON" },
        { ...cue(false), id: "c3", speakerId: "A", shot: "OFF" },
        { ...cue(true), id: "c4", speakerId: "B", shot: "OFF" },
      ],
    } as Project;

    expect(countCueAppearancesByShotWithFilters(project, [], [])).toEqual(
      new Map([
        ["ON", 2],
        ["OFF", 2],
      ]),
    );
    expect(countCueAppearancesByShotWithFilters(project, ["A"], [])).toEqual(
      new Map([
        ["ON", 2],
        ["OFF", 1],
      ]),
    );
    expect(
      countCueAppearancesByShotWithFilters(project, [], ["reviewed"]),
    ).toEqual(
      new Map([
        ["ON", 2],
        ["OFF", 1],
      ]),
    );
  });
});
