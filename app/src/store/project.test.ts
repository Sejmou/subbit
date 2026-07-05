import { beforeEach, describe, expect, it } from "vitest";
import { writeLockReviewedCues } from "../lib/lock-reviewed-settings";
import { cueShotText, makeCue, makeProject } from "../test-fixtures";
import { DEFAULT_SHOTS } from "../types";
import { useLockReviewedStore } from "./lock-reviewed";
import { useProject } from "./project";

const store = () => useProject.getState();
const firstText = () => cueShotText(store().project!.cues[0]);
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

describe("cue boundary editing (overlaps allowed)", () => {
  it("lets In extend past the previous cue Out (overlap)", () => {
    store().setCueStart("c2", 1);
    expect(store().project!.cues[1].start).toBeCloseTo(1, 5);
  });

  it("lets Out extend past the next cue In (overlap)", () => {
    store().setCueEnd("c1", 3);
    expect(store().project!.cues[0].end).toBeCloseTo(3, 5);
  });

  it("still clamps In to at least one frame before its own Out", () => {
    store().setCueStart("c1", 5);
    const cue = store().project!.cues[0];
    expect(cue.start).toBeLessThan(cue.end);
  });

  it("does not record a no-op when the value is unchanged", () => {
    store().setCueEnd("c1", 2);
    expect(store().past).toHaveLength(0);
  });

  it("preserves duration when moving a cue as a block", () => {
    store().setCueTimes("c2", 2.5, 4.5);
    expect(cueSeconds("c2", "start")).toBeCloseTo(2.5, 1);
    expect(cueSeconds("c2", "end")).toBeCloseTo(4.5, 1);
  });

  it("moves a cue over its neighbor instead of clamping to it", () => {
    store().setCueTimes("c2", 1.5, 3.5);
    const cue = store().project!.cues[1];
    expect(cue.start).toBeCloseTo(1.5, 1);
    expect(cue.end).toBeCloseTo(3.5, 1);
  });

  it("does not let In move before subtitle start", () => {
    store().setReferenceStartSeconds(1);
    store().setCueStart("c1", 0);
    expect(store().project!.cues[0].start).toBe(1);
  });

  it("re-sorts storage after a cue is dragged past a neighbor", () => {
    // c1 [0,2], c2 [2,4] → drag c1 to [5,7], now after c2 in time.
    store().setCueTimes("c1", 5, 7);
    const cues = store().project!.cues;
    expect(cues.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(cues[0].start).toBeLessThanOrEqual(cues[1].start);
  });
});

describe("moving a linked run as a unit", () => {
  const loadRun = () =>
    store().loadProject(
      makeProject({
        cues: [
          makeCue({ id: "g1", start: 2, end: 4 }, "one"),
          makeCue({ id: "g2", start: 4, end: 6, joinedToPrev: true }, "two"),
          makeCue({ id: "g3", start: 6, end: 8, joinedToPrev: true }, "three"),
          makeCue({ id: "solo", start: 10, end: 12 }, "four"),
        ],
      }),
    );

  beforeEach(loadRun);

  it("shifts every run member by the same delta when the head moves", () => {
    store().setCueTimes("g1", 3, 5); // +1s
    const cues = store().project!.cues;
    expect([cues[0].start, cues[0].end]).toEqual([3, 5]);
    expect([cues[1].start, cues[1].end]).toEqual([5, 7]);
    expect([cues[2].start, cues[2].end]).toEqual([7, 9]);
  });

  it("shifts the whole run when a middle member is dragged", () => {
    store().setCueTimes("g2", 3, 5); // g2 -1s → run shifts -1s
    const cues = store().project!.cues;
    expect(cues[0].start).toBeCloseTo(1, 5);
    expect(cues[1].start).toBeCloseTo(3, 5);
    expect(cues[2].start).toBeCloseTo(5, 5);
    // Internal abutment preserved.
    expect(cues[1].start).toBeCloseTo(cues[0].end, 5);
    expect(cues[2].start).toBeCloseTo(cues[1].end, 5);
  });

  it("keeps a standalone cue unaffected by a run move", () => {
    store().setCueTimes("g1", 3, 5);
    expect(cueSeconds("solo", "start")).toBe(10);
  });

  it("keeps run members contiguous when a lone cue overlaps into the run", () => {
    // Move solo to start inside the [2,8] run span; run must stay glued.
    store().setCueTimes("solo", 3, 5);
    const ids = store().project!.cues.map((c) => c.id);
    const gi = ids.indexOf("g1");
    expect(ids.slice(gi, gi + 3)).toEqual(["g1", "g2", "g3"]);
  });

  it("clamps the run to the floor by its earliest member", () => {
    store().setReferenceStartSeconds(1);
    store().setCueTimes("g2", 1, 3); // would push g1 below the floor
    const cues = store().project!.cues;
    expect(cues[0].start).toBe(1);
    expect(cues[1].start).toBeCloseTo(3, 5);
  });
});

describe("group boundary enforcement", () => {
  const loadGroup = () =>
    store().loadProject(
      makeProject({
        cues: [
          makeCue({ id: "g1", start: 0, end: 2 }, "one"),
          makeCue({ id: "g2", start: 2, end: 4, joinedToPrev: true }, "two"),
          makeCue({ id: "g3", start: 4, end: 6, joinedToPrev: true }, "three"),
        ],
      }),
    );

  beforeEach(loadGroup);

  it("drags a joined cue's In when its predecessor Out shrinks", () => {
    store().setCueEnd("g1", 1.6);
    const cues = store().project!.cues;
    expect(cues[0].end).toBeCloseTo(1.6, 5);
    expect(cues[1].start).toBe(cues[0].end);
  });

  it("drags a joined cue's In when its predecessor Out grows into the group", () => {
    store().setCueEnd("g1", 3);
    const cues = store().project!.cues;
    expect(cues[0].end).toBeCloseTo(3, 5);
    expect(cues[1].start).toBe(cues[0].end);
    // The follower's own Out and the next boundary are untouched.
    expect(cues[1].end).toBe(4);
    expect(cues[2].start).toBe(4);
  });

  it("drags the predecessor Out when a joined cue's In grows", () => {
    store().setCueStart("g2", 3);
    const cues = store().project!.cues;
    expect(cues[1].start).toBeCloseTo(3, 5);
    expect(cues[0].end).toBe(cues[1].start);
  });

  it("drags the predecessor Out when a joined cue's In slides left into it", () => {
    store().setCueStart("g2", 1);
    const cues = store().project!.cues;
    expect(cues[1].start).toBeCloseTo(1, 5);
    expect(cues[0].end).toBe(cues[1].start);
    expect(cues[0].start).toBe(0);
  });

  it("detaches the follower when a group's head is deleted", () => {
    store().deleteCue("g1");
    const cues = store().project!.cues;
    expect(cues[0].id).toBe("g2");
    expect(cues[0].joinedToPrev).toBe(false);
    expect(cues[1].joinedToPrev).toBe(true);
  });

  it("re-abuts the follower to the earlier member when a middle cue is deleted", () => {
    store().deleteCue("g2");
    const cues = store().project!.cues;
    expect(cues.map((c) => c.id)).toEqual(["g1", "g3"]);
    expect(cues[1].joinedToPrev).toBe(true);
    expect(cues[1].start).toBe(cues[0].end);
    expect(cues[1].start).toBe(2);
  });
});

describe("toggleJoinedToPrev", () => {
  const loadGap = () =>
    store().loadProject(
      makeProject({
        cues: [
          makeCue({ id: "a", start: 0, end: 2 }, "one"),
          makeCue({ id: "b", start: 3, end: 5 }, "two"),
          makeCue({ id: "c", start: 6, end: 8 }, "three"),
        ],
      }),
    );

  beforeEach(loadGap);

  it("joins two independent cues at the word-gap midpoint", () => {
    store().toggleJoinedToPrev("b");
    const cues = store().project!.cues;
    // Words fill each window, so the boundary lands ~mid the [2, 3] gap
    // (snapped to the 25fps grid → 2.52).
    expect(cues[1].joinedToPrev).toBe(true);
    expect(cues[1].start).toBeCloseTo(2.5, 1);
    expect(cues[0].end).toBe(cues[1].start);
    // The far cue is untouched.
    expect(cues[2].start).toBe(6);
  });

  it("keeps the joined boundary in sync afterwards", () => {
    store().toggleJoinedToPrev("b");
    store().setCueEnd("a", 2.8);
    const cues = store().project!.cues;
    expect(cues[0].end).toBeCloseTo(2.8, 5);
    expect(cues[1].start).toBe(cues[0].end);
  });

  it("unjoins without moving timing", () => {
    store().toggleJoinedToPrev("b");
    const boundary = store().project!.cues[1].start;
    store().toggleJoinedToPrev("b");
    const cues = store().project!.cues;
    expect(cues[1].joinedToPrev).toBe(false);
    expect(cues[1].start).toBeCloseTo(boundary, 5);
    expect(cues[0].end).toBeCloseTo(boundary, 5);
  });

  it("is a no-op for the first cue", () => {
    const before = store().project;
    store().toggleJoinedToPrev("a");
    expect(store().project).toBe(before);
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
    const restored = makeProject({
      cues: [makeCue({ id: "c1", start: 0, end: 2 }, "restored")],
    });

    store().setSegmentText("c1", 0, "edited");
    store().restoreProject(restored);
    expect(firstText()).toBe("restored");

    store().undo();
    expect(firstText()).toBe("edited");
  });

  it("keeps a still-present selection but falls back to the first cue", () => {
    store().selectCue("c2");
    const restored = makeProject({
      cues: [makeCue({ id: "c1", start: 0, end: 2 })],
    });

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
    expect(cueShotText(store().project!.cues[1])).toBe("earth");
    expect(store().past).toHaveLength(1);

    store().undo();
    expect(firstText()).toBe("hello");
    expect(cueShotText(store().project!.cues[1])).toBe("world");
  });
});

describe("insertCueAtPlayhead / deleteCue", () => {
  it("inserts an empty cue in a gap and selects it", () => {
    store().loadProject(
      makeProject({
        cues: [
          makeCue(
            { id: "c1", start: 0, end: 1, speakerId: "SPEAKER_00" },
            "hello",
          ),
          makeCue(
            { id: "c2", start: 4, end: 6, speakerId: "SPEAKER_00" },
            "world",
          ),
        ],
      }),
    );
    const id = store().insertCueAtPlayhead(1.5);
    expect(store().project!.cues).toHaveLength(3);
    const inserted = store().project!.cues[1];
    expect(id).toBe(inserted.id);
    expect(cueSeconds(inserted.id, "start")).toBeCloseTo(1.5, 1);
    expect(cueSeconds(inserted.id, "end")).toBeCloseTo(3.5, 1);
    expect(cueShotText(inserted)).toBe("");
    expect(store().selectedCueId).toBe(inserted.id);
  });

  it("does not insert inside an existing cue", () => {
    expect(store().insertCueAtPlayhead(1)).toBeNull();
    expect(store().project!.cues).toHaveLength(2);
  });

  it("shortens the cue when the next section is nearby", () => {
    store().loadProject(
      makeProject({
        cues: [
          makeCue(
            { id: "c1", start: 0, end: 1, speakerId: "SPEAKER_00" },
            "hello",
          ),
          makeCue(
            { id: "c2", start: 2.52, end: 4, speakerId: "SPEAKER_00" },
            "world",
          ),
        ],
      }),
    );
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
    store().loadProject({
      ...makeProject(),
      cues: [makeCue({ id: "c1", start: 0, end: 2 })],
    });
    store().deleteCue("c1");
    expect(store().project!.cues).toHaveLength(0);
    expect(store().selectedCueId).toBeNull();
  });
});

describe("speakers", () => {
  it("removes an unreferenced speaker", () => {
    store().loadProject(
      makeProject({
        speakers: [
          { id: "A", name: "Alice", color: "#fff" },
          { id: "B", name: "Bob", color: "#000" },
        ],
        cues: [makeCue({ id: "c1", start: 0, end: 2, speakerId: "A" }, "hi")],
      }),
    );
    expect(store().removeSpeaker("B")).toBe(true);
    expect(store().project!.speakers.map((s) => s.id)).toEqual(["A"]);
  });

  it("refuses to remove a referenced speaker", () => {
    expect(store().removeSpeaker("SPEAKER_00")).toBe(false);
    expect(store().project!.speakers).toHaveLength(1);
  });
});

describe("shot types", () => {
  it("adds and renames a custom shot type", () => {
    expect(store().addShot("VO", "Voice-over")).toBe("VO");
    expect(store().project!.shots).toHaveLength(4);
    store().renameShotLabel("VO", "Narration");
    expect(store().project!.shots.find((s) => s.id === "VO")?.label).toBe(
      "Narration",
    );
  });

  it("removes an unreferenced custom shot type", () => {
    store().addShot("VO", "Voice-over");
    expect(store().removeShot("VO")).toBe(true);
    expect(store().project!.shots.map((s) => s.id)).not.toContain("VO");
  });

  it("removes an unreferenced built-in shot type", () => {
    expect(store().removeShot("OFF")).toBe(true);
    expect(store().project!.shots.map((s) => s.id)).not.toContain("OFF");
  });

  it("reassigns defaultShot when removing the current default", () => {
    store().loadProject(
      makeProject({
        cues: [
          makeCue(
            { id: "c1", start: 0, end: 2, speakerId: "SPEAKER_00" },
            "hello",
            "OFF",
          ),
        ],
        defaultShot: "ON",
        shots: DEFAULT_SHOTS,
      }),
    );
    expect(store().removeShot("ON")).toBe(true);
    expect(store().project!.defaultShot).toBe("OFF");
  });

  it("refuses to remove referenced shot types or the last shot type", () => {
    expect(store().removeShot("ON")).toBe(false);
    store().loadProject(
      makeProject({
        cues: [
          makeCue(
            { id: "c1", start: 0, end: 2, speakerId: "SPEAKER_00" },
            "hello",
            "OFF",
          ),
        ],
        defaultShot: "OFF",
        shots: [{ id: "OFF", label: "Off-screen" }],
      }),
    );
    expect(store().removeShot("OFF")).toBe(false);
    store().addShot("VO", "Voice-over");
    store().setSegmentShot("c1", 0, "VO");
    expect(store().removeShot("VO")).toBe(false);
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
