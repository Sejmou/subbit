import { create } from 'zustand'
import type { Cue, Project, Segment, ShotId, Speaker, Word } from '../types'

const EPS = 0.001

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

/** Infer a split time at the boundary before `segIndex`, using words when available. */
function splitTimeAtSegment(cue: Cue, segIndex: number): number {
  if (segIndex <= 0 || segIndex >= cue.segments.length) return cue.start

  const words = cue.words
  if (words && words.length > 0) {
    const weights = cue.segments.map((s) => s.text.length || 1)
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let wordIdx = 0
    for (let s = 0; s < segIndex; s++) {
      wordIdx += Math.round((weights[s] / totalWeight) * words.length)
    }
    wordIdx = Math.min(Math.max(wordIdx, 1), words.length)
    const t = words[wordIdx - 1]?.end ?? words[wordIdx]?.start ?? cue.start
    return Math.max(cue.start + EPS, Math.min(t, cue.end - EPS))
  }

  const totalChars = cue.segments.reduce((n, s) => n + s.text.length, 0) || 1
  const leftChars = cue.segments.slice(0, segIndex).reduce((n, s) => n + s.text.length, 0)
  const ratio = leftChars / totalChars
  return Math.max(
    cue.start + EPS,
    Math.min(cue.start + (cue.end - cue.start) * ratio, cue.end - EPS),
  )
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

  // speakers
  renameSpeaker: (id: string, name: string) => void
  setSpeakerColor: (id: string, color: string) => void
  addSpeaker: (name: string) => Speaker

  // settings
  setTimecodeOffset: (offset: string) => void
  setFps: (fps: number) => void
}

function mapCue(project: Project, cueId: string, fn: (cue: Cue) => Cue): Project {
  return { ...project, cues: project.cues.map((c) => (c.id === cueId ? fn(c) : c)) }
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
      update(
        (p) => mapCue(p, cueId, (c) => ({ ...c, start: Math.min(Math.max(0, time), c.end - EPS) })),
        `start:${cueId}`,
      ),
    setCueEnd: (cueId, time) =>
      update(
        (p) => mapCue(p, cueId, (c) => ({ ...c, end: Math.max(time, c.start + EPS) })),
        `end:${cueId}`,
      ),
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
      const speaker: Speaker = { id: newId(), name, color: '#888888' }
      update((p) => ({ ...p, speakers: [...p.speakers, speaker] }))
      return speaker
    },

    setTimecodeOffset: (offset) => update((p) => ({ ...p, timecodeOffset: offset }), 'offset'),
    setFps: (fps) => update((p) => ({ ...p, fps })),
  }
})
