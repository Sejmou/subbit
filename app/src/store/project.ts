import { create } from "zustand";
import type { Cue, Project, ShotId, Speaker, VideoIdentity } from "../types";
import { computeInsertCueRange, findInsertCueIndex } from "../lib/cue-insert";
import { isReviewedCueLocked } from "../lib/cue-lock";
import { frameStep, snapToFrame } from "../lib/cue-timing";
import {
  isCueBeforeReferenceStart,
  minCueStartSeconds,
} from "../lib/program-start";
import { isSpeakerReferenced } from "../lib/speaker-refs";
import { resolveProjectName } from "../lib/project-meta";
import {
  applyCueBlockMove,
  applyCueEndChange,
  applyCueStartChange,
  joinBoundaryTime,
  newCueAtPlayhead,
  setCueShot,
  setCueText,
  splitCueAtCaretOffset,
  syncJoinedCueStartAt,
  syncPrevCueEndAt,
} from "../lib/word-model/cue-ops";
import { useReferenceStartNoticeStore } from "./reference-start-notice";

const DEFAULT_CUE_DURATION = 2;

const SPEAKER_PALETTE = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#46f0f0",
  "#f032e6",
  "#bcf60c",
  "#fabebe",
  "#008080",
  "#9a6324",
  "#fffac8",
  "#800000",
  "#aaffc3",
  "#808000",
  "#ffd8b1",
  "#000075",
  "#a9a9a9",
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** One reversible step: the project plus the selection at that moment. */
interface HistoryEntry {
  project: Project;
  selectedCueId: string | null;
  selectedSegment: number;
}

interface ProjectState {
  project: Project | null;
  selectedCueId: string | null;
  /** Active segment within the selected cue (for shot assignment / splitting). */
  selectedSegment: number;
  dirty: boolean;
  lastSavedAt: number | null;

  /** Undo stack (oldest first); the last entry is what `undo` restores to. */
  past: HistoryEntry[];
  /** Redo stack (next entry first). */
  future: HistoryEntry[];

  loadProject: (project: Project) => void;
  clearProject: () => void;
  markSaved: () => void;

  /** Step backward / forward through the in-session edit history. */
  undo: () => void;
  redo: () => void;
  /** Replace the whole project (e.g. restoring a saved version); undoable. */
  restoreProject: (project: Project) => void;

  selectCue: (id: string | null) => void;
  selectSegment: (index: number) => void;

  // cue text / timing
  setSegmentText: (cueId: string, segIndex: number, text: string) => void;
  /** Replace many segment texts in one undo step (find & replace). */
  replaceSegmentTexts: (
    updates: { cueId: string; segIndex: number; text: string }[],
  ) => void;
  setCueStart: (cueId: string, time: number) => void;
  setCueEnd: (cueId: string, time: number) => void;
  /** Set In and Out together (e.g. dragging a cue on the timeline). */
  setCueTimes: (cueId: string, start: number, end: number) => void;
  nudgeCueStart: (cueId: string, deltaFrames: number) => void;
  nudgeCueEnd: (cueId: string, deltaFrames: number) => void;

  /**
   * Toggle whether the cue joins the immediately preceding cue into one group.
   * Joining seats the shared boundary at the word-gap midpoint (see
   * {@link joinBoundaryTime}); unjoining leaves the timing untouched.
   */
  toggleJoinedToPrev: (cueId: string) => void;

  // metadata
  setCueSpeaker: (cueId: string, speakerId: string | null) => void;
  setSegmentShot: (cueId: string, segIndex: number, shot: ShotId) => void;
  cycleSegmentShot: (cueId: string, segIndex: number) => void;
  toggleReviewed: (cueId: string) => void;

  // structural ops
  splitCueAtCaret: (
    cueId: string,
    segIndex: number,
    charOffset: number,
    time: number,
  ) => void;
  insertShotSplit: (
    cueId: string,
    segIndex: number,
    charOffset: number,
  ) => void;
  insertCueAtPlayhead: (
    time: number,
    duration?: number,
    maxTime?: number,
  ) => string | null;
  deleteCue: (cueId: string) => void;

  // speakers
  renameSpeaker: (id: string, name: string) => void;
  setSpeakerColor: (id: string, color: string) => void;
  addSpeaker: (name: string) => Speaker;
  removeSpeaker: (id: string) => boolean;

