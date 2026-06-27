import { create } from 'zustand'
import type { Cue, Project, Segment, ShotId, Speaker, VideoIdentity, Word } from '../types'
import { computeInsertCueRange, findInsertCueIndex } from '../lib/cue-insert'
import { splitTimeAtSegment } from '../lib/segment-timing'

const EPS = 0.001
const DEFAULT_CUE_DURATION = 2

const SPEAKER_PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080',
  '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000',
  '#ffd8b1', '#000075', '#a9a9a9',
]

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function splitWordsAtTime(words: Word[] | undefined, t: number): [Word[] | undefined, Word[] | undefined] {
  if (!words) return [undefined, undefined]
  const left = words.filter((w) => w.start < t)
  const right = words.filter((w) => w.start >= t)
  return [left, right]
}

function stripMergeMeta(seg: Segment): Segment {
  const { mergedWithPrevious: _m, mergedSpeakerId: _s, ...rest } = seg
  return rest
}

/** One reversible step: the project plus the selection at that moment. */
interface HistoryEntry {
  project: Project
  selectedCueId: string | null
  selectedSegment: number
}

interface ProjectState {
  project: Project | null
  selectedCueId: string | null
  /** Active segment within the selected cue (for shot assignment / splitting). */
  selectedSegment: number
  dirty: boolean
  lastSavedAt: number | null

  /** Undo stack (oldest first); the last entry is what `undo` restores to. */
  past: HistoryEntry[]
  /** Redo stack (next entry first). */
  future: HistoryEntry[]

  loadProject: (project: Project) => void
  clearProject: () => void
  markSaved: () => void

  /** Step backward / forward through the in-session edit history. */
  undo: () => void
  redo: () => void
  /** Replace the whole project (e.g. restoring a saved version); undoable. */
  restoreProject: (project: Project) => void

  selectCue: (id: string | null) => void
  selectSegment: (index: number) => void

  // cue text / timing
  setSegmentText: (cueId: string, segIndex: number, text: string) => void
  setCueStart: (cueId: string, time: number) => void
  setCueEnd: (cueId: string, time: number) => void
  /** Set In and Out together (e.g. dragging a cue on the timeline). */
  setCueTimes: (cueId: string, start: number, end: number) => void
  nudgeCueStart: (cueId: string, delta: number) => void
  nudgeCueEnd: (cueId: string, delta: number) => void

  // metadata
  setCueSpeaker: (cueId: string, speakerId: string | null) => void
  setSegmentShot: (cueId: string, segIndex: number, shot: ShotId) => void
  cycleSegmentShot: (cueId: string, segIndex: number) => void
  toggleReviewed: (cueId: string) => void

  // structural ops
  splitCueAtCaret: (cueId: string, segIndex: number, charOffset: number, time: number) => void
  mergeWithNext: (cueId: string) => void
  splitAtMergedSegment: (cueId: string, segIndex: number) => void
  insertShotSplit: (cueId: string, segIndex: number, charOffset: number) => void
  removeShotSplit: (cueId: string, segIndex: number) => void
  insertCueAtPlayhead: (time: number, duration?: number, maxTime?: number) => string | null
  deleteCue: (cueId: string) => void

  // speakers
  renameSpeaker: (id: string, name: string) => void
  setSpeakerColor: (id: string, color: string) => void
  addSpeaker: (name: string) => Speaker

  // settings
  setTimecodeOffset: (offset: string) => void
  setContentStartSeconds: (seconds: number) => void
  setFps: (fps: number) => void
  /** Bind timeline identity (duration + frame rate) from the loaded movie. */
  setVideoIdentity: (video: VideoIdentity) => void
}

function mapCue(project: Project, cueId: string, fn: (cue: Cue) => Cue): Project {
  return { ...project, cues: project.cues.map((c) => (c.id === cueId ? fn(c) : c)) }
}

function clampCueStart(cue: Cue, time: number, prev: Cue | undefined): number {
  const min = prev ? prev.end : 0
  const max = cue.end - EPS
  if (min > max) return cue.start
  return Math.min(Math.max(min, time), max)
}

