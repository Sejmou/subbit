import type { Cue, Project } from '../types'

/** Whether a speaker id appears on a cue or in merged segment metadata. */
export function isSpeakerReferenced(project: Project, speakerId: string): boolean {
  for (const cue of project.cues) {
    if (cueReferencesSpeaker(cue, speakerId)) return true
  }
  return false
}

export function cueReferencesSpeaker(cue: Cue, speakerId: string): boolean {
  if (cue.speakerId === speakerId) return true
  return cue.segments.some((seg) => seg.mergedSpeakerId === speakerId)
}

/** When `filter` is empty, every cue matches (no filter active). */
export function cueMatchesSpeakerFilter(cue: Cue, filter: ReadonlySet<string>): boolean {
  if (filter.size === 0) return true
  for (const id of filter) {
    if (cueReferencesSpeaker(cue, id)) return true
  }
  return false
}
