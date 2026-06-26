import type { Cue } from '../types'
import { findActiveCueIndex } from './active-cue'

const EPS = 0.001

/** Default length for cues created by double-clicking the timeline. */
export const TIMELINE_NEW_CUE_DURATION = 1.5

export function computeInsertCueRange(
  cues: Cue[],
  start: number,
  duration: number,
  maxTime = Infinity,
): { start: number; end: number } | null {
  if (!Number.isFinite(start) || start < 0 || duration <= 0) return null
  if (findActiveCueIndex(cues, start) >= 0) return null

  const nextCue = cues.find((c) => c.start > start)
  const endCap = Math.min(nextCue?.start ?? maxTime, maxTime)
  const end = Math.min(start + duration, endCap)

  if (end - start <= EPS) return null
  return { start, end }
}

/** Index at which a new cue [start, end) belongs in a sorted cue list. */
export function findInsertCueIndex(cues: Cue[], start: number): number {
  const insertIdx = cues.findIndex((c) => c.start >= start)
  return insertIdx === -1 ? cues.length : insertIdx
}
