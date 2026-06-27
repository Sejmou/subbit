import { describe, expect, it } from "vitest";
import type { Cue, Project } from "../types";
import {
  cueMatchesSpeakerFilter,
  cueReferencesSpeaker,
  isSpeakerReferenced,
} from "./speaker-refs";

const cue = (overrides: Partial<Cue> & Pick<Cue, "id">): Cue => ({
  start: 0,
  end: 1,
  speakerId: null,
  segments: [{ text: "x", shot: "ON" }],
  ...overrides,
});

describe("speaker refs", () => {
  it("detects cue-level speaker references", () => {
    expect(cueReferencesSpeaker(cue({ id: "c1", speakerId: "A" }), "A")).toBe(
      true,
    );
    expect(cueReferencesSpeaker(cue({ id: "c1", speakerId: "B" }), "A")).toBe(
      false,
    );
  });

  it("checks project-wide references", () => {
    const project = {
      cues: [cue({ id: "c1", speakerId: "A" })],
    } as Project;
    expect(isSpeakerReferenced(project, "A")).toBe(true);
    expect(isSpeakerReferenced(project, "B")).toBe(false);
  });

  it("filters cues by one or more speakers", () => {
    const c1 = cue({ id: "c1", speakerId: "A" });
    const c2 = cue({ id: "c2", speakerId: "B" });
    const c3 = cue({ id: "c3", speakerId: null });

    expect(cueMatchesSpeakerFilter(c1, new Set())).toBe(true);
    expect(cueMatchesSpeakerFilter(c3, new Set())).toBe(true);

    const filter = new Set(["A"]);
    expect(cueMatchesSpeakerFilter(c1, filter)).toBe(true);
    expect(cueMatchesSpeakerFilter(c2, filter)).toBe(false);
    expect(cueMatchesSpeakerFilter(c3, filter)).toBe(false);

    const multi = new Set(["A", "B"]);
    expect(cueMatchesSpeakerFilter(c2, multi)).toBe(true);
  });
});
