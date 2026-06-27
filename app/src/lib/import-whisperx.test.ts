import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importWhisperx, parseWhisperxData, whisperxSchema } from './import-whisperx'

describe('parseWhisperxData', () => {
  it('accepts a minimal valid whisperx file', () => {
    expect(
      parseWhisperxData({
        segments: [{ start: 0, end: 1, text: 'hello' }],
      }),
    ).toBeTruthy()
  })

  it('rejects missing segments', () => {
    expect(() => parseWhisperxData({ language: 'en' })).toThrow(/Not a valid whisperx file/)
  })

  it('rejects segments without timing', () => {
    expect(() => parseWhisperxData({ segments: [{ text: 'hello' }] })).toThrow(/Not a valid whisperx file/)
  })
})

describe('importWhisperx', () => {
  it('auto-assigns speaker when word duration share is high enough', () => {
    const project = importWhisperx(
      {
        segments: [
          {
            start: 0,
            end: 4,
            text: 'hello',
            words: [
              { word: 'hel', start: 0, end: 3, speaker: 'A' },
              { word: 'lo', start: 3, end: 4, speaker: 'B' },
            ],
          },
        ],
      },
      'movie.mp4',
    )
    expect(project.cues[0].inferredSpeaker).toEqual({ speakerId: 'A', confidence: 0.75 })
    expect(project.cues[0].speakerId).toBe('A')
  })

  it('leaves speakerId empty when confidence is below threshold', () => {
    const project = importWhisperx(
      {
        segments: [
          {
            start: 0,
            end: 10,
            text: 'hello',
            words: [
              { word: 'hel', start: 0, end: 6, speaker: 'A' },
              { word: 'lo', start: 6, end: 10, speaker: 'B' },
            ],
          },
        ],
      },
      'movie.mp4',
    )
    expect(project.cues[0].inferredSpeaker).toEqual({ speakerId: 'A', confidence: 0.6 })
    expect(project.cues[0].speakerId).toBeNull()
  })
})

describe('real whisperx file', () => {
  it('validates data/subs/audio.json', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
    const data = JSON.parse(readFileSync(join(root, 'data/subs/audio.json'), 'utf8'))
    expect(whisperxSchema.safeParse(data).success).toBe(true)
    expect(importWhisperx(parseWhisperxData(data), 'movie.mp4').cues.length).toBeGreaterThan(0)
  })
})
