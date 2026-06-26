import type { DiarizedExportOptions } from './export-format'
import type { Project, Speaker } from '../types'
import { cuePlainText, speakerForCue, speakerRoleName } from './export-text'
import { contentStartSeconds, fileTimeToProgramTime } from './program-start'

/** WebVTT timestamp HH:MM:SS.mmm */
function vttTime(seconds: number): string {
  const total = Math.max(0, seconds)
  const ms = Math.round((total - Math.floor(total)) * 1000)
  const s = Math.floor(total) % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
}

function vttClassName(speaker: Speaker): string {
  const slug = speaker.id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `spk-${slug}`
}

function escapeVttText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Export WebVTT with optional per-speaker CSS colors and voice tags. */
export function exportVtt(project: Project, options: DiarizedExportOptions): string {
  const { speakerLabels, speakerColors } = options
  const classBySpeakerId = new Map<string, string>()
  const styleRules: string[] = []

  if (speakerColors) {
    for (const speaker of project.speakers) {
      const cls = vttClassName(speaker)
      classBySpeakerId.set(speaker.id, cls)
      styleRules.push(`::cue(.${cls}) { color: ${speaker.color}; }`)
    }
  }

  const contentStart = contentStartSeconds(project)
  const cues = project.cues.map((cue) => {
    const text = escapeVttText(cuePlainText(cue))
    const speaker = speakerForCue(project, cue)
    const voice = speakerLabels && speaker ? speakerRoleName(project, cue) : ''

    let body = text
    if (speaker) {
      if (speakerColors && voice) {
        const cls = classBySpeakerId.get(speaker.id)!
        body = `<c.${cls}><v ${voice}>${text}`
      } else if (speakerColors) {
        const cls = classBySpeakerId.get(speaker.id)!
        body = `<c.${cls}>${text}`
      } else if (voice) {
        body = `<v ${voice}>${text}`
      }
    }

    return `${vttTime(fileTimeToProgramTime(cue.start, contentStart))} --> ${vttTime(fileTimeToProgramTime(cue.end, contentStart))}\n${body}\n`
  })

  const blocks = ['WEBVTT', '']
  if (speakerColors && styleRules.length > 0) {
    blocks.push('STYLE', ...styleRules, '')
  }
  blocks.push(...cues)

  return blocks.join('\n')
}
