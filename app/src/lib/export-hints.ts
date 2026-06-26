import type { ExportFormatInfo } from './export-format'
import { secondsToTimecode } from './timecode'

const PROGRAM_START_BASE =
  'Program start skips leader/black at the head of the file. Cue In/Out in the editor stay on the file timeline; only exported times count from program start.'

export function exportFormatHint(info: ExportFormatInfo, contentStart: number, fps: number): string {
  const parts = [info.hint]

  if (contentStart > 0) {
    const skip = secondsToTimecode(contentStart, fps, '00:00:00:00')
    parts.push(`Program start is set at file ${skip}; export times subtract this leader.`)
  } else {
    parts.push('No program start set — export times match the file from 00:00:00.')
  }

  if (info.usesDeliveryOffset) {
    parts.push('Broadcast offset is added on top for SMPTE delivery timecodes.')
  } else {
    parts.push('Export uses program time from 00:00:00 (no broadcast offset in this format).')
  }

  parts.push(PROGRAM_START_BASE)
  return parts.join(' ')
}

/** One-line summary for the export preview block. */
export function exportPreviewSummary(
  fileStart: number,
  fileEnd: number,
  contentStart: number,
  fps: number,
  timecodeOffset: string,
  usesDeliveryOffset: boolean,
): { programIn: string; programOut: string; deliveryIn?: string; deliveryOut?: string } {
  const programInSec = Math.max(0, fileStart - contentStart)
  const programOutSec = Math.max(0, fileEnd - contentStart)
  const programIn = secondsToTimecode(programInSec, fps, '00:00:00:00')
  const programOut = secondsToTimecode(programOutSec, fps, '00:00:00:00')

  if (!usesDeliveryOffset) {
    return { programIn, programOut }
  }

  return {
    programIn,
    programOut,
    deliveryIn: secondsToTimecode(programInSec, fps, timecodeOffset),
    deliveryOut: secondsToTimecode(programOutSec, fps, timecodeOffset),
  }
}