  // settings
  setProjectName: (name: string) => void;
  setStartTimecode: (timecode: string) => void;
  setReferenceStartSeconds: (seconds: number) => void;
  /** Bind timeline identity (duration + frame rate) from the loaded video. */
  setVideoIdentity: (video: VideoIdentity) => void;
  /** Update stored video filename hints when the loaded file name differs (not dirty). */
  syncVideoNameFromFile: (fileName: string) => void;
}

function mapCue(
  project: Project,
  cueId: string,
  fn: (cue: Cue) => Cue,
): Project {
  return {
    ...project,
    cues: project.cues.map((c) => (c.id === cueId ? fn(c) : c)),
  };
}

function findCue(project: Project, cueId: string): Cue | undefined {
  return project.cues.find((c) => c.id === cueId);
}

/**
 * Repair the single group boundary at `index` so the invariant
 * `cues[index - 1].end === cues[index].start` holds for a joined cue (see
 * {@link syncJoinedCueStartAt}). Called by the specific action that moved a
 * cue's `end` or position — no global scan needed since the fix can't cascade.
 * Returns the same project reference when nothing needed fixing.
 */
function reabut(project: Project, index: number): Project {
  const cues = syncJoinedCueStartAt(project.cues, index);
  return cues === project.cues ? project : { ...project, cues };
}

/**
 * Reverse of {@link reabut}: pull the predecessor's Out to the joined cue at
 * `index` (its In is authoritative). Used when the shared group boundary is
 * dragged from the follower's In. Same project reference when nothing changed.
 */
function reabutPrev(project: Project, index: number): Project {
  const cues = syncPrevCueEndAt(project.cues, index);
  return cues === project.cues ? project : { ...project, cues };
}

function cueIsLocked(project: Project, cueId: string): boolean {
  const cue = findCue(project, cueId);
  return cue !== undefined && isReviewedCueLocked(cue);
}

function invalidCueCount(cues: Cue[], referenceStartSeconds: number): number {
  if (referenceStartSeconds <= 0) return 0;
  return cues.filter((c) => c.start < referenceStartSeconds).length;
}

function clearReviewedOnInvalidCues(project: Project): Project {
  if (project.referenceStartSeconds <= 0) return project;
  let changed = false;
  const cues = project.cues.map((cue) => {
    if (!isCueBeforeReferenceStart(cue, project) || !cue.reviewed) return cue;
    changed = true;
    return { ...cue, reviewed: false };
  });
  return changed ? { ...project, cues } : project;
}

function clampCueStart(
  cue: Cue,
  start: number,
  prev: Cue | undefined,
  project: Project,
): number {
  const gap = frameStep(project);
  // A joined cue shares its In with the predecessor's Out (a group boundary):
  // it may slide left into the predecessor (whose Out follows), down to one
  // frame after the predecessor's own In. A normal cue stops at prev.end.
  const min =
    cue.joinedToPrev && prev
      ? Math.max(minCueStartSeconds(project), prev.start + gap)
      : minCueStartSeconds(project, prev?.end);
  const max = cue.end - gap;
  if (min > max) return cue.start;
  return Math.min(Math.max(min, start), max);
}

function clampCueEnd(
  cue: Cue,
  end: number,
  next: Cue | undefined,
  project: Project,
): number {
  const gap = frameStep(project);
  const min = cue.start + gap;
  // A joined follower shares this boundary: the Out may grow into it (the
  // follower's In follows), up to one frame before the follower's own Out. A
  // normal next cue is a hard wall at its In.
  const max = next
    ? next.joinedToPrev
      ? next.end - gap
      : next.start
    : Infinity;
  if (min > max) return cue.end;
  return Math.min(Math.max(min, end), max);
}

