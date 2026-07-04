import { create } from "zustand";
import type { ReviewStatusFilter } from "../lib/cue-filters";

function toggleInList<T>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

function pruneList<T>(list: readonly T[], valid: ReadonlySet<T>): T[] {
  const next = list.filter((id) => valid.has(id));
  return next.length === list.length ? [...list] : next;
}

interface CueListFiltersState {
  speakerFilter: string[];
  statusFilter: ReviewStatusFilter[];
  shotFilter: string[];
  toggleSpeakerFilter: (speakerId: string) => void;
  toggleShotFilter: (shotId: string) => void;
  toggleStatusFilter: (status: ReviewStatusFilter) => void;
  clearFilters: () => void;
  pruneSpeakerFilter: (validIds: readonly string[]) => void;
  pruneShotFilter: (validIds: readonly string[]) => void;
}

export const useCueListFiltersStore = create<CueListFiltersState>((set) => ({
  speakerFilter: [],
  statusFilter: [],
  shotFilter: [],
  toggleSpeakerFilter: (speakerId) =>
    set((s) => ({
      speakerFilter: toggleInList(s.speakerFilter, speakerId),
    })),
  toggleShotFilter: (shotId) =>
    set((s) => ({
      shotFilter: toggleInList(s.shotFilter, shotId),
    })),
  toggleStatusFilter: (status) =>
    set((s) => ({
      statusFilter: toggleInList(s.statusFilter, status),
    })),
  clearFilters: () =>
    set({ speakerFilter: [], statusFilter: [], shotFilter: [] }),
  pruneSpeakerFilter: (validIds) =>
    set((s) => ({
      speakerFilter: pruneList(s.speakerFilter, new Set(validIds)),
    })),
  pruneShotFilter: (validIds) =>
    set((s) => ({
      shotFilter: pruneList(s.shotFilter, new Set(validIds)),
    })),
}));
