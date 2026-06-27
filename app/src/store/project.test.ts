import { beforeEach, describe, expect, it } from "vitest";
import { useProject } from "./project";
import type { Project } from "../types";

function makeProject(): Project {
  return {
    version: 1,
    videoName: "movie.mp4",
    fps: 25,
    timecodeOffset: "10:00:00:00",
    defaultShot: "ON",
    shots: [
      { id: "ON", label: "On-screen" },
      { id: "OFF", label: "Off-screen" },
    ],
    speakers: [{ id: "SPEAKER_00", name: "A", color: "#fff" }],
    cues: [
      {
        id: "c1",
        start: 0,
        end: 2,
        speakerId: "SPEAKER_00",
        segments: [{ text: "hello", shot: "ON" }],
      },
      {
        id: "c2",
        start: 2,
        end: 4,
        speakerId: "SPEAKER_00",
        segments: [{ text: "world", shot: "ON" }],
      },
    ],
  };
}

const store = () => useProject.getState();
const firstText = () => store().project!.cues[0].segments[0].text;

beforeEach(() => {
  // loadProject also resets the undo/redo stacks and coalescing state.
  store().loadProject(makeProject());
});

describe("undo / redo", () => {
  it("starts with empty history", () => {
    expect(store().past).toHaveLength(0);
    expect(store().future).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });

  it("undoes and redoes a discrete edit", () => {
    store().toggleReviewed("c1");
    expect(store().project!.cues[0].reviewed).toBe(true);
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(store().project!.cues[0].reviewed).toBeFalsy();
    expect(store().past).toHaveLength(0);
    expect(store().future).toHaveLength(1);

    store().redo();
    expect(store().project!.cues[0].reviewed).toBe(true);
    expect(store().future).toHaveLength(0);
  });

  it("treats each discrete action as its own step", () => {
    store().toggleReviewed("c1");
    store().toggleReviewed("c2");
    expect(store().past).toHaveLength(2);

    store().undo();
    expect(store().project!.cues[1].reviewed).toBeFalsy();
    expect(store().project!.cues[0].reviewed).toBe(true);
  });

  it("is a no-op when there is nothing to undo or redo", () => {
    store().undo();
    expect(store().past).toHaveLength(0);
    store().redo();
    expect(store().future).toHaveLength(0);
  });

  it("does not record no-op transforms (merge on the last cue)", () => {
    store().mergeWithNext("c2");
    expect(store().past).toHaveLength(0);
    expect(store().project!.cues).toHaveLength(2);
  });

  it("clears the redo stack once a new edit happens", () => {
    store().toggleReviewed("c1");
    store().undo();
    expect(store().future).toHaveLength(1);

    store().toggleReviewed("c2");
    expect(store().future).toHaveLength(0);
  });

  it("restores the selection captured with each step", () => {
    store().selectCue("c2");
    store().toggleReviewed("c2");
    store().selectCue("c1");

    store().undo();
    expect(store().selectedCueId).toBe("c2");
  });
});

describe("coalescing", () => {
  it("collapses rapid edits to the same target into one undo step", () => {
    store().setSegmentText("c1", 0, "h");
    store().setSegmentText("c1", 0, "hi");
    store().setSegmentText("c1", 0, "hit");
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(firstText()).toBe("hello");
  });

  it("starts a new step when a different action interrupts typing", () => {
    store().setSegmentText("c1", 0, "hi");
    store().toggleReviewed("c1");
    store().setSegmentText("c1", 0, "hiya");
    expect(store().past).toHaveLength(3);

    store().undo();
    expect(firstText()).toBe("hi");
  });

  it("keeps timing nudges to one cue as a single step", () => {
    store().nudgeCueEnd("c2", 0.04);
    store().nudgeCueEnd("c2", 0.04);
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(store().project!.cues[1].end).toBeCloseTo(4, 5);
  });
});

