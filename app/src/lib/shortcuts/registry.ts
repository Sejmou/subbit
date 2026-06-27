import { MOD_LABEL } from "./mod-label";
import type { ShortcutContext } from "./context";
import { reactionAdjustedPlayhead } from "../../store/playback";
import { focusCueForEdit } from "../focus-cue";
import { openRolePicker } from "../role-picker";

type KeyEvent = globalThis.KeyboardEvent;

export interface ShortcutDef {
  id: string;
  group: string;
  /** Display label in the help overlay and tooltips. */
  label: string | ((mod: string) => string);
  description: string;
  /** When false, the shortcut works but is omitted from the help overlay. */
  showInHelp?: boolean;
  match: (e: KeyEvent, ctx: ShortcutContext) => boolean;
  run: (ctx: ShortcutContext, e: KeyEvent) => void;
  preventDefault?: boolean;
}

function mod(e: KeyEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

/** True when no platform modifier is held — avoids stealing Cmd+R, Cmd+S in the browser, etc. */
function plainKey(e: KeyEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey;
}

/** Main or numpad 0 — layout-independent (Shift+0 is ")" on US keyboards). */
function isZeroKey(e: KeyEvent): boolean {
  return e.code === "Digit0" || e.code === "Numpad0";
}

/** Cmd/Ctrl-free keys; allows Alt for Option/Alt combos. */
function navKey(e: KeyEvent): boolean {
  return !e.metaKey && !e.ctrlKey;
}

/** Video transport works whenever a project is open, even before the first cue exists. */
function canPlayback(e: KeyEvent, ctx: ShortcutContext): boolean {
  return plainKey(e) && !ctx.editing && !!ctx.project;
}

/** Modifier + shift jog (1 frame). */
function canModShiftPlayback(e: KeyEvent, ctx: ShortcutContext): boolean {
  return mod(e) && e.shiftKey && !ctx.editing && !!ctx.project;
}

const JOG_FRAMES = 10;

/** Ordered list — first match wins, same priority as the original handler. */
export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "help-toggle",
    group: "Project",
    label: "?",
    description: "Show / hide this help",
    match: (e, ctx) => plainKey(e) && !ctx.editing && e.key === "?",
    run: () => window.dispatchEvent(new CustomEvent("subbit:help-toggle")),
    preventDefault: true,
  },
  {
    id: "undo",
    group: "Project",
    label: (m) => `${m} + Z`,
    description: "Undo",
    match: (e, ctx) =>
      !!ctx.project &&
      mod(e) &&
      (e.key === "z" || e.key === "Z") &&
      !e.shiftKey,
    run: (ctx) => ctx.ps.undo(),
    preventDefault: true,
  },
  {
    id: "redo",
    group: "Project",
    label: (m) => `${m} + Shift + Z`,
    description: "Redo",
    match: (e, ctx) =>
      !!ctx.project &&
      mod(e) &&
      (((e.key === "z" || e.key === "Z") && e.shiftKey) ||
        e.key === "y" ||
        e.key === "Y"),
    run: (ctx) => ctx.ps.redo(),
    preventDefault: true,
  },
  {
    id: "save",
    group: "Project",
    label: (m) => `${m} + S`,
    description: "Save project",
    match: (e, ctx) =>
      !!ctx.project &&
      mod(e) &&
      (e.key === "s" || e.key === "S") &&
      !e.shiftKey,
    run: () => window.dispatchEvent(new CustomEvent("subbit:save")),
    preventDefault: true,
  },
  {
    id: "split-at-caret",
    group: "Text & structure",
    label: (m) => `${m} + Enter`,
    description: "Split cue at the caret + playhead",
    match: (e, ctx) =>
      !!ctx.project && mod(e) && e.key === "Enter" && !!ctx.caret,
    run: (ctx) => {
      const caret = ctx.caret!;
      ctx.ps.splitCueAtCaret(
        caret.cueId,
        caret.segIndex,
        caret.offset,
        ctx.pb.currentTime,
      );
    },
    preventDefault: true,
  },
  {
    id: "insert-shot-split",
    group: "Text & structure",
    label: (m) => `${m} + Shift + S`,
    description: "Insert a shot change at the caret",
    match: (e, ctx) =>
      !!ctx.project &&
      mod(e) &&
      e.shiftKey &&
      (e.key === "S" || e.key === "s") &&
      !!ctx.caret,
    run: (ctx) => {
      const caret = ctx.caret!;
      ctx.ps.insertShotSplit(caret.cueId, caret.segIndex, caret.offset);
    },
    preventDefault: true,
  },
  {
    id: "leave-text",
    group: "Text & structure",
    label: "Esc",
    description: "Leave the text box (back to navigation)",
    match: (e, ctx) => ctx.editing && e.key === "Escape",
    run: (ctx) => (ctx.target as HTMLElement).blur(),
  },
  {
    id: "preview-toggle",
    group: "Playback & navigation",
    label: "P",
    description: "Toggle subtitle preview on video",
    match: (e, ctx) => canPlayback(e, ctx) && (e.key === "p" || e.key === "P"),
    run: () => window.dispatchEvent(new CustomEvent("subbit:preview-toggle")),
    preventDefault: true,
  },
  {
    id: "play-from-cue",
    group: "Playback & navigation",
    label: "Shift + Space",
    description: "Play from the selected cue In",
    match: (e, ctx) =>
      canPlayback(e, ctx) && e.shiftKey && e.key === " " && !!ctx.cue,
    run: (ctx) => ctx.pb.playFrom(ctx.cue!.start),
    preventDefault: true,
  },
  {
    id: "play-pause",
    group: "Playback & navigation",
    label: "Space",
    description: "Play / pause",
    match: (e, ctx) => canPlayback(e, ctx) && !e.shiftKey && e.key === " ",
    run: (ctx) => ctx.pb.togglePlay(),
    preventDefault: true,
  },
  {
    id: "next-cue",
    group: "Playback & navigation",
    label: "J / K  or  ↓ / ↑",
    description: "Next / previous cue",
    match: (e, ctx) =>
      plainKey(e) &&
      !ctx.editing &&
      !!ctx.project &&
      ctx.project.cues.length > 0 &&
      (e.key === "ArrowDown" || e.key === "j"),
    run: (ctx) => {
      const { project, cueIndex, ps } = ctx;
      ps.selectCue(
        project!.cues[Math.min(cueIndex + 1, project!.cues.length - 1)].id,
      );
    },
    preventDefault: true,
  },
  {
    id: "previous-cue",
    group: "Playback & navigation",
    label: "J / K  or  ↓ / ↑",
    description: "Next / previous cue",
    showInHelp: false,
    match: (e, ctx) =>
      plainKey(e) &&
      !ctx.editing &&
      !!ctx.project &&
      ctx.project.cues.length > 0 &&
      (e.key === "ArrowUp" || e.key === "k"),
    run: (ctx) => {
      const { project, cueIndex, ps } = ctx;
      ps.selectCue(project!.cues[Math.max(cueIndex - 1, 0)].id);
    },
    preventDefault: true,
  },
  {
    id: "jog-back",
    group: "Playback & navigation",
    label: "← / →",
    description: "Jog playhead 1 second",
    match: (e, ctx) =>
      canPlayback(e, ctx) && e.key === "ArrowLeft" && !e.shiftKey,
    run: (ctx) => ctx.pb.seek(ctx.pb.currentTime - 1),
    preventDefault: true,
  },
  {
    id: "jog-forward",
    group: "Playback & navigation",
    label: "← / →",
    description: "Jog playhead 1 second",
    showInHelp: false,
    match: (e, ctx) =>
      canPlayback(e, ctx) && e.key === "ArrowRight" && !e.shiftKey,
    run: (ctx) => ctx.pb.seek(ctx.pb.currentTime + 1),
    preventDefault: true,
  },
  {
    id: "jog-back-frames",
    group: "Playback & navigation",
    label: "Shift + ← / →",
    description: "Jog playhead 10 frames",
    match: (e, ctx) =>
      canPlayback(e, ctx) && e.shiftKey && e.key === "ArrowLeft",
    run: (ctx) => ctx.pb.seek(ctx.pb.currentTime - ctx.frame * JOG_FRAMES),
    preventDefault: true,
  },
  {
    id: "jog-forward-frames",
    group: "Playback & navigation",
    label: "Shift + ← / →",
    description: "Jog playhead 10 frames",
    showInHelp: false,
    match: (e, ctx) =>
      canPlayback(e, ctx) && e.shiftKey && e.key === "ArrowRight",
    run: (ctx) => ctx.pb.seek(ctx.pb.currentTime + ctx.frame * JOG_FRAMES),
    preventDefault: true,
  },
  {
    id: "jog-back-frame",
    group: "Playback & navigation",
    label: (m) => `${m} + Shift + ← / →`,
    description: "Jog playhead 1 frame",
    match: (e, ctx) => canModShiftPlayback(e, ctx) && e.key === "ArrowLeft",
    run: (ctx) => ctx.pb.seek(ctx.pb.currentTime - ctx.frame),
    preventDefault: true,
  },
  {
    id: "jog-forward-frame",
    group: "Playback & navigation",
    label: (m) => `${m} + Shift + ← / →`,
    description: "Jog playhead 1 frame",
    showInHelp: false,
    match: (e, ctx) => canModShiftPlayback(e, ctx) && e.key === "ArrowRight",
    run: (ctx) => ctx.pb.seek(ctx.pb.currentTime + ctx.frame),
    preventDefault: true,
  },
  {
    id: "set-in",
    group: "Timing",
    label: "I",
    description: "Set cue In to the playhead (500 ms earlier while playing)",
    match: (e, ctx) =>
      plainKey(e) && !ctx.editing && !!ctx.cue && e.key === "i",
    run: (ctx) =>
      ctx.ps.setCueStart(
        ctx.cue!.id,
        reactionAdjustedPlayhead(ctx.pb.currentTime, ctx.pb.playing),
      ),
  },
  {
    id: "set-out",
    group: "Timing",
    label: "O",
    description: "Set cue Out to the playhead (500 ms earlier while playing)",
    match: (e, ctx) =>
      plainKey(e) && !ctx.editing && !!ctx.cue && e.key === "o",
    run: (ctx) =>
      ctx.ps.setCueEnd(
        ctx.cue!.id,
        reactionAdjustedPlayhead(ctx.pb.currentTime, ctx.pb.playing),
      ),
  },
  {
    id: "nudge-in",
    group: "Timing",
    label: "[",
    description: "Nudge In 1 frame (Shift = other direction)",
    match: (e, ctx) =>
      plainKey(e) && !ctx.editing && !!ctx.cue && e.key === "[",
    run: (ctx, e) =>
      ctx.ps.nudgeCueStart(ctx.cue!.id, e.shiftKey ? ctx.frame : -ctx.frame),
  },
  {
    id: "nudge-out",
    group: "Timing",
    label: "]",
    description: "Nudge Out 1 frame (Shift = other direction)",
    match: (e, ctx) =>
      plainKey(e) && !ctx.editing && !!ctx.cue && e.key === "]",
    run: (ctx, e) =>
      ctx.ps.nudgeCueEnd(ctx.cue!.id, e.shiftKey ? -ctx.frame : ctx.frame),
  },
  {
    id: "seek-program-start",
    group: "Program sync",
    label: "0",
    description: "Seek to program start (or file start if unset)",
    match: (e, ctx) =>
      navKey(e) &&
      !e.altKey &&
      !e.shiftKey &&
      !ctx.editing &&
      !!ctx.project &&
      (isZeroKey(e) || e.key === "Home"),
    run: (ctx) => {
      const start = ctx.project!.contentStartSeconds ?? 0;
      ctx.pb.seek(start > 0 ? start : 0);
    },
    preventDefault: true,
  },
  {
    id: "set-program-start",
    group: "Program sync",
    label: "Shift + 0",
    description: "Set program start to the playhead (skip leader on export)",
    match: (e, ctx) =>
      navKey(e) &&
      !e.altKey &&
      e.shiftKey &&
      !ctx.editing &&
      !!ctx.project &&
      (isZeroKey(e) || e.key === "Home"),
    run: (ctx) => {
      const duration = ctx.pb.duration;
      const t = Math.max(0, ctx.pb.currentTime);
      const seconds =
        Number.isFinite(duration) && duration > 0
          ? Math.min(t, Math.max(0, duration - ctx.frame))
          : t;
      ctx.ps.setContentStartSeconds(seconds <= 0 ? 0 : seconds);
    },
    preventDefault: true,
  },
  {
    id: "clear-program-start",
    group: "Program sync",
    label: "Alt + 0",
    description: "Clear program start",
    match: (e, ctx) =>
      navKey(e) &&
      !ctx.editing &&
      !!ctx.project &&
      ((e.altKey && !e.shiftKey && isZeroKey(e)) ||
        (!e.altKey && e.shiftKey && e.key === "End")),
    run: (ctx) => ctx.ps.setContentStartSeconds(0),
    preventDefault: true,
  },
  {
    id: "insert-cue",
    group: "Text & structure",
    label: "N",
    description: "Add a cue at the playhead (500 ms earlier while playing)",
    match: (e, ctx) =>
      plainKey(e) &&
      !ctx.editing &&
      !!ctx.project &&
      (e.key === "n" || e.key === "N"),
    run: (ctx) => {
      const id = ctx.ps.insertCueAtPlayhead(
        reactionAdjustedPlayhead(ctx.pb.currentTime, ctx.pb.playing),
      );
      if (id) focusCueForEdit(id);
    },
    preventDefault: true,
  },
  {
    id: "delete-cue",
    group: "Text & structure",
    label: "Delete / Backspace",
    description: "Delete the selected cue",
    match: (e, ctx) =>
      plainKey(e) &&
      !ctx.editing &&
      !!ctx.cue &&
      (e.key === "Delete" || e.key === "Backspace"),
    run: (ctx) => ctx.ps.deleteCue(ctx.cue!.id),
    preventDefault: true,
  },
  {
    id: "merge",
    group: "Text & structure",
    label: "M",
    description: "Merge the selected cue with the next",
    match: (e, ctx) =>
      plainKey(e) &&
      !ctx.editing &&
      !!ctx.cue &&
      (e.key === "m" || e.key === "M") &&
      !e.shiftKey,
    run: (ctx) => ctx.ps.mergeWithNext(ctx.cue!.id),
  },
  {
    id: "unmerge",
    group: "Text & structure",
    label: "Shift + M",
    description:
      "Unmerge at the active segment (split back into separate cues)",
    match: (e, ctx) =>
      plainKey(e) &&
      !ctx.editing &&
      !!ctx.cue &&
      (e.key === "m" || e.key === "M") &&
      e.shiftKey &&
      ctx.cue!.segments[ctx.ps.selectedSegment]?.mergedWithPrevious === true &&
      ctx.ps.selectedSegment > 0,
    run: (ctx) =>
      ctx.ps.splitAtMergedSegment(ctx.cue!.id, ctx.ps.selectedSegment),
  },
  {
    id: "toggle-reviewed",
    group: "Metadata",
    label: "R",
    description: 'Toggle "reviewed"',
    match: (e, ctx) =>
      plainKey(e) && !ctx.editing && !!ctx.cue && e.key === "r",
    run: (ctx) => ctx.ps.toggleReviewed(ctx.cue!.id),
  },
  {
    id: "edit-cue",
    group: "Text & structure",
    label: "Enter",
    description: "Edit the selected cue (focus its text)",
    match: (e, ctx) =>
      plainKey(e) && !ctx.editing && !!ctx.cue && e.key === "Enter",
    run: (ctx) => focusCueForEdit(ctx.cue!.id),
    preventDefault: true,
  },
  {
    id: "seek-to-cue",
    group: "Playback & navigation",
    label: "G",
    description: "Seek video to the selected cue",
    match: (e, ctx) =>
      plainKey(e) && !ctx.editing && !!ctx.cue && e.key === "g",
    run: (ctx) => ctx.pb.seek(ctx.cue!.start),
  },
  {
    id: "assign-role",
    group: "Metadata",
    label: "A",
    description: "Open the role picker for the selected cue",
    match: (e, ctx) =>
      plainKey(e) &&
      !ctx.editing &&
      !!ctx.cue &&
      (e.key === "a" || e.key === "A"),
    run: (ctx) => openRolePicker(ctx.cue!.id),
    preventDefault: true,
  },
  {
    id: "assign-shot",
    group: "Metadata",
    label: "Shift + 1 / 2 / 3 …",
    description: "Set the active segment's shot type",
    match: (e, ctx) =>
      plainKey(e) &&
      !ctx.editing &&
      !!ctx.cue &&
      e.shiftKey &&
      /^[!@#$%^&*(]$/.test(e.key),
    run: (ctx, e) => {
      const map = "!@#$%^&*(";
      const shot = ctx.project!.shots[map.indexOf(e.key)];
      if (shot)
        ctx.ps.setSegmentShot(ctx.cue!.id, ctx.ps.selectedSegment, shot.id);
    },
  },
];

/** Resolve a display label for a shortcut id (e.g. toolbar tooltips). */
export function shortcutLabel(id: string, mod: string = MOD_LABEL): string {
  const def = SHORTCUTS.find((s) => s.id === id);
  if (!def) return "";
  return typeof def.label === "function" ? def.label(mod) : def.label;
}

/** Shortcut ids referenced by UI chrome outside the help overlay. */
export const TOOLBAR_SHORTCUT_IDS = ["undo", "redo", "save"] as const;
