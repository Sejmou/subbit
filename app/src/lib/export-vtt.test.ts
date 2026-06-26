import { describe, expect, it } from 'vitest'
import { exportVtt } from './export-vtt'
import type { Project } from '../types'

const project: Project = {
  version: 1,
  videoName: 'movie.mp4',
  fps: 25,
  timecodeOffset: '10:00:00:00',
  defaultShot: 'ON',
  shots: [{ id: 'ON', label: 'On-screen' }],
  speakers: [{ id: 'SPEAKER_00', name: 'Alice', color: '#e6194b' }],
  cues: [
    {
      id: 'c1',
      start: 1,
      end: 4,
      speakerId: 'SPEAKER_00',
      segments: [{ text: 'Hello', shot: 'ON' }],
    },
  ],
}

import { DEFAULT_DIARIZED_EXPORT_OPTIONS } from './export-format'

describe('exportVtt', () => {
  it('emits WEBVTT with speaker CSS and voice tags', () => {
    const out = exportVtt(project, DEFAULT_DIARIZED_EXPORT_OPTIONS)
    expect(out.startsWith('WEBVTT')).toBe(true)
    expect(out).toContain('::cue(.spk-SPEAKER_00) { color: #e6194b; }')
    expect(out).toContain('00:00:01.000 --> 00:00:04.000')
    expect(out).toContain('<c.spk-SPEAKER_00><v Alice>Hello')
  })

  it('omits speaker styling when disabled', () => {
    const out = exportVtt(project, { speakerLabels: false, speakerColors: false })
    expect(out).not.toContain('STYLE')
    expect(out).not.toContain('<v ')
    expect(out).toContain('Hello')
  })

  it('keeps voice tags without colors', () => {
    const out = exportVtt(project, { speakerLabels: true, speakerColors: false })
    expect(out).not.toContain('STYLE')
    expect(out).toContain('<v Alice>Hello')
    expect(out).not.toContain('<c.')
  })
})
