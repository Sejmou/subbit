import { get, set, del } from 'idb-keyval'
import type { VideoIdentity } from '../types'
import type { ParsedWaveformPeaks, WaveformPeaksInput } from './waveform-peaks'

const CACHE_PREFIX = 'subbit:waveform:'

/** Stable cache key from video identity (same pattern as project video matching). */
export function waveformCacheKey(identity: VideoIdentity): string {
  const fps =
    identity.frameRateNumerator !== undefined && identity.frameRateDenominator !== undefined
      ? `${identity.frameRateNumerator}/${identity.frameRateDenominator}`
      : 'unknown'
  return `${CACHE_PREFIX}${identity.duration.toFixed(3)}:${fps}`
}

export interface CachedWaveformPeaks {
  input: WaveformPeaksInput
  /** ISO timestamp when cached. */
  cachedAt: string
}

export async function getCachedWaveformPeaks(key: string): Promise<CachedWaveformPeaks | undefined> {
  return get<CachedWaveformPeaks>(key)
}

export async function cacheWaveformPeaks(key: string, parsed: ParsedWaveformPeaks): Promise<void> {
  const entry: CachedWaveformPeaks = {
    input: parsed.input,
    cachedAt: new Date().toISOString(),
  }
  await set(key, entry)
}

export async function clearCachedWaveformPeaks(key: string): Promise<void> {
  await del(key)
}
