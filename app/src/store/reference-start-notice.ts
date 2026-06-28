import { create } from "zustand";

interface State {
  invalidCueCount: number | null;
  notifyInvalidCues: (count: number) => void;
  dismiss: () => void;
}

/** One-shot notice after subtitle start leaves cues before subtitle zero. */
export const useReferenceStartNoticeStore = create<State>((set) => ({
  invalidCueCount: null,
  notifyInvalidCues: (count) => {
    if (count > 0) set({ invalidCueCount: count });
  },
  dismiss: () => set({ invalidCueCount: null }),
}));
