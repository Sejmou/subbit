import type { Cue } from '../types'

/** Plain subtitle text for timeline labels and exports. */
export function cueLabelText(cue: Cue): string {
  return cue.segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(' ')
}

/** Truncate for narrow timeline overlays. */
export function cueLabelTextShort(cue: Cue, maxLen = 80): string {
  const text = cueLabelText(cue)
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}