/** Move a cue as a block — keeps duration unless neighbors leave no room. */
function clampCueMove(
  cue: Cue,
  start: number,
  end: number,
  prev: Cue | undefined,
  next: Cue | undefined,
  project: Project,
): { start: number; end: number } {
  const gap = frameStep(project);
  const duration = end - start;
  if (duration < gap) return { start: cue.start, end: cue.end };

  const minStart = minCueStartSeconds(project, prev?.end);
  const maxEnd = next ? next.start : Infinity;

  let newStart = start;
  let newEnd = end;

  if (newStart < minStart) {
    newStart = minStart;
    newEnd = newStart + duration;
  }
  if (newEnd > maxEnd) {
    newEnd = maxEnd;
    newStart = newEnd - duration;
  }
  if (newStart < minStart) {
    newStart = minStart;
    newEnd = Math.min(newStart + duration, maxEnd);
  }

  newStart = Math.max(minCueStartSeconds(project), newStart);
  if (newEnd - newStart < gap) return { start: cue.start, end: cue.end };
  return { start: newStart, end: newEnd };
}

/** Cap the in-memory undo stack so long sessions don't grow unbounded. */
const HISTORY_LIMIT = 200;
/** Consecutive edits with the same tag within this window collapse into one step. */
const COALESCE_MS = 800;

function snapshot(state: ProjectState): HistoryEntry {
  return {
    project: state.project as Project,
    selectedCueId: state.selectedCueId,
    selectedSegment: state.selectedSegment,
  };
}

