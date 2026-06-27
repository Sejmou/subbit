import { create } from "zustand";
import {
  parseWaveformDat,
  type ParsedWaveformPeaks,
} from "../lib/waveform-peaks";
import {
  loadStoredWaveform,
  saveStoredWaveform,
} from "../lib/project-storage";
import type { CachedWaveformPeaks } from "../lib/waveform-cache";

interface WaveformState {
  peaks: ParsedWaveformPeaks | null;
  projectId: string | null;
  sourceName: string | null;
  setPeaks: (
    parsed: ParsedWaveformPeaks,
    sourceName: string,
    projectId: string | null,
  ) => void;
  clearPeaks: () => void;
  /** Restore peaks stored for this project (IndexedDB). */
  restoreForProject: (projectId: string) => Promise<boolean>;
  /** Persist peaks for this project — call on import only, not on edit. */
  persistForProject: (projectId: string) => Promise<void>;
  peaksJsInput: () => CachedWaveformPeaks["input"] | null;
}

function peaksFromCached(cached: CachedWaveformPeaks): ParsedWaveformPeaks {
  if (cached.input.kind === "json") {
    const { json } = cached.input;
    return {
      input: cached.input,
      meta: {
        duration: (json.length * json.samples_per_pixel) / json.sample_rate,
        sampleRate: json.sample_rate,
        samplesPerPixel: json.samples_per_pixel,
        length: json.length,
        bits: 8,
        channels: json.channels ?? 1,
      },
    };
  }
  return parseWaveformDat(cached.input.arrayBuffer);
}

export const useWaveform = create<WaveformState>((set, getState) => ({
  peaks: null,
  projectId: null,
  sourceName: null,

  setPeaks: (parsed, sourceName, projectId) =>
    set({ peaks: parsed, sourceName, projectId }),

  clearPeaks: () => set({ peaks: null, sourceName: null, projectId: null }),

  restoreForProject: async (projectId) => {
    const cached = await loadStoredWaveform(projectId);
    if (!cached) return false;
    set({
      peaks: peaksFromCached(cached),
      sourceName: "(stored)",
      projectId,
    });
    return true;
  },

  persistForProject: async (projectId) => {
    const { peaks } = getState();
    if (!peaks) return;
    await saveStoredWaveform(projectId, {
      input: peaks.input,
      cachedAt: new Date().toISOString(),
    });
    set({ projectId });
  },

  peaksJsInput: () => getState().peaks?.input ?? null,
}));
