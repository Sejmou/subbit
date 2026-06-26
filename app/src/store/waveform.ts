import { create } from 'zustand'
import { parseWaveformDat, type ParsedWaveformPeaks } from '../lib/waveform-peaks'
import {
  cacheWaveformPeaks,
  getCachedWaveformPeaks,
  waveformCacheKey,
  type CachedWaveformPeaks,
} from '../lib/waveform-cache'
import type { VideoIdentity } from '../types'

interface WaveformState {
  peaks: ParsedWaveformPeaks | null
  cacheKey: string | null
  sourceName: string | null
  setPeaks: (parsed: ParsedWaveformPeaks, sourceName: string, cacheKey: string | null) => void
  clearPeaks: () => void
  /** Restore peaks from IndexedDB when video identity is known. */
  restoreFromCache: (identity: VideoIdentity) => Promise<boolean>
  /** Persist current peaks to IndexedDB. */
  persistToCache: () => Promise<void>
  /** peaks.js-ready payload, or null when no peaks loaded. */
  peaksJsInput: () => CachedWaveformPeaks['input'] | null
}

export const useWaveform = create<WaveformState>((set, getState) => ({
  peaks: null,
  cacheKey: null,
  sourceName: null,

  setPeaks: (parsed, sourceName, cacheKey) => set({ peaks: parsed, sourceName, cacheKey }),

  clearPeaks: () => set({ peaks: null, sourceName: null, cacheKey: null }),

  restoreFromCache: async (identity) => {
    const key = waveformCacheKey(identity)
    const cached = await getCachedWaveformPeaks(key)
    if (!cached) return false

    if (cached.input.kind === 'json') {
      const { json } = cached.input
      const parsed: ParsedWaveformPeaks = {
        input: cached.input,
        meta: {
          duration: (json.length * json.samples_per_pixel) / json.sample_rate,
          sampleRate: json.sample_rate,
          samplesPerPixel: json.samples_per_pixel,
          length: json.length,
          bits: 8,
          channels: json.channels ?? 1,
        },
      }
      set({ peaks: parsed, sourceName: '(cached)', cacheKey: key })
      return true
    }

    const parsed = parseWaveformDat(cached.input.arrayBuffer)
    set({ peaks: parsed, sourceName: '(cached)', cacheKey: key })
    return true
  },

  persistToCache: async () => {
    const { peaks, cacheKey } = getState()
    if (!peaks || !cacheKey) return
    await cacheWaveformPeaks(cacheKey, peaks)
  },

  peaksJsInput: () => getState().peaks?.input ?? null,
}))

export { waveformCacheKey }
