import type { Cue } from '../types'

const EPS = 0.001

/** Infer a split time at the boundary before `segIndex`, using words when available. */
export function splitTimeAtSegment(cue: Cue, segIndex: number): number {
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

/** Index of the segment visible at time `t` within a cue (handles mid-cue shot changes). */
export function activeSegmentIndex(cue: Cue, t: number): number {
  if (cue.segments.length <= 1) return 0
  for (let i = cue.segments.length - 1; i >= 0; i--) {
    if (t >= splitTimeAtSegment(cue, i)) return i
  }
  return 0
}
