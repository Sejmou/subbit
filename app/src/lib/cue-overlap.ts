import type { Cue } from "../types";
import { cueEndSeconds, cueStartSeconds } from "./cue-timing";

/**
 * Tolerance (media seconds) below which a shared boundary is treated as
 * *abutment*, not overlap. Joined cues (`joinedToPrev`) abut exactly
 * (`prev.end === this.start`); a tiny epsilon also absorbs float noise from
 * frame snapping so an abutting pair is never flagged. Real overlaps are
 * frame-sized (>= ~16ms), well above this floor.
 */
export const CUE_OVERLAP_EPSILON = 1e-6;

/** Cues sorted by start, then end, then id — a stable order for the sweep. */
function sortedByStart(cues: readonly Cue[]): Cue[] {
  return [...cues].sort((a, b) => {
    const ds = cueStartSeconds(a) - cueStartSeconds(b);
    if (ds !== 0) return ds;
    const de = cueEndSeconds(a) - cueEndSeconds(b);
    if (de !== 0) return de;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Ids of every cue that overlaps at least one other cue. Sweep-line over
 * start-sorted cues: O(n log n) plus the number of overlapping pairs.
 */
export function findOverlappingCueIds(
  cues: readonly Cue[],
  epsilon = CUE_OVERLAP_EPSILON,
): Set<string> {
  const overlapping = new Set<string>();
  const sorted = sortedByStart(cues);
  // Cues seen so far whose end is still ahead of the current cue's start.
  let active: Cue[] = [];
  for (const cue of sorted) {
    const start = cueStartSeconds(cue);
    active = active.filter((a) => cueEndSeconds(a) - start > epsilon);
    for (const a of active) {
      // `a` starts no later than `cue` and ends after it — they overlap.
      overlapping.add(a.id);
      overlapping.add(cue.id);
    }
    active.push(cue);
  }
  return overlapping;
}