describe("cue boundary clamping", () => {
  it("does not let In extend past the previous cue Out", () => {
    store().setCueStart("c2", 1);
    expect(store().project!.cues[1].start).toBe(2);
  });

  it("does not let Out extend past the next cue In", () => {
    store().setCueEnd("c1", 3);
    expect(store().project!.cues[0].end).toBe(2);
  });

  it("still allows touching boundaries", () => {
    store().setCueEnd("c1", 2.5);
    expect(store().project!.cues[0].end).toBe(2);
    store().setCueStart("c2", 2);
    expect(store().project!.cues[1].start).toBe(2);
  });

  it("does not record a no-op when clamping blocks the edit", () => {
    store().setCueEnd("c1", 10);
    expect(store().past).toHaveLength(0);
  });

  it("preserves duration when moving a cue as a block", () => {
    store().setCueTimes("c2", 2.5, 4.5);
    expect(store().project!.cues[1].start).toBeCloseTo(2.5, 5);
    expect(store().project!.cues[1].end).toBeCloseTo(4.5, 5);
  });

  it("preserves duration when a move is clamped against the previous cue", () => {
    store().setCueTimes("c2", 1.5, 3.5);
    const cue = store().project!.cues[1];
    expect(cue.start).toBe(2);
    expect(cue.end).toBe(4);
  });
});

describe("merge / unmerge", () => {
  it("tags the absorbed segment on merge", () => {
    store().loadProject({
      ...makeProject(),
      speakers: [
        { id: "SPEAKER_00", name: "A", color: "#fff" },
        { id: "SPEAKER_01", name: "B", color: "#ccc" },
      ],
      cues: [
        {
          id: "c1",
          start: 0,
          end: 2,
          speakerId: "SPEAKER_00",
          segments: [{ text: "hello", shot: "ON" }],
        },
        {
          id: "c2",
          start: 2,
          end: 4,
          speakerId: "SPEAKER_01",
          segments: [{ text: "world", shot: "OFF" }],
        },
      ],
    });

    store().mergeWithNext("c1");
    const merged = store().project!.cues[0];
    expect(store().project!.cues).toHaveLength(1);
    expect(merged.segments).toHaveLength(2);
    expect(merged.segments[1]).toMatchObject({
      text: "world",
      mergedWithPrevious: true,
      mergedSpeakerId: "SPEAKER_01",
    });
  });

  it("unmerges at a tagged segment and restores the absorbed speaker", () => {
    store().loadProject({
      ...makeProject(),
      speakers: [
        { id: "SPEAKER_00", name: "A", color: "#fff" },
        { id: "SPEAKER_01", name: "B", color: "#ccc" },
      ],
      cues: [
        {
          id: "c1",
          start: 0,
          end: 2,
          speakerId: "SPEAKER_00",
          segments: [{ text: "hello", shot: "ON" }],
        },
        {
          id: "c2",
          start: 2,
          end: 4,
          speakerId: "SPEAKER_01",
          segments: [{ text: "world", shot: "OFF" }],
        },
      ],
    });

    store().mergeWithNext("c1");
    store().splitAtMergedSegment("c1", 1);

    const cues = store().project!.cues;
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      start: 0,
      end: 2,
      speakerId: "SPEAKER_00",
    });
    expect(cues[0].segments[0].text).toBe("hello");
    expect(cues[0].segments[0].mergedWithPrevious).toBeUndefined();
    expect(cues[1]).toMatchObject({
      start: 2,
      end: 4,
      speakerId: "SPEAKER_01",
    });
    expect(cues[1].segments[0].text).toBe("world");
    expect(cues[1].segments[0].mergedWithPrevious).toBeUndefined();
    expect(store().selectedCueId).toBe(cues[1].id);
  });

  it("is a no-op when the segment is not a merge seam", () => {
    store().splitAtMergedSegment("c1", 0);
    expect(store().past).toHaveLength(0);
    expect(store().project!.cues).toHaveLength(2);
  });

  it("undoes and redoes unmerge", () => {
    store().mergeWithNext("c1");
    expect(store().project!.cues).toHaveLength(1);

    store().splitAtMergedSegment("c1", 1);
    expect(store().project!.cues).toHaveLength(2);

    store().undo();
    expect(store().project!.cues).toHaveLength(1);
    expect(store().project!.cues[0].segments[1].mergedWithPrevious).toBe(true);

    store().redo();
    expect(store().project!.cues).toHaveLength(2);
  });
});

describe("restoreProject", () => {
  it("replaces the project and is itself undoable", () => {
    const restored = makeProject();
    restored.cues[0].segments[0].text = "restored";

    store().setSegmentText("c1", 0, "edited");
    store().restoreProject(restored);
    expect(firstText()).toBe("restored");

    store().undo();
    expect(firstText()).toBe("edited");
  });

  it("keeps a still-present selection but falls back to the first cue", () => {
    store().selectCue("c2");
    const restored = makeProject();
    restored.cues = restored.cues.filter((c) => c.id !== "c2");

    store().restoreProject(restored);
    expect(store().selectedCueId).toBe("c1");
  });
});

