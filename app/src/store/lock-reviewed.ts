import { create } from "zustand";
import {
  readLockReviewedCues,
  writeLockReviewedCues,
} from "../lib/lock-reviewed-settings";

interface LockReviewedState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

export const useLockReviewedStore = create<LockReviewedState>((set, get) => ({
  enabled: readLockReviewedCues(),
  setEnabled: (enabled) => {
    writeLockReviewedCues(enabled);
    set({ enabled });
  },
  toggle: () => get().setEnabled(!get().enabled),
}));
