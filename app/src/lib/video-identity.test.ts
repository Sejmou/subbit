import { describe, expect, it } from 'vitest'
import {
  compareVideoIdentity,
  formatVideoMismatchMessage,
  isLegacyVideoIdentity,
} from './video-identity'
import type { VideoIdentity } from '../types'

describe('compareVideoIdentity', () => {
  it('passes when only the filename differs', () => {
    const stored: VideoIdentity = {
      fileName: 'movie.mp4',
      duration: 120.5,
      frameRateNumerator: 25,
      frameRateDenominator: 1,
    }
    const current: VideoIdentity = {
      fileName: 'final-cut-v3.mp4',
      duration: 120.5,
      frameRateNumerator: 25,
      frameRateDenominator: 1,
    }
    expect(compareVideoIdentity(stored, current)).toEqual({ ok: true })
  })

  it('passes when file size or fingerprint differ but timeline matches', () => {
    const stored: VideoIdentity = {
      duration: 100,
      frameRateNumerator: 25,
      frameRateDenominator: 1,
      fileSize: 999,
      fingerprint: 'legacy',
      fingerprintVersion: 1,
    }
    const current: VideoIdentity = {
      duration: 100,
      frameRateNumerator: 25,
      frameRateDenominator: 1,
    }
    expect(compareVideoIdentity(stored, current)).toEqual({ ok: true })
  })

  it('fails when duration differs beyond tolerance', () => {
    const stored: VideoIdentity = { duration: 100, frameRateNumerator: 25, frameRateDenominator: 1 }
    const current: VideoIdentity = { duration: 100.2, frameRateNumerator: 25, frameRateDenominator: 1 }
    const result = compareVideoIdentity(stored, current)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes('duration'))).toBe(true)
    }
  })

  it('fails when frame rate differs', () => {
    const stored: VideoIdentity = { duration: 100, frameRateNumerator: 25, frameRateDenominator: 1 }
    const current: VideoIdentity = { duration: 100, frameRateNumerator: 24000, frameRateDenominator: 1001 }
    const result = compareVideoIdentity(stored, current)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes('frame rate'))).toBe(true)
    }
  })

  it('skips frame rate when only one side has it', () => {
    const stored: VideoIdentity = { duration: 100 }
    const current: VideoIdentity = {
      duration: 100,
      frameRateNumerator: 25,
      frameRateDenominator: 1,
    }
    expect(compareVideoIdentity(stored, current)).toEqual({ ok: true })
  })

  it('treats 24000/1001 and nearby floats as matching', () => {
    const a: VideoIdentity = { duration: 10, frameRateNumerator: 24000, frameRateDenominator: 1001 }
    const b: VideoIdentity = { duration: 10, frameRateNumerator: 24000, frameRateDenominator: 1001 }
    expect(compareVideoIdentity(a, b)).toEqual({ ok: true })
  })
})

describe('isLegacyVideoIdentity', () => {
  it('detects old sparse-hash records', () => {
    expect(isLegacyVideoIdentity({ duration: 1, fingerprint: 'abc' })).toBe(true)
    expect(isLegacyVideoIdentity({ duration: 1, frameRateNumerator: 25, frameRateDenominator: 1 })).toBe(
      false,
    )
  })
})

describe('formatVideoMismatchMessage', () => {
  it('joins reasons into a sentence', () => {
    expect(formatVideoMismatchMessage(['duration differs'])).toMatch(/duration differs/)
  })
})
