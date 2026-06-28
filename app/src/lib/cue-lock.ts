import type { Cue } from "../types";
import { useLockReviewedStore } from "../store/lock-reviewed";

/** Reviewed cues cannot be edited when lock-reviewed mode is on. */
export function isReviewedCueLocked(cue: Cue): boolean {
  return useLockReviewedStore.getState().enabled && !!cue.reviewed;
}
