import type { Cue, Project, Speaker } from '../types'

/** Plain dialogue text for subtitle exports (no shot metadata). */
export function cuePlainText(cue: Cue): string {
  return cue.segments.map((s) => s.text.trim()).join(' ').trim()
}

export function speakerForCue(project: Project, cue: Cue): Speaker | undefined {
  if (!cue.speakerId) return undefined
  return project.speakers.find((s) => s.id === cue.speakerId)
}

/** Display name used as Rolle / voice label in exports. */
export function speakerRoleName(project: Project, cue: Cue): string {
  const speaker = speakerForCue(project, cue)
  return speaker?.name?.trim() || cue.speakerId || ''
}