function clampCueEnd(cue: Cue, time: number, next: Cue | undefined): number {
  const min = cue.start + EPS
  const max = next ? next.start : Infinity
  if (min > max) return cue.end
  return Math.min(Math.max(min, time), max)
}

/** Move a cue as a block — keeps duration unless neighbors leave no room. */
function clampCueMove(
  cue: Cue,
  start: number,
  end: number,
  prev: Cue | undefined,
  next: Cue | undefined,
): { start: number; end: number } {
  const duration = end - start
  if (duration <= EPS) return { start: cue.start, end: cue.end }

  const minStart = prev ? prev.end : 0
  const maxEnd = next ? next.start : Infinity

  let newStart = start
  let newEnd = end

  if (newStart < minStart) {
    newStart = minStart
    newEnd = newStart + duration
  }
  if (newEnd > maxEnd) {
    newEnd = maxEnd
    newStart = newEnd - duration
  }
  if (newStart < minStart) {
    newStart = minStart
    newEnd = Math.min(newStart + duration, maxEnd)
  }

  newStart = Math.max(0, newStart)
  if (newEnd - newStart <= EPS) return { start: cue.start, end: cue.end }
  return { start: newStart, end: newEnd }
}

/** Cap the in-memory undo stack so long sessions don't grow unbounded. */
const HISTORY_LIMIT = 200
/** Consecutive edits with the same tag within this window collapse into one step. */
const COALESCE_MS = 800

function snapshot(state: ProjectState): HistoryEntry {
  return {
    project: state.project as Project,
    selectedCueId: state.selectedCueId,
    selectedSegment: state.selectedSegment,
  }
}

