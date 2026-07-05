import { describe, expect, it, vi } from "vitest";
import type { ShortcutContext } from "./context";
import { createKeyLabeler } from "../keyboard-layout";
import { setFindReplaceOpen } from "../find-replace-dialog";
import { setHelpOverlayOpen } from "../help-overlay";
import { shortcutGroups } from "./groups";
import { SHORTCUTS } from "./registry";
import { resolveShortcut, handleShortcut } from "./resolve";
import { makeCue, makeProject } from "../../test-fixtures";
import { useCueListFiltersStore } from "../../store/cue-list-filters";

function makeKeyEvent(
  keyVal: string,
  init: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
    >
  > = {},
): KeyboardEvent {
  return {
    key: keyVal,
    code: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as KeyboardEvent;
}

function modKey(
  keyVal: string,
  init: Partial<Pick<KeyboardEvent, "shiftKey">> = {},
) {
  return makeKeyEvent(keyVal, { metaKey: true, ...init });
}

const cue = makeCue(
  { id: "cue-1", start: 1, end: 5, speakerId: "SPEAKER_00" },
  "hello",
);

const project = makeProject({
  id: "00000000-0000-4000-8000-000000000001",
  name: "test",
  videoName: "test",
  shots: [{ id: "ON", label: "On-screen" }],
  cues: [cue],
});

function ctx(overrides: Partial<ShortcutContext> = {}): ShortcutContext {
  const ps = {
    undo: vi.fn(),
    redo: vi.fn(),
    selectCue: vi.fn(),
    setCueStart: vi.fn(),
    setCueEnd: vi.fn(),
    setCueTimes: vi.fn(),
    nudgeCueStart: vi.fn(),
    nudgeCueEnd: vi.fn(),
    nudgeCueTimes: vi.fn(),
    toggleReviewed: vi.fn(),
    toggleJoinedToPrev: vi.fn(),
    setCueSpeaker: vi.fn(),
    setSegmentShot: vi.fn(),
    cycleSegmentShot: vi.fn(),
    splitCueAtCaret: vi.fn(),
    insertShotSplit: vi.fn(),
    deleteCue: vi.fn(),
    setReferenceStartSeconds: vi.fn(),
    selectedSegment: 0,
  };
  const pb = {
    togglePlay: vi.fn(),
    playFrom: vi.fn(),
    seek: vi.fn(),
    stepPlaybackRate: vi.fn(),
    currentTime: 2,
    playing: false,
  };
  return {
    editing: false,
    target: null,
    project,
    cue,
    cueIndex: 0,
    cueLocked: false,
    frameStep: 0.04,
    caret: null,
    ps: ps as unknown as ShortcutContext["ps"],
    pb: pb as unknown as ShortcutContext["pb"],
    ...overrides,
  };
}

describe("shortcut registry", () => {
  it("defines label and handlers for every shortcut", () => {
    for (const def of SHORTCUTS) {
      expect(def.id).toBeTruthy();
      expect(def.group).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.match).toBeTypeOf("function");
      expect(def.run).toBeTypeOf("function");
      const label =
        typeof def.label === "function"
          ? def.label("Cmd", createKeyLabeler())
          : def.label;
      expect(label).toBeTruthy();
    }
  });

  it("documents each help-visible shortcut exactly once", () => {
    const helpIds = SHORTCUTS.filter((s) => s.showInHelp !== false).map(
      (s) => s.id,
    );
    expect(new Set(helpIds).size).toBe(helpIds.length);

    const groups = shortcutGroups("Cmd");
    const documented = groups.flatMap((g) =>
      g.shortcuts.map((s) => s.description),
    );
    const expected = SHORTCUTS.filter((s) => s.showInHelp !== false).map(
      (s) => s.description,
    );
    expect(documented.sort()).toEqual(expected.sort());
  });
});

