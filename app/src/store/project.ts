import { create } from "zustand";
import type {
  Cue,
  Project,
  Segment,
  ShotId,
  Speaker,
  VideoIdentity,
  Word,
} from "../types";
import { computeInsertCueRange, findInsertCueIndex } from "../lib/cue-insert";
import { isReviewedCueLocked } from "../lib/cue-lock";
import { frameStep, snapToFrame } from "../lib/cue-timing";
import {
  isCueBeforeReferenceStart,
  minCueStartSeconds,
} from "../lib/program-start";
import { isSpeakerReferenced } from "../lib/speaker-refs";
import { resolveProjectName } from "../lib/project-meta";
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

function splitWordsAtTime(
  words: Word[] | undefined,
  splitTime: number,
): [Word[] | undefined, Word[] | undefined] {
  if (!words) return [undefined, undefined];
  const left = words.filter((w) => w.start < splitTime);
  const right = words.filter((w) => w.start >= splitTime);
  return [left, right];
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
  const min = minCueStartSeconds(project, prev?.end);
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
  const max = next ? next.start : Infinity;
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
        (proj) =>
          mapCue(proj, cueId, (c) => ({
            ...c,
            segments: c.segments.map((s, i) =>
              i === segIndex ? { ...s, text } : s,
            ),
          })),
        `text:${cueId}:${segIndex}`,
      );
    },

    replaceSegmentTexts: (updates) =>
      update((p) => {
        const allowed = updates.filter((u) => !cueIsLocked(p, u.cueId));
        if (allowed.length === 0) return p;
        const lookup = new Map(
          allowed.map((u) => [`${u.cueId}:${u.segIndex}`, u.text] as const),
        );
        let changed = false;
        const cues = p.cues.map((c) => {
          if (cueIsLocked(p, c.id)) return c;
          let cueChanged = false;
          const segments = c.segments.map((s, i) => {
            const text = lookup.get(`${c.id}:${i}`);
            if (text === undefined || text === s.text) return s;
            cueChanged = true;
            return { ...s, text };
          });
          if (!cueChanged) return c;
          changed = true;
          return { ...c, segments };
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
        return mapCue(proj, cueId, (cue) => ({ ...cue, start }));
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
        return mapCue(proj, cueId, (cue) => ({ ...cue, end }));
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
        return mapCue(proj, cueId, (cue) => ({
          ...cue,
          start: next.start,
          end: next.end,
        }));
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
    setSegmentShot: (cueId, segIndex, shot) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) =>
        mapCue(proj, cueId, (c) => ({
          ...c,
          segments: c.segments.map((s, i) =>
            i === segIndex ? { ...s, shot } : s,
          ),
        })),
      );
    },
    cycleSegmentShot: (cueId, segIndex) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const order = proj.shots.map((s) => s.id);
        return mapCue(proj, cueId, (c) => ({
          ...c,
          segments: c.segments.map((s, i) => {
            if (i !== segIndex) return s;
            const next = order[(order.indexOf(s.shot) + 1) % order.length];
            return { ...s, shot: next };
          }),
        }));
      });
    },
    toggleReviewed: (cueId) =>
      update((p) => {
        const cue = findCue(p, cueId);
        if (!cue || isCueBeforeReferenceStart(cue, p)) return p;
        return mapCue(p, cueId, (c) => ({ ...c, reviewed: !c.reviewed }));
      }),

    splitCueAtCaret: (cueId, segIndex, charOffset, time) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const idx = proj.cues.findIndex((c) => c.id === cueId);
        if (idx === -1) return proj;
        const c = proj.cues[idx];
        const splitTime = snapToFrame(time, proj);
        const gap = frameStep(proj);
        const t =
          splitTime > c.start + gap && splitTime < c.end - gap
            ? splitTime
            : (c.start + c.end) / 2;

        const seg = c.segments[segIndex];
        const before = c.segments.slice(0, segIndex);
        const after = c.segments.slice(segIndex + 1);
        const leftSeg: Segment = {
          text: seg.text.slice(0, charOffset).trim(),
          shot: seg.shot,
        };
        const rightSeg: Segment = {
          text: seg.text.slice(charOffset).trim(),
          shot: seg.shot,
        };

        const leftSegments = [...before, leftSeg].filter(
          (s) => s.text.length > 0,
        );
        const rightSegments = [rightSeg, ...after].filter(
          (s) => s.text.length > 0,
        );
        if (leftSegments.length === 0 || rightSegments.length === 0)
          return proj;

        const [lw, rw] = splitWordsAtTime(c.words, t);
        const left: Cue = {
          ...c,
          end: t,
          segments: leftSegments,
          words: lw,
          reviewed: false,
        };
        const right: Cue = {
          ...c,
          id: newId(),
          start: t,
          segments: rightSegments,
          words: rw,
          reviewed: false,
        };
        const cues = [
          ...proj.cues.slice(0, idx),
          left,
          right,
          ...proj.cues.slice(idx + 1),
        ];
        return { ...proj, cues };
      });
    },

    insertShotSplit: (cueId, segIndex, charOffset) => {
      const p = getState().project;
      if (!p || cueIsLocked(p, cueId)) return;
      update((proj) => {
        const order = proj.shots.map((s) => s.id);
        return mapCue(proj, cueId, (c) => {
          const seg = c.segments[segIndex];
          const leftText = seg.text.slice(0, charOffset).trim();
          const rightText = seg.text.slice(charOffset).trim();
          if (!leftText || !rightText) return c;
          const nextShot = order[(order.indexOf(seg.shot) + 1) % order.length];
          const segments = [
            ...c.segments.slice(0, segIndex),
            { text: leftText, shot: seg.shot },
            { text: rightText, shot: nextShot },
            ...c.segments.slice(segIndex + 1),
          ];
          return { ...c, segments };
        });
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
          segments: [{ text: "", shot: p.defaultShot }],
          reviewed: false,
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

        const cues = [
          ...state.project.cues.slice(0, idx),
          ...state.project.cues.slice(idx + 1),
        ];
        const project = { ...state.project, cues };
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
