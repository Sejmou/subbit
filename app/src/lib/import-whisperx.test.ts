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

describe('real whisperx file', () => {
  it('validates data/subs/audio.json', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
    const data = JSON.parse(readFileSync(join(root, 'data/subs/audio.json'), 'utf8'))
    expect(whisperxSchema.safeParse(data).success).toBe(true)
    expect(importWhisperx(parseWhisperxData(data), 'movie.mp4').cues.length).toBeGreaterThan(0)
  })
})