export const useProject = create<ProjectState>((set, getState) => {
  // Coalescing bookkeeping (lives for the store's lifetime). When several edits
  // share a tag in quick succession (e.g. typing into one segment) we keep the
  // single snapshot taken before the first edit instead of one per keystroke.
  let lastTag: string | null = null;
  let lastTagAt = 0;

  /**
   * Apply an immutable transform to the project, recording it on the undo
   * stack. `tag` enables coalescing of rapid same-target edits; pass null (the
   * default) for discrete actions that should each be their own undo step.
   */
  const update = (fn: (p: Project) => Project, tag: string | null = null) =>
    set((state) => {
      if (!state.project) return state;
      const next = fn(state.project);
      // No-op transforms shouldn't pollute history.
      if (next === state.project) return state;

      const now = Date.now();
      const coalesce =
        tag !== null && tag === lastTag && now - lastTagAt < COALESCE_MS;
      lastTag = tag;
      lastTagAt = now;

      const past = coalesce ? state.past : [...state.past, snapshot(state)];
      if (past.length > HISTORY_LIMIT) past.shift();

      return { project: next, dirty: true, past, future: [] };
    });

  return {
    project: null,
    selectedCueId: null,
    selectedSegment: 0,
    dirty: false,
    lastSavedAt: null,
    past: [],
    future: [],

    loadProject: (project) => {
      lastTag = null;
      set({
        project,
        selectedCueId: project.cues[0]?.id ?? null,
        selectedSegment: 0,
        dirty: false,
        lastSavedAt: null,
        past: [],
        future: [],
      });
    },
    clearProject: () => {
      lastTag = null;
      set({
        project: null,
        selectedCueId: null,
        selectedSegment: 0,
        dirty: false,
        lastSavedAt: null,
        past: [],
        future: [],
      });
    },
    markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

    undo: () =>
      set((state) => {
        if (!state.project || state.past.length === 0) return state;
        lastTag = null;
        const previous = state.past[state.past.length - 1];
        return {
          project: previous.project,
          selectedCueId: previous.selectedCueId,
          selectedSegment: previous.selectedSegment,
          past: state.past.slice(0, -1),
          future: [snapshot(state), ...state.future],
          dirty: true,
        };
      }),
    redo: () =>
      set((state) => {
        if (!state.project || state.future.length === 0) return state;
        lastTag = null;
        const next = state.future[0];
        return {
          project: next.project,
          selectedCueId: next.selectedCueId,
          selectedSegment: next.selectedSegment,
          past: [...state.past, snapshot(state)],
          future: state.future.slice(1),
          dirty: true,
        };
      }),
    restoreProject: (project) =>
      set((state) => {
        if (!state.project) return state;
        lastTag = null;
        const keep = project.cues.some((c) => c.id === state.selectedCueId);
        const past = [...state.past, snapshot(state)];
        if (past.length > HISTORY_LIMIT) past.shift();
        return {
          project,
          selectedCueId: keep
            ? state.selectedCueId
            : (project.cues[0]?.id ?? null),
          selectedSegment: 0,
          past,
          future: [],
          dirty: true,
        };
      }),

    selectCue: (id) => set({ selectedCueId: id, selectedSegment: 0 }),
    selectSegment: (index) => set({ selectedSegment: Math.max(0, index) }),

    setSegmentText: (cueId, segIndex, text) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update(
        (proj) => mapCue(proj, cueId, (c) => setCueText(c, text)),
        `text:${cueId}:${segIndex}`,
      );
    },

    replaceSegmentTexts: (updates) =>
      update((p) => {
        const byCue = new Map<string, string>();
        for (const u of updates) {
          if (!cueIsLocked(p, u.cueId)) byCue.set(u.cueId, u.text);
        }
        if (byCue.size === 0) return p;
        let changed = false;
        const cues = p.cues.map((c) => {
          const text = byCue.get(c.id);
          if (text === undefined) return c;
          const updated = setCueText(c, text);
          if (updated !== c) changed = true;
          return updated;
        });
        return changed ? { ...p, cues } : p;
      }),

    setCueStart: (cueId, time) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const idx = proj.cues.findIndex((c) => c.id === cueId);
        if (idx === -1) return proj;
        const c = proj.cues[idx];
        const start = clampCueStart(
          c,
          snapToFrame(time, proj),
          proj.cues[idx - 1],
          proj,
        );
        if (start === c.start) return proj;
        // For a joined cue the In is the shared group boundary — dragging it
        // pulls the predecessor's Out along.
        const withStart = mapCue(proj, cueId, (cue) =>
          applyCueStartChange(cue, start),
        );
        return reabutPrev(withStart, idx);
      }, `start:${cueId}`);
    },
    setCueEnd: (cueId, time) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const idx = proj.cues.findIndex((c) => c.id === cueId);
        if (idx === -1) return proj;
        const c = proj.cues[idx];
        const end = clampCueEnd(
          c,
          snapToFrame(time, proj),
          proj.cues[idx + 1],
          proj,
        );
        if (end === c.end) return proj;
        // Moving this cue's Out may open a gap before a joined follower.
        const withEnd = mapCue(proj, cueId, (cue) =>
          applyCueEndChange(cue, end),
        );
        return reabut(withEnd, idx + 1);
      }, `end:${cueId}`);
    },
    setCueTimes: (cueId, start, end) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const idx = proj.cues.findIndex((c) => c.id === cueId);
        if (idx === -1) return proj;
        const c = proj.cues[idx];
        const next = clampCueMove(
          c,
          snapToFrame(start, proj),
          snapToFrame(end, proj),
          proj.cues[idx - 1],
          proj.cues[idx + 1],
          proj,
        );
        if (next.start === c.start && next.end === c.end) return proj;
        const moved = mapCue(proj, cueId, (cue) =>
          applyCueBlockMove(cue, next.start, next.end),
        );
        // Pin the moved cue itself if it is joined, and re-abut a joined follower.
        return reabut(reabut(moved, idx), idx + 1);
      }, `move:${cueId}`);
    },
    nudgeCueStart: (cueId, deltaFrames) => {
      const p = getState().project;
      const c = p?.cues.find((x) => x.id === cueId);
      if (!c || !p) return;
      getState().setCueStart(cueId, c.start + deltaFrames * frameStep(p));
    },
    nudgeCueEnd: (cueId, deltaFrames) => {
      const p = getState().project;
      const c = p?.cues.find((x) => x.id === cueId);
      if (!c || !p) return;
      getState().setCueEnd(cueId, c.end + deltaFrames * frameStep(p));
    },

    setCueSpeaker: (cueId, speakerId) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => mapCue(proj, cueId, (c) => ({ ...c, speakerId })));
    },
    toggleJoinedToPrev: (cueId) => {
      const p = getState().project;
      if (!p) return;
      const idx = p.cues.findIndex((c) => c.id === cueId);
      // A cue can only join the one before it — the first cue has no predecessor.
      if (idx <= 0) return;
      // Joining moves timing on both cues, so require both to be unlocked.
      if (cueIsLocked(p, cueId) || isReviewedCueLocked(p.cues[idx - 1])) return;

      update((proj) => {
        const i = proj.cues.findIndex((c) => c.id === cueId);
        if (i <= 0) return proj;
        const follower = proj.cues[i];
        const prev = proj.cues[i - 1];
        const cues = proj.cues.slice();

        if (follower.joinedToPrev) {
          // Unjoin: drop the link only. The two cues already abut, so their
          // shared boundary simply stops staying in sync.
          cues[i] = { ...follower, joinedToPrev: false };
          return { ...proj, cues };
        }

        // Join: seat the shared boundary at the word-gap midpoint, snapped to
        // the frame grid and kept one frame inside the merged span so neither
        // cue collapses.
        const gap = frameStep(proj);
        const min = prev.start + gap;
        const max = follower.end - gap;
        if (min > max) return proj;
        const boundary = Math.min(
          Math.max(snapToFrame(joinBoundaryTime(prev, follower), proj), min),
          max,
        );
        cues[i - 1] = applyCueEndChange(prev, boundary);
        cues[i] = {
          ...applyCueStartChange(follower, boundary),
          joinedToPrev: true,
        };
        return { ...proj, cues };
      });
    },
    setSegmentShot: (cueId, _segIndex, shot) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => mapCue(proj, cueId, (c) => setCueShot(c, shot)));
    },
    cycleSegmentShot: (cueId, _segIndex) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const order = proj.shots.map((s) => s.id);
        const cue = findCue(proj, cueId);
        if (!cue) return proj;
        const current = cue.shot || proj.defaultShot;
        const next = order[(order.indexOf(current) + 1) % order.length]!;
        return mapCue(proj, cueId, (c) => setCueShot(c, next));
      });
    },
    toggleReviewed: (cueId) =>
      update((p) => {
        const cue = findCue(p, cueId);
        if (!cue || isCueBeforeReferenceStart(cue, p)) return p;
        return mapCue(p, cueId, (c) => ({ ...c, reviewed: !c.reviewed }));
      }),

    splitCueAtCaret: (cueId, _segIndex, charOffset, _time) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const idx = proj.cues.findIndex((c) => c.id === cueId);
        if (idx === -1) return proj;
        const result = splitCueAtCaretOffset(proj.cues[idx], charOffset, newId);
        if (!result) return proj;
        const [left, right] = result;
        const cues = [
          ...proj.cues.slice(0, idx),
          left,
          right,
          ...proj.cues.slice(idx + 1),
        ];
        return { ...proj, cues };
      });
    },

    // Split the cue at the caret into a joined run whose second half takes the
    // next shot — the in-app equivalent of a delivery-sheet " / " cut.
    insertShotSplit: (cueId, _segIndex, charOffset) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const idx = proj.cues.findIndex((c) => c.id === cueId);
        if (idx === -1) return proj;
        const c = proj.cues[idx];
        const result = splitCueAtCaretOffset(c, charOffset, newId);
        if (!result) return proj;
        const order = proj.shots.map((s) => s.id);
        const current = c.shot || proj.defaultShot;
        const nextShot = order[(order.indexOf(current) + 1) % order.length]!;
        const [left, right] = result;
        const joinedRight: Cue = {
          ...right,
          joinedToPrev: true,
          shot: nextShot,
        };
        const cues = [
          ...proj.cues.slice(0, idx),
          left,
          joinedRight,
          ...proj.cues.slice(idx + 1),
        ];
        return { ...proj, cues };
      });
    },

    insertCueAtPlayhead: (
      time,
      duration = DEFAULT_CUE_DURATION,
      maxTime = Infinity,
    ) => {
      let insertedId: string | null = null;
      set((state) => {
        if (!state.project) return state;
        const p = state.project;
        const minStart = minCueStartSeconds(p);
        const range = computeInsertCueRange(
          p.cues,
          Math.max(minStart, time),
          duration,
          maxTime,
          minStart,
        );
        if (!range) return state;

        const { start, end } = range;
        const insertIdx = findInsertCueIndex(p.cues, start);

        insertedId = newId();
        const newCue: Cue = {
          id: insertedId,
          start,
          end,
          speakerId: null,
          reviewed: false,
          ...newCueAtPlayhead(start, end, p.defaultShot),
        };

        const cues = [
          ...p.cues.slice(0, insertIdx),
          newCue,
          ...p.cues.slice(insertIdx),
        ];
        const project = { ...p, cues };

        lastTag = null;
        const past = [...state.past, snapshot(state)];
        if (past.length > HISTORY_LIMIT) past.shift();

        return {
          project,
          selectedCueId: insertedId,
          selectedSegment: 0,
          dirty: true,
          past,
          future: [],
        };
      });
      return insertedId;
    },

    deleteCue: (cueId) =>
      set((state) => {
        if (!state.project) return state;
        if (cueIsLocked(state.project, cueId)) return state;
        const idx = state.project.cues.findIndex((c) => c.id === cueId);
        if (idx === -1) return state;

        const deleted = state.project.cues[idx];
        const cues = [
          ...state.project.cues.slice(0, idx),
          ...state.project.cues.slice(idx + 1),
        ];
        // Deleting a group's head orphans the cue that was joined to it: its new
        // predecessor is an unrelated cue (or none), so break the link and let
        // it become a standalone/head cue. A joined cue deleted from the middle
        // leaves its follower validly joined to the earlier group member.
        if (!deleted.joinedToPrev && cues[idx]?.joinedToPrev) {
          cues[idx] = { ...cues[idx], joinedToPrev: false };
        }
        // The follower (now at idx) may need re-abutting to its new predecessor
        // (middle-of-group delete); a detached head was already cleared above.
        const project = reabut({ ...state.project, cues }, idx);
        const nextSelected = cues[Math.min(idx, cues.length - 1)]?.id ?? null;

        lastTag = null;
        const past = [...state.past, snapshot(state)];
        if (past.length > HISTORY_LIMIT) past.shift();

        return {
          project,
          selectedCueId: nextSelected,
          selectedSegment: 0,
          dirty: true,
          past,
          future: [],
        };
      }),

    renameSpeaker: (id, name) =>
      update(
        (p) => ({
          ...p,
          speakers: p.speakers.map((s) => (s.id === id ? { ...s, name } : s)),
        }),
        `rename:${id}`,
      ),
    setSpeakerColor: (id, color) =>
      update(
        (p) => ({
          ...p,
          speakers: p.speakers.map((s) => (s.id === id ? { ...s, color } : s)),
        }),
        `color:${id}`,
      ),
    addSpeaker: (name) => {
      const count = getState().project?.speakers.length ?? 0;
      const speaker: Speaker = {
        id: newId(),
        name,
        color: SPEAKER_PALETTE[count % SPEAKER_PALETTE.length],
      };
      update((p) => ({ ...p, speakers: [...p.speakers, speaker] }));
      return speaker;
    },
    removeSpeaker: (id) => {
      const project = getState().project;
      if (!project || !project.speakers.some((s) => s.id === id)) return false;
      if (isSpeakerReferenced(project, id)) return false;
      update((p) => ({
        ...p,
        speakers: p.speakers.filter((s) => s.id !== id),
      }));
      return true;
    },

    setProjectName: (name) =>
      update(
        (p) => ({ ...p, name: resolveProjectName(name, p.videoName) }),
        "project-name",
      ),

    setStartTimecode: (timecode) =>
      update((p) => {
        if (p.startTimecode === timecode) return p;
        return { ...p, startTimecode: timecode };
      }, "start-timecode"),
    setReferenceStartSeconds: (seconds) => {
      const referenceStartSeconds = Math.max(0, seconds);
      let invalidCount = 0;

      update((p) => {
        if (p.referenceStartSeconds === referenceStartSeconds) return p;
        invalidCount = invalidCueCount(p.cues, referenceStartSeconds);
        const next = clearReviewedOnInvalidCues({
          ...p,
          referenceStartSeconds,
        });
        return next;
      }, "reference-start");

      if (invalidCount > 0) {
        useReferenceStartNoticeStore.getState().notifyInvalidCues(invalidCount);
      }
    },
    syncVideoNameFromFile: (fileName) =>
      set((state) => {
        if (!state.project || state.project.videoName === fileName)
          return state;
        const video = state.project.video
          ? { ...state.project.video, fileName }
          : state.project.video;
        return {
          project: {
            ...state.project,
            videoName: fileName,
            video,
          },
        };
      }),
    setVideoIdentity: (video) =>
      update(
        (p) => ({
          ...p,
          video,
          ...(video.frameRateNumerator != null &&
          video.frameRateDenominator != null
            ? {
                fpsNumerator: video.frameRateNumerator,
                fpsDenominator: video.frameRateDenominator,
              }
            : {}),
        }),
        "video",
      ),
  };
});