describe("resolveShortcut", () => {
  it("toggles help outside a text field", () => {
    expect(resolveShortcut(makeKeyEvent("?"), ctx())?.id).toBe("help-toggle");
    expect(
      resolveShortcut(makeKeyEvent("?"), ctx({ editing: true })),
    ).toBeNull();
  });

  it("requires a loaded project for editing shortcuts", () => {
    expect(resolveShortcut(modKey("z"), ctx({ project: null }))).toBeNull();
    expect(resolveShortcut(modKey("z"), ctx())?.id).toBe("undo");
  });

  it("maps redo to shift+z and y", () => {
    expect(resolveShortcut(modKey("z", { shiftKey: true }), ctx())?.id).toBe(
      "redo",
    );
    expect(resolveShortcut(modKey("y"), ctx())?.id).toBe("redo");
  });

  it("handles playback bindings with an open project even when no cues exist", () => {
    const empty = ctx({
      cue: null,
      cueIndex: -1,
      project: { ...project, cues: [] },
    });
    expect(resolveShortcut(makeKeyEvent(" "), empty)?.id).toBe("play-pause");
    expect(resolveShortcut(makeKeyEvent("ArrowLeft"), empty)?.id).toBe(
      "jog-back",
    );
    expect(
      resolveShortcut(makeKeyEvent("ArrowRight", { shiftKey: true }), empty)
        ?.id,
    ).toBe("jog-forward-frames");
    expect(
      resolveShortcut(modKey("ArrowRight", { shiftKey: true }), empty)?.id,
    ).toBe("jog-forward-frame");
    expect(resolveShortcut(makeKeyEvent("j"), empty)).toBeNull();
    expect(
      resolveShortcut(makeKeyEvent(" ", { shiftKey: true }), empty),
    ).toBeNull();
    expect(
      resolveShortcut(makeKeyEvent(",", { code: "Comma" }), empty)?.id,
    ).toBe("playback-slower");
    expect(
      resolveShortcut(makeKeyEvent(".", { code: "Period" }), empty)?.id,
    ).toBe("playback-faster");
  });

  it("marks cue In/Out at the playhead for I and O", () => {
    const playing = ctx({
      pb: { ...ctx().pb, currentTime: 10, playing: true },
    });
    resolveShortcut(makeKeyEvent("i"), playing)?.run(
      playing,
      makeKeyEvent("i"),
    );
    expect(playing.ps.setCueStart).toHaveBeenCalledWith("cue-1", 10);

    const paused = ctx();
    resolveShortcut(makeKeyEvent("o"), paused)?.run(paused, makeKeyEvent("o"));
    expect(paused.ps.setCueEnd).toHaveBeenCalledWith("cue-1", 2);
  });

  it("moves the selected cue to the playhead on M, keeping its duration", () => {
    const c = ctx({ pb: { ...ctx().pb, currentTime: 7 } });
    resolveShortcut(makeKeyEvent("m"), c)?.run(c, makeKeyEvent("m"));
    // cue spans 1..5 (4s); playhead at 7 -> 7..11
    expect(c.ps.setCueTimes).toHaveBeenCalledWith("cue-1", 7, 11);
  });

  it("does not move a reviewed-locked cue on M", () => {
    expect(
      resolveShortcut(makeKeyEvent("m"), ctx({ cueLocked: true })),
    ).toBeNull();
  });

  it("nudges the whole cue with Alt+arrows (Shift = 10 frames)", () => {
    const c = ctx();
    const back = makeKeyEvent("ArrowLeft", { altKey: true });
    expect(resolveShortcut(back, c)?.id).toBe("nudge-cue-earlier");
    resolveShortcut(back, c)?.run(c, back);
    expect(c.ps.nudgeCueTimes).toHaveBeenCalledWith("cue-1", -1);

    const c2 = ctx();
    const fwd = makeKeyEvent("ArrowRight", { altKey: true, shiftKey: true });
    expect(resolveShortcut(fwd, c2)?.id).toBe("nudge-cue-later");
    resolveShortcut(fwd, c2)?.run(c2, fwd);
    expect(c2.ps.nudgeCueTimes).toHaveBeenCalledWith("cue-1", 10);
  });

  it("plays from the selected cue In on shift+space", () => {
    const c = ctx();
    resolveShortcut(makeKeyEvent(" ", { shiftKey: true }), c)?.run(
      c,
      makeKeyEvent(" ", { shiftKey: true }),
    );
    expect(c.pb.playFrom).toHaveBeenCalledWith(1);
  });

  it("handles navigation bindings when a cue is selected", () => {
    const c = ctx();
    resolveShortcut(makeKeyEvent(" "), c)?.run(c, makeKeyEvent(" "));
    expect(c.pb.togglePlay).toHaveBeenCalled();

    expect(resolveShortcut(makeKeyEvent("j"), ctx())?.id).toBe("next-cue");
    expect(resolveShortcut(makeKeyEvent("k"), ctx())?.id).toBe("previous-cue");
    expect(resolveShortcut(makeKeyEvent("ArrowLeft"), ctx())?.id).toBe(
      "jog-back",
    );
    expect(
      resolveShortcut(makeKeyEvent("ArrowRight", { shiftKey: true }), ctx())
        ?.id,
    ).toBe("jog-forward-frames");
    expect(
      resolveShortcut(modKey("ArrowLeft", { shiftKey: true }), ctx())?.id,
    ).toBe("jog-back-frame");
  });

  it("jumps to cue In and Out with H and L", () => {
    const c = ctx();
    resolveShortcut(makeKeyEvent("h"), c)?.run(c, makeKeyEvent("h"));
    expect(c.pb.seek).toHaveBeenCalledWith(1);

    const c2 = ctx();
    resolveShortcut(makeKeyEvent("l"), c2)?.run(c2, makeKeyEvent("l"));
    expect(c2.pb.seek).toHaveBeenCalledWith(5);
  });

  it("nudges cue times from physical keys (layout-independent)", () => {
    const c = ctx();
    resolveShortcut(makeKeyEvent("ü", { code: "BracketLeft" }), c)?.run(
      c,
      makeKeyEvent("ü", { code: "BracketLeft" }),
    );
    expect(c.ps.nudgeCueStart).toHaveBeenCalledWith("cue-1", -1);

    const c2 = ctx();
    resolveShortcut(
      makeKeyEvent("Ü", { code: "BracketLeft", shiftKey: true }),
      c2,
    )?.run(c2, makeKeyEvent("Ü", { code: "BracketLeft", shiftKey: true }));
    expect(c2.ps.nudgeCueStart).toHaveBeenCalledWith("cue-1", -10);

    const c3 = ctx();
    resolveShortcut(makeKeyEvent("+", { code: "BracketRight" }), c3)?.run(
      c3,
      makeKeyEvent("+", { code: "BracketRight" }),
    );
    expect(c3.ps.nudgeCueStart).toHaveBeenCalledWith("cue-1", 1);

    const c4 = ctx();
    resolveShortcut(makeKeyEvent("'", { code: "Quote" }), c4)?.run(
      c4,
      makeKeyEvent("'", { code: "Quote" }),
    );
    expect(c4.ps.nudgeCueEnd).toHaveBeenCalledWith("cue-1", -1);

    const c5 = ctx();
    resolveShortcut(makeKeyEvent("\\", { code: "Backslash" }), c5)?.run(
      c5,
      makeKeyEvent("\\", { code: "Backslash" }),
    );
    expect(c5.ps.nudgeCueEnd).toHaveBeenCalledWith("cue-1", 1);

    const c6 = ctx();
    resolveShortcut(
      makeKeyEvent("\\", { code: "Backslash", shiftKey: true }),
      c6,
    )?.run(c6, makeKeyEvent("\\", { code: "Backslash", shiftKey: true }));
    expect(c6.ps.nudgeCueEnd).toHaveBeenCalledWith("cue-1", 10);
  });

  it("ignores navigation shortcuts while editing text", () => {
    expect(
      resolveShortcut(makeKeyEvent(" "), ctx({ editing: true })),
    ).toBeNull();
    expect(resolveShortcut(modKey("z"), ctx({ editing: true }))?.id).toBe(
      "undo",
    );
    expect(
      resolveShortcut(makeKeyEvent("Escape"), ctx({ editing: true }))?.id,
    ).toBe("leave-text");
  });

  it("requires a caret for split and shot-insert combos", () => {
    expect(resolveShortcut(modKey("Enter"), ctx({ caret: null }))).toBeNull();
    const caret = { cueId: "cue-1", segIndex: 0, offset: 3 };
    expect(resolveShortcut(modKey("Enter"), ctx({ caret }))?.id).toBe(
      "split-at-caret",
    );
    expect(
      resolveShortcut(modKey("s", { shiftKey: true }), ctx({ caret }))?.id,
    ).toBe("insert-shot-split");
  });

  it("ignores browser modifier combos for single-key bindings", () => {
    expect(resolveShortcut(modKey("r"), ctx())).toBeNull();
    expect(resolveShortcut(modKey("s"), ctx())?.id).toBe("save");
    expect(resolveShortcut(makeKeyEvent("r"), ctx())?.id).toBe(
      "toggle-reviewed",
    );
  });

  it("opens find and replace on mod+shift+f", () => {
    expect(resolveShortcut(modKey("f", { shiftKey: true }), ctx())?.id).toBe(
      "find-replace",
    );
  });

  it("ignores shortcuts while the help overlay is open", () => {
    setHelpOverlayOpen(true);
    expect(handleShortcut(makeKeyEvent(" ", { code: "Space" }))).toBe(false);
    expect(handleShortcut(makeKeyEvent("j"))).toBe(false);
    setHelpOverlayOpen(false);
  });

  it("toggles find and replace on mod+shift+f even while the panel is open", () => {
    setFindReplaceOpen(true);
    expect(resolveShortcut(modKey("f", { shiftKey: true }), ctx())?.id).toBe(
      "find-replace",
    );
    setFindReplaceOpen(false);
  });

  it("deletes the selected cue on mod+backspace", () => {
    const c = ctx();
    expect(resolveShortcut(makeKeyEvent("Backspace"), c)).toBeNull();
    expect(resolveShortcut(modKey("Backspace"), c)?.id).toBe("delete-cue");
    resolveShortcut(modKey("Backspace"), c)?.run(c, modKey("Backspace"));
    expect(c.ps.deleteCue).toHaveBeenCalledWith("cue-1");
  });

  it("opens the role picker on A", () => {
    expect(resolveShortcut(makeKeyEvent("a"), ctx())?.id).toBe("assign-role");
  });

  it("cycles shot type on S", () => {
    const c2 = ctx();
    resolveShortcut(makeKeyEvent("s"), c2)?.run(c2, makeKeyEvent("s"));
    expect(c2.ps.cycleSegmentShot).toHaveBeenCalledWith("cue-1", 0);
  });

  it("navigates filtered cues on j and k", () => {
    const cue2 = makeCue(
      { id: "cue-2", start: 5, end: 10, speakerId: "SPEAKER_01" },
      "world",
    );
    const cue3 = makeCue(
      { id: "cue-3", start: 10, end: 15, speakerId: "SPEAKER_00" },
      "again",
    );
    const threeCues = ctx({
      cue,
      cueIndex: 0,
      project: { ...project, cues: [cue, cue2, cue3] },
      ps: {
        ...ctx().ps,
        selectedCueId: "cue-1",
      } as ShortcutContext["ps"],
    });
    useCueListFiltersStore.setState({
      speakerFilter: ["SPEAKER_00"],
      statusFilter: [],
      shotFilter: [],
    });
    resolveShortcut(makeKeyEvent("j"), threeCues)?.run(
      threeCues,
      makeKeyEvent("j"),
    );
    expect(threeCues.ps.selectCue).toHaveBeenCalledWith("cue-3");
    useCueListFiltersStore.setState({
      speakerFilter: [],
      statusFilter: [],
      shotFilter: [],
    });
  });

  it("links or unlinks the selected cue on mod+j", () => {
    const cue2 = makeCue(
      { id: "cue-2", start: 5, end: 10, speakerId: "SPEAKER_00" },
      "world",
    );
    const twoCues = ctx({
      cue: cue2,
      cueIndex: 1,
      project: { ...project, cues: [cue, cue2] },
    });
    expect(resolveShortcut(modKey("j"), twoCues)?.id).toBe("toggle-cue-join");
    resolveShortcut(modKey("j"), twoCues)?.run(twoCues, modKey("j"));
    expect(twoCues.ps.toggleJoinedToPrev).toHaveBeenCalledWith("cue-2");

    expect(resolveShortcut(modKey("j"), ctx({ cueIndex: 0 }))).toBeNull();
    expect(resolveShortcut(makeKeyEvent("j"), twoCues)?.id).toBe("next-cue");
  });

  it("handles reference frame shortcuts on 0 and legacy Home/End keys", () => {
    const c = ctx({
      project: { ...project, referenceStartSeconds: 12 },
      pb: { ...ctx().pb, currentTime: 5, duration: 100 },
    });

    expect(resolveShortcut(makeKeyEvent("0", { code: "Digit0" }), c)?.id).toBe(
      "seek-reference-frame",
    );
    resolveShortcut(makeKeyEvent("0", { code: "Digit0" }), c)?.run(
      c,
      makeKeyEvent("0", { code: "Digit0" }),
    );
    expect(c.pb.seek).toHaveBeenCalledWith(12);

    expect(resolveShortcut(makeKeyEvent("Home"), c)?.id).toBe(
      "seek-reference-frame",
    );

    expect(
      resolveShortcut(makeKeyEvent("0", { code: "Digit0", shiftKey: true }), c)
        ?.id,
    ).toBe("set-reference-frame");
    resolveShortcut(
      makeKeyEvent("0", { code: "Digit0", shiftKey: true }),
      c,
    )?.run(c, makeKeyEvent("0", { code: "Digit0", shiftKey: true }));
    expect(c.ps.setReferenceStartSeconds).toHaveBeenCalledWith(5);

    expect(
      resolveShortcut(makeKeyEvent("Home", { shiftKey: true }), c)?.id,
    ).toBe("set-reference-frame");

    expect(
      resolveShortcut(makeKeyEvent("0", { code: "Digit0", altKey: true }), c)
        ?.id,
    ).toBe("clear-reference-frame");
    resolveShortcut(
      makeKeyEvent("0", { code: "Digit0", altKey: true }),
      c,
    )?.run(c, makeKeyEvent("0", { code: "Digit0", altKey: true }));
    expect(c.ps.setReferenceStartSeconds).toHaveBeenCalledWith(0);

    expect(
      resolveShortcut(makeKeyEvent("End", { shiftKey: true }), c)?.id,
    ).toBe("clear-reference-frame");
  });
});