export const useProject = create<ProjectState>((set, getState) => {
  // Coalescing bookkeeping (lives for the store's lifetime). When several edits
  // share a tag in quick succession (e.g. typing into one segment) we keep the
  // single snapshot taken before the first edit instead of one per keystroke.
  let lastTag: string | null = null
  let lastTagAt = 0

  /**
   * Apply an immutable transform to the project, recording it on the undo
   * stack. `tag` enables coalescing of rapid same-target edits; pass null (the
   * default) for discrete actions that should each be their own undo step.
   */
  const update = (fn: (p: Project) => Project, tag: string | null = null) =>
    set((state) => {
      if (!state.project) return state
      const next = fn(state.project)
      // No-op transforms (e.g. invalid merge/split) shouldn't pollute history.
      if (next === state.project) return state

      const now = Date.now()
      const coalesce = tag !== null && tag === lastTag && now - lastTagAt < COALESCE_MS
      lastTag = tag
      lastTagAt = now

      const past = coalesce ? state.past : [...state.past, snapshot(state)]
      if (past.length > HISTORY_LIMIT) past.shift()

      return { project: next, dirty: true, past, future: [] }
    })

  return {
    project: null,
    selectedCueId: null,
    selectedSegment: 0,
    dirty: false,
    lastSavedAt: null,
    past: [],
    future: [],

    loadProject: (project) => {
      lastTag = null
      set({
        project,
        selectedCueId: project.cues[0]?.id ?? null,
        selectedSegment: 0,
        dirty: false,
        lastSavedAt: null,
        past: [],
        future: [],
      })
    },
    clearProject: () => {
      lastTag = null
      set({
        project: null,
        selectedCueId: null,
        selectedSegment: 0,
        dirty: false,
        lastSavedAt: null,
        past: [],
        future: [],
      })
    },
    markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

    undo: () =>
      set((state) => {
        if (!state.project || state.past.length === 0) return state
        lastTag = null
        const previous = state.past[state.past.length - 1]
        return {
          project: previous.project,
          selectedCueId: previous.selectedCueId,
          selectedSegment: previous.selectedSegment,
          past: state.past.slice(0, -1),
          future: [snapshot(state), ...state.future],
          dirty: true,
        }
      }),
    redo: () =>
      set((state) => {
        if (!state.project || state.future.length === 0) return state
        lastTag = null
        const next = state.future[0]
        return {
          project: next.project,
          selectedCueId: next.selectedCueId,
          selectedSegment: next.selectedSegment,
          past: [...state.past, snapshot(state)],
          future: state.future.slice(1),
          dirty: true,
        }
      }),
    restoreProject: (project) =>
      set((state) => {
        if (!state.project) return state
        lastTag = null
        const keep = project.cues.some((c) => c.id === state.selectedCueId)
        const past = [...state.past, snapshot(state)]
        if (past.length > HISTORY_LIMIT) past.shift()
        return {
          project,
          selectedCueId: keep ? state.selectedCueId : (project.cues[0]?.id ?? null),
          selectedSegment: 0,
          past,
          future: [],
          dirty: true,
        }
      }),

    selectCue: (id) => set({ selectedCueId: id, selectedSegment: 0 }),
    selectSegment: (index) => set({ selectedSegment: Math.max(0, index) }),

    setSegmentText: (cueId, segIndex, text) =>
      update(
        (p) =>
          mapCue(p, cueId, (c) => ({
            ...c,
            segments: c.segments.map((s, i) => (i === segIndex ? { ...s, text } : s)),
          })),
        `text:${cueId}:${segIndex}`,
      ),

    setCueStart: (cueId, time) =>
      update((p) => {
        const idx = p.cues.findIndex((c) => c.id === cueId)
        if (idx === -1) return p
        const c = p.cues[idx]
        const start = clampCueStart(c, time, p.cues[idx - 1])
        if (start === c.start) return p
        return mapCue(p, cueId, (cue) => ({ ...cue, start }))
      }, `start:${cueId}`),
    setCueEnd: (cueId, time) =>
      update((p) => {
        const idx = p.cues.findIndex((c) => c.id === cueId)
        if (idx === -1) return p
        const c = p.cues[idx]
        const end = clampCueEnd(c, time, p.cues[idx + 1])
        if (end === c.end) return p
        return mapCue(p, cueId, (cue) => ({ ...cue, end }))
      }, `end:${cueId}`),
    setCueTimes: (cueId, start, end) =>
      update((p) => {
        const idx = p.cues.findIndex((c) => c.id === cueId)
        if (idx === -1) return p
        const c = p.cues[idx]
        const next = clampCueMove(c, start, end, p.cues[idx - 1], p.cues[idx + 1])
        if (next.start === c.start && next.end === c.end) return p
        return mapCue(p, cueId, (cue) => ({ ...cue, start: next.start, end: next.end }))
      }, `move:${cueId}`),
    nudgeCueStart: (cueId, delta) => {
      const c = getState().project?.cues.find((x) => x.id === cueId)
      if (c) getState().setCueStart(cueId, c.start + delta)
    },
    nudgeCueEnd: (cueId, delta) => {
      const c = getState().project?.cues.find((x) => x.id === cueId)
      if (c) getState().setCueEnd(cueId, c.end + delta)
    },

    setCueSpeaker: (cueId, speakerId) =>
      update((p) => mapCue(p, cueId, (c) => ({ ...c, speakerId, multiSpeaker: false }))),
    setSegmentShot: (cueId, segIndex, shot) =>
      update((p) =>
        mapCue(p, cueId, (c) => ({
          ...c,
          segments: c.segments.map((s, i) => (i === segIndex ? { ...s, shot } : s)),
        })),
      ),
    cycleSegmentShot: (cueId, segIndex) =>
      update((p) => {
        const order = p.shots.map((s) => s.id)
        return mapCue(p, cueId, (c) => ({
          ...c,
          segments: c.segments.map((s, i) => {
            if (i !== segIndex) return s
            const next = order[(order.indexOf(s.shot) + 1) % order.length]
            return { ...s, shot: next }
          }),
        }))
      }),
    toggleReviewed: (cueId) =>
      update((p) => mapCue(p, cueId, (c) => ({ ...c, reviewed: !c.reviewed }))),

    splitCueAtCaret: (cueId, segIndex, charOffset, time) =>
      update((p) => {
        const idx = p.cues.findIndex((c) => c.id === cueId)
        if (idx === -1) return p
        const c = p.cues[idx]
        const t = time > c.start + EPS && time < c.end - EPS ? time : (c.start + c.end) / 2

        const seg = c.segments[segIndex]
        const before = c.segments.slice(0, segIndex)
        const after = c.segments.slice(segIndex + 1)
        const leftSeg: Segment = { text: seg.text.slice(0, charOffset).trim(), shot: seg.shot }
        const rightSeg: Segment = { text: seg.text.slice(charOffset).trim(), shot: seg.shot }

        const leftSegments = [...before, leftSeg].filter((s) => s.text.length > 0)
        const rightSegments = [rightSeg, ...after].filter((s) => s.text.length > 0)
        if (leftSegments.length === 0 || rightSegments.length === 0) return p

        const [lw, rw] = splitWordsAtTime(c.words, t)
        const left: Cue = { ...c, end: t, segments: leftSegments, words: lw, reviewed: false }
        const right: Cue = {
          ...c,
          id: newId(),
          start: t,
          segments: rightSegments,
          words: rw,
          reviewed: false,
        }
        const cues = [...p.cues.slice(0, idx), left, right, ...p.cues.slice(idx + 1)]
        return { ...p, cues }
      }),

    mergeWithNext: (cueId) =>
      update((p) => {
        const idx = p.cues.findIndex((c) => c.id === cueId)
        if (idx === -1 || idx === p.cues.length - 1) return p
        const a = p.cues[idx]
        const b = p.cues[idx + 1]
        const merged: Cue = {
          ...a,
          end: b.end,
          segments: [
            ...a.segments,
            ...b.segments.map((s, i) =>
              i === 0 ? { ...s, mergedWithPrevious: true, mergedSpeakerId: b.speakerId ?? null } : s,
            ),
          ],
          words: a.words || b.words ? [...(a.words ?? []), ...(b.words ?? [])] : undefined,
          reviewed: false,
          multiSpeaker: a.multiSpeaker || b.multiSpeaker,
        }
        const cues = [...p.cues.slice(0, idx), merged, ...p.cues.slice(idx + 2)]
        return { ...p, cues }
      }),

    splitAtMergedSegment: (cueId, segIndex) =>
      set((state) => {
        if (!state.project) return state
        const idx = state.project.cues.findIndex((c) => c.id === cueId)
        if (idx === -1) return state
        const c = state.project.cues[idx]
        const seg = c.segments[segIndex]
        if (!seg?.mergedWithPrevious || segIndex <= 0) return state

        const t = splitTimeAtSegment(c, segIndex)
        const leftSegments = c.segments.slice(0, segIndex).map(stripMergeMeta)
        const rightSegments = c.segments.slice(segIndex).map(stripMergeMeta)
        const [lw, rw] = splitWordsAtTime(c.words, t)
        const rightId = newId()

        const left: Cue = { ...c, end: t, segments: leftSegments, words: lw, reviewed: false }
        const right: Cue = {
          ...c,
          id: rightId,
          start: t,
          end: c.end,
          speakerId: seg.mergedSpeakerId ?? c.speakerId,
          segments: rightSegments,
          words: rw,
          reviewed: false,
        }

        const cues = [...state.project.cues.slice(0, idx), left, right, ...state.project.cues.slice(idx + 1)]
        const project = { ...state.project, cues }

        lastTag = null
        const past = [...state.past, snapshot(state)]
        if (past.length > HISTORY_LIMIT) past.shift()

        return {
          project,
          selectedCueId: rightId,
          selectedSegment: 0,
          dirty: true,
          past,
          future: [],
        }
      }),

    insertShotSplit: (cueId, segIndex, charOffset) =>
      update((p) => {
        const order = p.shots.map((s) => s.id)
        return mapCue(p, cueId, (c) => {
          const seg = c.segments[segIndex]
          const leftText = seg.text.slice(0, charOffset).trim()
          const rightText = seg.text.slice(charOffset).trim()
          if (!leftText || !rightText) return c
          const nextShot = order[(order.indexOf(seg.shot) + 1) % order.length]
          const segments = [
            ...c.segments.slice(0, segIndex),
            { text: leftText, shot: seg.shot },
            { text: rightText, shot: nextShot },
            ...c.segments.slice(segIndex + 1),
          ]
          return { ...c, segments }
        })
      }),

    removeShotSplit: (cueId, segIndex) =>
      update((p) =>
        mapCue(p, cueId, (c) => {
          if (segIndex <= 0 || segIndex >= c.segments.length) return c
          const prev = c.segments[segIndex - 1]
          const cur = c.segments[segIndex]
          const merged: Segment = {
            text: `${prev.text} ${cur.text}`.trim(),
            shot: prev.shot,
            ...(cur.mergedWithPrevious
              ? { mergedWithPrevious: true, mergedSpeakerId: cur.mergedSpeakerId }
              : {}),
          }
          const segments = [
            ...c.segments.slice(0, segIndex - 1),
            merged,
            ...c.segments.slice(segIndex + 1),
          ]
          return { ...c, segments }
        }),
      ),

    insertCueAtPlayhead: (time, duration = DEFAULT_CUE_DURATION, maxTime = Infinity) => {
      let insertedId: string | null = null
      set((state) => {
        if (!state.project) return state
        const p = state.project
        const range = computeInsertCueRange(p.cues, Math.max(0, time), duration, maxTime)
        if (!range) return state

        const { start, end } = range
        const insertIdx = findInsertCueIndex(p.cues, start)

        insertedId = newId()
        const newCue: Cue = {
          id: insertedId,
          start,
          end,
          speakerId: null,
          segments: [{ text: '', shot: p.defaultShot }],
          reviewed: false,
        }

        const cues = [...p.cues.slice(0, insertIdx), newCue, ...p.cues.slice(insertIdx)]
        const project = { ...p, cues }

        lastTag = null
        const past = [...state.past, snapshot(state)]
        if (past.length > HISTORY_LIMIT) past.shift()

        return {
          project,
          selectedCueId: insertedId,
          selectedSegment: 0,
          dirty: true,
          past,
          future: [],
        }
      })
      return insertedId
    },

    deleteCue: (cueId) =>
      set((state) => {
        if (!state.project) return state
        const idx = state.project.cues.findIndex((c) => c.id === cueId)
        if (idx === -1) return state

        const cues = [...state.project.cues.slice(0, idx), ...state.project.cues.slice(idx + 1)]
        const project = { ...state.project, cues }
        const nextSelected = cues[Math.min(idx, cues.length - 1)]?.id ?? null

        lastTag = null
        const past = [...state.past, snapshot(state)]
        if (past.length > HISTORY_LIMIT) past.shift()

        return {
          project,
          selectedCueId: nextSelected,
          selectedSegment: 0,
          dirty: true,
          past,
          future: [],
        }
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
      const count = getState().project?.speakers.length ?? 0
      const speaker: Speaker = {
        id: newId(),
        name,
        color: SPEAKER_PALETTE[count % SPEAKER_PALETTE.length],
      }
      update((p) => ({ ...p, speakers: [...p.speakers, speaker] }))
      return speaker
    },

    setTimecodeOffset: (offset) => update((p) => ({ ...p, timecodeOffset: offset }), 'offset'),
    setContentStartSeconds: (seconds) =>
      update(
        (p) => ({
          ...p,
          contentStartSeconds: seconds <= 0 ? undefined : seconds,
        }),
        'program-start',
      ),
    setFps: (fps) => update((p) => ({ ...p, fps })),
    setVideoIdentity: (video) => update((p) => ({ ...p, video }), 'video'),
  }
})
