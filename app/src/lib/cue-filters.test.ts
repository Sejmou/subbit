import { describe, expect, it } from 'vitest'
import type { Cue } from '../types'
import {
  activeFilterCount,
  cueMatchesListFilters,
  cueMatchesReviewStatusFilter,
  hasActiveFilters,
} from './cue-filters'

const cue = (reviewed: boolean): Cue => ({
  id: 'c1',
  start: 0,
  end: 1,
  speakerId: 'A',
  reviewed,
  segments: [{ text: 'x', shot: 'ON' }],
})

describe('cue filters', () => {
  it('filters by review status', () => {
    expect(cueMatchesReviewStatusFilter(cue(true), new Set())).toBe(true)
    expect(cueMatchesReviewStatusFilter(cue(false), new Set())).toBe(true)

    expect(cueMatchesReviewStatusFilter(cue(true), new Set(['reviewed']))).toBe(true)
    expect(cueMatchesReviewStatusFilter(cue(false), new Set(['reviewed']))).toBe(false)

    expect(cueMatchesReviewStatusFilter(cue(false), new Set(['not-reviewed']))).toBe(true)
    expect(cueMatchesReviewStatusFilter(cue(true), new Set(['not-reviewed']))).toBe(false)

    expect(cueMatchesReviewStatusFilter(cue(true), new Set(['reviewed', 'not-reviewed']))).toBe(true)
    expect(cueMatchesReviewStatusFilter(cue(false), new Set(['reviewed', 'not-reviewed']))).toBe(true)
  })

  it('combines role and status filters', () => {
    const reviewedA = { ...cue(true), speakerId: 'A' }
    const unreviewedB = { ...cue(false), speakerId: 'B' }

    expect(cueMatchesListFilters(reviewedA, ['A'], ['reviewed'])).toBe(true)
    expect(cueMatchesListFilters(unreviewedB, ['A'], ['reviewed'])).toBe(false)
    expect(cueMatchesListFilters(unreviewedB, ['B'], ['reviewed'])).toBe(false)
    expect(cueMatchesListFilters(unreviewedB, ['B'], ['not-reviewed'])).toBe(true)
  })

  it('counts active filters', () => {
    expect(activeFilterCount([], [])).toBe(0)
    expect(activeFilterCount(['A'], ['reviewed'])).toBe(2)
    expect(hasActiveFilters([], ['not-reviewed'])).toBe(true)
  })
})
