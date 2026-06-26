import type { Cue, Project } from '../types'
import { secondsToTimecode, timecodeToSeconds } from './timecode'

export const PROGRAM_START_POINT_ID = 'program-start'

/** Seconds into the file where exported program time 0:00:00:00 begins. */
export function contentStartSeconds(project: Project): number {
  return project.contentStartSeconds ?? 0
}

/** File timeline seconds → program seconds for export (clamped at zero). */
export function fileTimeToProgramTime(fileSeconds: number, contentStart: number): number {
  return Math.max(0, fileSeconds - contentStart)
}

export function programStartTimecode(project: Project): string {
  const start = contentStartSeconds(project)
  if (start <= 0) return '00:00:00:00'
  return secondsToTimecode(start, project.fps, '00:00:00:00')
}

export function parseProgramStartTimecode(tc: string, fps: number): number {
  const trimmed = tc.trim()
  if (!trimmed || trimmed === '00:00:00:00') return 0
  return timecodeToSeconds(trimmed, fps)
}

export function cuesBeforeProgramStart(project: Project): Cue[] {
  const start = contentStartSeconds(project)
  if (start <= 0) return []
  return project.cues.filter((c) => c.start < start)
}

export function clampProgramStart(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  if (!Number.isFinite(duration) || duration <= 0) return seconds
  return Math.min(seconds, Math.max(0, duration - 1 / 25))
}
