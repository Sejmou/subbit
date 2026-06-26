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

interface ProjectState {
  project: Project | null
  selectedCueId: string | null
  /** Active segment within the selected cue (for shot assignment / splitting). */
  selectedSegment: number
  dirty: boolean
  lastSavedAt: number | null

  loadProject: (project: Project) => void
  markSaved: () => void

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

export const useProject = create<ProjectState>((set, getState) => {
  const update = (fn: (p: Project) => Project) =>
    set((state) => (state.project ? { project: fn(state.project), dirty: true } : state))

  return {
    project: null,
    selectedCueId: null,
    selectedSegment: 0,
    dirty: false,
    lastSavedAt: null,

    loadProject: (project) =>
      set({
        project,
        selectedCueId: project.cues[0]?.id ?? null,
        selectedSegment: 0,
        dirty: false,
        lastSavedAt: null,
      }),
    markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

    selectCue: (id) => set({ selectedCueId: id, selectedSegment: 0 }),
    selectSegment: (index) => set({ selectedSegment: Math.max(0, index) }),

    setSegmentText: (cueId, segIndex, text) =>
      update((p) =>
        mapCue(p, cueId, (c) => ({
          ...c,
          segments: c.segments.map((s, i) => (i === segIndex ? { ...s, text } : s)),
        })),
      ),

    setCueStart: (cueId, time) =>
      update((p) =>
        mapCue(p, cueId, (c) => ({ ...c, start: Math.min(Math.max(0, time), c.end - EPS) })),
      ),
    setCueEnd: (cueId, time) =>
      update((p) => mapCue(p, cueId, (c) => ({ ...c, end: Math.max(time, c.start + EPS) }))),
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
          segments: [...a.segments, ...b.segments],
          words: a.words || b.words ? [...(a.words ?? []), ...(b.words ?? [])] : undefined,
          reviewed: false,
          multiSpeaker: a.multiSpeaker || b.multiSpeaker,
        }
        const cues = [...p.cues.slice(0, idx), merged, ...p.cues.slice(idx + 2)]
        return { ...p, cues }
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
          const merged: Segment = { text: `${prev.text} ${cur.text}`.trim(), shot: prev.shot }
          const segments = [
            ...c.segments.slice(0, segIndex - 1),
            merged,
            ...c.segments.slice(segIndex + 1),
          ]
          return { ...c, segments }
        }),
      ),

    renameSpeaker: (id, name) =>
      update((p) => ({
        ...p,
        speakers: p.speakers.map((s) => (s.id === id ? { ...s, name } : s)),
      })),
    setSpeakerColor: (id, color) =>
      update((p) => ({
        ...p,
        speakers: p.speakers.map((s) => (s.id === id ? { ...s, color } : s)),
      })),
    addSpeaker: (name) => {
      const speaker: Speaker = { id: newId(), name, color: '#888888' }
      update((p) => ({ ...p, speakers: [...p.speakers, speaker] }))
      return speaker
    },

    setTimecodeOffset: (offset) => update((p) => ({ ...p, timecodeOffset: offset })),
    setFps: (fps) => update((p) => ({ ...p, fps })),
  }
})