describe("insertCueAtPlayhead / deleteCue", () => {
  it("inserts an empty cue in a gap and selects it", () => {
    store().loadProject({
      ...makeProject(),
      cues: [
        {
          id: "c1",
          start: 0,
          end: 1,
          speakerId: "SPEAKER_00",
          segments: [{ text: "hello", shot: "ON" }],
        },
        {
          id: "c2",
          start: 4,
          end: 6,
          speakerId: "SPEAKER_00",
          segments: [{ text: "world", shot: "ON" }],
        },
      ],
    });
    const id = store().insertCueAtPlayhead(1.5);
    expect(store().project!.cues).toHaveLength(3);
    const inserted = store().project!.cues[1];
    expect(id).toBe(inserted.id);
    expect(inserted.start).toBe(1.5);
    expect(inserted.end).toBe(3.5);
    expect(inserted.segments[0].text).toBe("");
    expect(store().selectedCueId).toBe(inserted.id);
  });

  it("does not insert inside an existing cue", () => {
    expect(store().insertCueAtPlayhead(1)).toBeNull();
    expect(store().project!.cues).toHaveLength(2);
  });

  it("shortens the cue when the next section is nearby", () => {
    store().loadProject({
      ...makeProject(),
      cues: [
        {
          id: "c1",
          start: 0,
          end: 1,
          speakerId: "SPEAKER_00",
          segments: [{ text: "hello", shot: "ON" }],
        },
        {
          id: "c2",
          start: 2.5,
          end: 4,
          speakerId: "SPEAKER_00",
          segments: [{ text: "world", shot: "ON" }],
        },
      ],
    });
    store().insertCueAtPlayhead(1.2);
    const inserted = store().project!.cues[1];
    expect(inserted.start).toBe(1.2);
    expect(inserted.end).toBe(2.5);
  });

  it("inserts at the end when the playhead is past existing cues", () => {
    store().insertCueAtPlayhead(10);
    expect(store().project!.cues).toHaveLength(3);
    const inserted = store().project!.cues[2];
    expect(inserted.start).toBe(10);
    expect(inserted.end).toBe(12);
  });

  it("deletes the selected cue and selects a neighbor", () => {
    store().selectCue("c1");
    store().deleteCue("c1");
    expect(store().project!.cues).toHaveLength(1);
    expect(store().project!.cues[0].id).toBe("c2");
    expect(store().selectedCueId).toBe("c2");
  });

  it("clears selection when the last cue is deleted", () => {
    store().loadProject({ ...makeProject(), cues: [makeProject().cues[0]] });
    store().deleteCue("c1");
    expect(store().project!.cues).toHaveLength(0);
    expect(store().selectedCueId).toBeNull();
  });
});

describe("speakers", () => {
  it("removes an unreferenced speaker", () => {
    store().loadProject({
      ...makeProject(),
      speakers: [
        { id: "A", name: "Alice", color: "#fff" },
        { id: "B", name: "Bob", color: "#000" },
      ],
      cues: [
        {
          id: "c1",
          start: 0,
          end: 2,
          speakerId: "A",
          segments: [{ text: "hi", shot: "ON" }],
        },
      ],
    });
    expect(store().removeSpeaker("B")).toBe(true);
    expect(store().project!.speakers.map((s) => s.id)).toEqual(["A"]);
  });

  it("refuses to remove a referenced speaker", () => {
    expect(store().removeSpeaker("SPEAKER_00")).toBe(false);
    expect(store().project!.speakers).toHaveLength(1);
  });

  it("refuses to remove a speaker referenced in merged segments", () => {
    store().loadProject({
      ...makeProject(),
      speakers: [
        { id: "A", name: "Alice", color: "#fff" },
        { id: "B", name: "Bob", color: "#000" },
      ],
      cues: [
        {
          id: "c1",
          start: 0,
          end: 4,
          speakerId: "A",
          segments: [
            {
              text: "merged",
              shot: "ON",
              mergedWithPrevious: true,
              mergedSpeakerId: "B",
            },
          ],
        },
      ],
    });
    expect(store().removeSpeaker("B")).toBe(false);
    expect(store().removeSpeaker("A")).toBe(false);
  });
});
