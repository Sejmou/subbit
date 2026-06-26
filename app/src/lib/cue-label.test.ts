import { describe, expect, it } from 'vitest'
import { cueLabelText, cueLabelTextShort } from './cue-label'

describe('cueLabelText', () => {
  it('joins segment text', () => {
    expect(
      cueLabelText({
        id: '1',
        start: 0,
        end: 1,
        speakerId: null,
        segments: [
          { text: 'Hello', shot: 'ON' },
          { text: 'world', shot: 'OFF' },
        ],
      }),
    ).toBe('Hello world')
  })
})

describe('cueLabelTextShort', () => {
  it('truncates long labels', () => {
    const long = 'a'.repeat(100)
    expect(cueLabelTextShort({ id: '1', start: 0, end: 1, speakerId: null, segments: [{ text: long, shot: 'ON' }] }, 20)).toHaveLength(20)
    expect(cueLabelTextShort({ id: '1', start: 0, end: 1, speakerId: null, segments: [{ text: long, shot: 'ON' }] }, 20).endsWith('…')).toBe(true)
  })
})
