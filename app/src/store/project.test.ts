import { beforeEach, describe, expect, it } from "vitest";
import { writeLockReviewedCues } from "../lib/lock-reviewed-settings";
import { useLockReviewedStore } from "./lock-reviewed";
import { useProject } from "./project";
import type { Project } from "../types";
import { PROJECT_VERSION } from "../types";

function makeProject(): Project {
  return {
    version: PROJECT_VERSION,
    id: "00000000-0000-4000-8000-000000000001",
    name: "clip",
    videoName: "clip.mp4",
    fpsNumerator: 25,
    fpsDenominator: 1,
    startTimecode: "00:00:00:00",
    referenceStartSeconds: 0,
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
const cueSeconds = (cueId: string, boundary: "start" | "end") => {
  const cue = store().project!.cues.find((c) => c.id === cueId)!;
  return boundary === "start" ? cue.start : cue.end;
};

beforeEach(() => {
  writeLockReviewedCues(false);
  useLockReviewedStore.setState({ enabled: false });
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
    store().nudgeCueEnd("c2", 1);
    store().nudgeCueEnd("c2", 1);
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(store().project!.cues[1].end).toBe(4);
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
    expect(cueSeconds("c2", "start")).toBeCloseTo(2.5, 1);
    expect(cueSeconds("c2", "end")).toBeCloseTo(4.5, 1);
  });

  it("preserves duration when a move is clamped against the previous cue", () => {
    store().setCueTimes("c2", 1.5, 3.5);
    const cue = store().project!.cues[1];
    expect(cue.start).toBe(2);
    expect(cue.end).toBe(4);
  });

  it("does not let In move before subtitle start", () => {
    store().setReferenceStartSeconds(1);
    store().setCueStart("c1", 0);
    expect(store().project!.cues[0].start).toBe(1);
  });
});

describe("setReferenceStartSeconds", () => {
  it("does not move cues when subtitle start is set", () => {
    store().setReferenceStartSeconds(1);
    expect(store().project!.referenceStartSeconds).toBe(1);
    expect(store().project!.cues[0].start).toBe(0);
    expect(store().project!.cues[0].end).toBe(2);
    expect(store().project!.cues[1].start).toBe(2);
    expect(store().project!.cues[1].end).toBe(4);
  });

  it("is undoable without moving cues", () => {
    store().setReferenceStartSeconds(1);
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(store().project!.referenceStartSeconds).toBe(0);
    expect(store().project!.cues[0].start).toBe(0);
    expect(store().project!.cues[1].start).toBe(2);
  });

  it("does not record a no-op when subtitle start is unchanged", () => {
    store().setReferenceStartSeconds(1);
    expect(store().past).toHaveLength(1);
    store().setReferenceStartSeconds(1);
    expect(store().past).toHaveLength(1);
  });

  it("clears reviewed on cues that become invalid", () => {
    store().toggleReviewed("c1");
    store().setReferenceStartSeconds(1);
    expect(store().project!.cues[0].reviewed).toBeFalsy();
  });
});

describe("toggleReviewed on invalid cues", () => {
  it("does not allow marking invalid cues as reviewed", () => {
    store().setReferenceStartSeconds(1);
    store().toggleReviewed("c1");
    expect(store().project!.cues[0].reviewed).toBeFalsy();
    expect(store().past).toHaveLength(1);
  });
});

describe("setStartTimecode", () => {
  it("is undoable", () => {
    store().setStartTimecode("01:00:00:00");
    expect(store().project!.startTimecode).toBe("01:00:00:00");
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(store().project!.startTimecode).toBe("00:00:00:00");
  });

  it("does not record a no-op when the timecode is unchanged", () => {
    store().setStartTimecode("00:00:00:00");
    expect(store().past).toHaveLength(0);
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

describe("replaceSegmentTexts", () => {
  it("updates many segments in one undo step", () => {
    store().replaceSegmentTexts([
      { cueId: "c1", segIndex: 0, text: "hey" },
      { cueId: "c2", segIndex: 0, text: "earth" },
    ]);
    expect(firstText()).toBe("hey");
    expect(store().project!.cues[1].segments[0].text).toBe("earth");
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(firstText()).toBe("hello");
    expect(store().project!.cues[1].segments[0].text).toBe("world");
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
    expect(cueSeconds(inserted.id, "start")).toBeCloseTo(1.5, 1);
    expect(cueSeconds(inserted.id, "end")).toBeCloseTo(3.5, 1);
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
          start: 2.52,
          end: 4,
          speakerId: "SPEAKER_00",
          segments: [{ text: "world", shot: "ON" }],
        },
      ],
    });
    store().insertCueAtPlayhead(1.2);
    const inserted = store().project!.cues[1];
    expect(cueSeconds(inserted.id, "start")).toBeCloseTo(1.2, 1);
    expect(cueSeconds(inserted.id, "end")).toBeCloseTo(2.5, 1);
  });

  it("inserts at the end when the playhead is past existing cues", () => {
    store().insertCueAtPlayhead(10);
    expect(store().project!.cues).toHaveLength(3);
    const inserted = store().project!.cues[2];
    expect(cueSeconds(inserted.id, "start")).toBe(10);
    expect(cueSeconds(inserted.id, "end")).toBe(12);
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
});

describe("reviewed cue lock", () => {
  beforeEach(() => {
    writeLockReviewedCues(true);
    useLockReviewedStore.setState({ enabled: true });
    store().toggleReviewed("c1");
  });

  it("blocks text edits on reviewed cues", () => {
    store().markSaved();
    store().setSegmentText("c1", 0, "blocked");
    expect(firstText()).toBe("hello");
    expect(store().dirty).toBe(false);
  });

  it("blocks timing edits on reviewed cues", () => {
    store().setCueEnd("c1", 10);
    expect(store().project!.cues[0].end).toBe(2);
  });

  it("blocks delete on reviewed cues", () => {
    store().deleteCue("c1");
    expect(store().project!.cues).toHaveLength(2);
  });

  it("allows edits after unreviewing", () => {
    store().toggleReviewed("c1");
    store().setSegmentText("c1", 0, "edited");
    expect(firstText()).toBe("edited");
  });

  it("allows edits when lock mode is off", () => {
    useLockReviewedStore.getState().setEnabled(false);
    store().setSegmentText("c1", 0, "edited");
    expect(firstText()).toBe("edited");
  });
});
